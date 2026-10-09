import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@okauto/database";
import { processAccessRequestRetention } from "../access-request-retention.js";

describe("processAccessRequestRetention", () => {
  const emails: string[] = [];

  afterEach(async () => {
    if (emails.length > 0) {
      await prisma.accessRequest.deleteMany({
        where: { email: { in: emails } },
      });
      emails.length = 0;
    }
  });

  it("efface l’IP après 30 jours et supprime la demande après 12 mois", async () => {
    const now = new Date("2026-10-09T12:00:00.000Z");
    const suffix = Date.now();
    const recentEmail = `retain-recent-${suffix}@example.com`;
    const ipEmail = `retain-ip-${suffix}@example.com`;
    const oldEmail = `retain-old-${suffix}@example.com`;
    emails.push(recentEmail, ipEmail, oldEmail);

    const recent = await prisma.accessRequest.create({
      data: {
        name: "Récent",
        dealership: "Demo",
        email: recentEmail,
        message: "Récent",
        consentAt: now,
        ipAddress: "203.0.113.10",
        createdAt: now,
      },
    });
    const staleIp = await prisma.accessRequest.create({
      data: {
        name: "IP expirée",
        dealership: "Demo",
        email: ipEmail,
        message: "IP",
        consentAt: new Date("2026-09-01T12:00:00.000Z"),
        ipAddress: "203.0.113.20",
        createdAt: new Date("2026-09-01T12:00:00.000Z"),
      },
    });
    const expired = await prisma.accessRequest.create({
      data: {
        name: "Expiré",
        dealership: "Demo",
        email: oldEmail,
        message: "Ancien",
        consentAt: new Date("2025-09-01T12:00:00.000Z"),
        ipAddress: "203.0.113.30",
        createdAt: new Date("2025-09-01T12:00:00.000Z"),
      },
    });

    const result = await processAccessRequestRetention(now);
    expect(result.erasedIps).toBeGreaterThanOrEqual(1);
    expect(result.deleted).toBeGreaterThanOrEqual(1);

    expect(
      (await prisma.accessRequest.findUnique({ where: { id: recent.id } }))
        ?.ipAddress,
    ).toBe("203.0.113.10");
    expect(
      (await prisma.accessRequest.findUnique({ where: { id: staleIp.id } }))
        ?.ipAddress,
    ).toBeNull();
    expect(
      await prisma.accessRequest.findUnique({ where: { id: expired.id } }),
    ).toBeNull();
  });
});
