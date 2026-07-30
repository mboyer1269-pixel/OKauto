import { beforeEach, describe, expect, it } from "vitest";
import { applyImportItems } from "../services/sync.js";
import { runSoldDetection } from "../services/sold-detection.js";
import { notificationHub } from "../modules/notifications/hub.js";
import { resetDb, testPrisma } from "./helpers.js";

const prisma = testPrisma();

beforeEach(async () => {
  await resetDb();
});

async function setupOrgWithFeedSource() {
  const user = await prisma.user.create({
    data: { email: "det@test.dev", name: "Det", passwordHash: "x" },
  });
  const org = await prisma.organization.create({
    data: {
      name: "Det Motors",
      slug: "det-motors",
      memberships: { create: { userId: user.id, role: "ORG_OWNER" } },
    },
  });
  const source = await prisma.importSource.create({
    data: { orgId: org.id, type: "JSON_FEED", name: "Feed", config: { feedUrl: "https://feed.test/x" } },
  });
  return { user, org, source };
}

describe("sold detection (full feed lifecycle)", () => {
  it("flags vehicles missing from the next sync and alerts stakeholders", async () => {
    const { user, org, source } = await setupOrgWithFeedSource();

    // Sync 1: two vehicles arrive.
    const stats1 = await applyImportItems(
      prisma,
      [
        { stockNumber: "D-1", make: "Honda", model: "Civic", priceCents: 1100000 },
        { stockNumber: "D-2", make: "Ford", model: "Escape", priceCents: 1600000 },
      ],
      { orgId: org.id, sourceId: source.id, actor: { type: "SYSTEM" }, maxPhotos: 10, hub: notificationHub },
    );
    expect(stats1.created).toBe(2);

    // Mark the source's last successful run, then sync 2: D-1 disappears.
    const runStart = new Date(Date.now() + 1000);
    await prisma.importSource.update({
      where: { id: source.id },
      data: { lastRunAt: runStart, lastStatus: "SUCCEEDED" },
    });
    await applyImportItems(
      prisma,
      [{ stockNumber: "D-2", make: "Ford", model: "Escape", priceCents: 1600000 }],
      { orgId: org.id, sourceId: source.id, actor: { type: "SYSTEM" }, maxPhotos: 10, hub: notificationHub },
    );
    // Ensure D-2's lastSeenAt is now (after the run start marker).
    await prisma.vehicle.updateMany({ where: { stockNumber: "D-2" }, data: { lastSeenAt: new Date(Date.now() + 2000) } });

    // D-1 has a LIVE listing assigned to the owner.
    const d1 = await prisma.vehicle.findFirstOrThrow({ where: { orgId: org.id, stockNumber: "D-1" } });
    await prisma.listing.create({
      data: {
        orgId: org.id,
        vehicleId: d1.id,
        status: "LIVE",
        title: "Honda Civic",
        assigneeId: user.id,
        createdById: user.id,
        postedAt: new Date(),
      },
    });

    const report = await runSoldDetection(prisma, notificationHub, org.id);
    expect(report.vehiclesFlagged).toBe(1);
    expect(report.listingsFlagged).toBe(1);
    expect(report.notificationsSent).toBe(1);

    const flagged = await prisma.vehicle.findUnique({ where: { id: d1.id } });
    expect(flagged?.status).toBe("SUSPECTED_SOLD");

    const listing = await prisma.listing.findFirst({ where: { vehicleId: d1.id } });
    expect(listing?.status).toBe("NEEDS_REMOVAL");
    const event = await prisma.listingEvent.findFirst({ where: { listingId: listing!.id, toStatus: "NEEDS_REMOVAL" } });
    expect(event?.actorType).toBe("SYSTEM");

    const notif = await prisma.notification.findFirst({
      where: { orgId: org.id, type: "SOLD_SUSPECTED", userId: user.id },
    });
    expect(notif).not.toBeNull();
    expect(notif?.title).toContain("Honda Civic");

    // D-2 remains ACTIVE.
    const d2 = await prisma.vehicle.findFirstOrThrow({ where: { stockNumber: "D-2" } });
    expect(d2.status).toBe("ACTIVE");

    // Idempotent: second sweep flags nothing new.
    const again = await runSoldDetection(prisma, notificationHub, org.id);
    expect(again.vehiclesFlagged).toBe(0);
  });

  it("does not flag vehicles from WEBHOOK sources (push semantics)", async () => {
    const { org } = await setupOrgWithFeedSource();
    const webhookSource = await prisma.importSource.create({
      data: {
        orgId: org.id,
        type: "WEBHOOK",
        name: "Push",
        config: { webhookSecret: "s" },
        lastRunAt: new Date(),
        lastStatus: "SUCCEEDED",
      },
    });
    await prisma.vehicle.create({
      data: {
        orgId: org.id,
        sourceId: webhookSource.id,
        stockNumber: "W-9",
        make: "Kia",
        model: "Soul",
        priceCents: 900000,
        lastSeenAt: new Date(Date.now() - 86400_000),
      },
    });
    const report = await runSoldDetection(prisma, notificationHub, org.id);
    expect(report.vehiclesFlagged).toBe(0);
  });

  it("respects org-level soldDetectionEnabled=false", async () => {
    const { org, source } = await setupOrgWithFeedSource();
    await prisma.organization.update({
      where: { id: org.id },
      data: { settings: { soldDetectionEnabled: false } },
    });
    await applyImportItems(
      prisma,
      [{ stockNumber: "D-1", make: "Honda", model: "Civic", priceCents: 1100000 }],
      { orgId: org.id, sourceId: source.id, actor: { type: "SYSTEM" }, maxPhotos: 10, hub: notificationHub },
    );
    await prisma.importSource.update({
      where: { id: source.id },
      data: { lastRunAt: new Date(Date.now() + 1000), lastStatus: "SUCCEEDED" },
    });
    const report = await runSoldDetection(prisma, notificationHub, org.id);
    expect(report.vehiclesFlagged).toBe(0);
    const vehicle = await prisma.vehicle.findFirst({ where: { stockNumber: "D-1" } });
    expect(vehicle?.status).toBe("ACTIVE");
  });
});
