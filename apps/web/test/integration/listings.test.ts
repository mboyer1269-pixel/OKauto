import { describe, expect, it } from "vitest";
import { POST as createListing } from "@/app/api/v1/orgs/[orgId]/listings/route";
import { PATCH as patchListing } from "@/app/api/v1/orgs/[orgId]/listings/[listingId]/route";
import { addMember, body, createOrg, createUser, makeRequest, params, prisma } from "./helpers";

async function seedVehicle(orgId: string) {
  return prisma.vehicle.create({
    data: {
      organizationId: orgId,
      make: "Jeep",
      model: "Wrangler",
      year: 2018,
      priceCents: 3_000_000,
    },
  });
}

describe("listing lifecycle", () => {
  it("walks DRAFT → PREPARED → POSTED → DELISTED with URL validation", async () => {
    const owner = await createUser();
    const org = await createOrg(owner.id);
    const vehicle = await seedVehicle(org.id);

    const created = await createListing(
      makeRequest("/x", { method: "POST", cookie: owner.cookie, json: { vehicleId: vehicle.id } }),
      params({ orgId: org.id }),
    );
    expect(created.status).toBe(201);
    const { listing } = await body<{ listing: { id: string; status: string } }>(created);
    expect(listing.status).toBe("DRAFT");

    const prepared = await patchListing(
      makeRequest("/x", { method: "PATCH", cookie: owner.cookie, json: { status: "PREPARED" } }),
      params({ orgId: org.id, listingId: listing.id }),
    );
    expect(prepared.status).toBe(200);

    // POSTED without a URL is rejected.
    const noUrl = await patchListing(
      makeRequest("/x", { method: "PATCH", cookie: owner.cookie, json: { status: "POSTED" } }),
      params({ orgId: org.id, listingId: listing.id }),
    );
    expect(noUrl.status).toBe(400);

    // Non-facebook URLs are rejected.
    const badUrl = await patchListing(
      makeRequest("/x", {
        method: "PATCH",
        cookie: owner.cookie,
        json: { status: "POSTED", externalUrl: "https://evil.example.com/item/1" },
      }),
      params({ orgId: org.id, listingId: listing.id }),
    );
    expect(badUrl.status).toBe(400);

    const posted = await patchListing(
      makeRequest("/x", {
        method: "PATCH",
        cookie: owner.cookie,
        json: { status: "POSTED", externalUrl: "https://www.facebook.com/marketplace/item/42/" },
      }),
      params({ orgId: org.id, listingId: listing.id }),
    );
    expect(posted.status).toBe(200);

    // Illegal jump: POSTED → PREPARED.
    const illegal = await patchListing(
      makeRequest("/x", { method: "PATCH", cookie: owner.cookie, json: { status: "PREPARED" } }),
      params({ orgId: org.id, listingId: listing.id }),
    );
    expect(illegal.status).toBe(400);

    const delisted = await patchListing(
      makeRequest("/x", { method: "PATCH", cookie: owner.cookie, json: { status: "DELISTED" } }),
      params({ orgId: org.id, listingId: listing.id }),
    );
    expect(delisted.status).toBe(200);

    const events = await prisma.listingEvent.findMany({ where: { listingId: listing.id } });
    const types = events.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(["CREATED", "PREPARED", "POSTED", "DELISTED"]));
  });

  it("prevents duplicates: same user blocked, teammate requires force", async () => {
    const owner = await createUser();
    const teammate = await createUser();
    const org = await createOrg(owner.id);
    await addMember(org.id, teammate.id, "SALESPERSON");
    const vehicle = await seedVehicle(org.id);

    await prisma.listing.create({
      data: {
        organizationId: org.id,
        vehicleId: vehicle.id,
        userId: owner.id,
        status: "POSTED",
        postedAt: new Date(),
      },
    });

    // Same user: hard conflict.
    const mine = await createListing(
      makeRequest("/x", { method: "POST", cookie: owner.cookie, json: { vehicleId: vehicle.id } }),
      params({ orgId: org.id }),
    );
    expect(mine.status).toBe(409);

    // Teammate: conflict without force…
    const blocked = await createListing(
      makeRequest("/x", {
        method: "POST",
        cookie: teammate.cookie,
        json: { vehicleId: vehicle.id },
      }),
      params({ orgId: org.id }),
    );
    expect(blocked.status).toBe(409);

    // …but allowed with force, carrying a warning.
    const forced = await createListing(
      makeRequest("/x", {
        method: "POST",
        cookie: teammate.cookie,
        json: { vehicleId: vehicle.id, force: true },
      }),
      params({ orgId: org.id }),
    );
    expect(forced.status).toBe(201);
    const data = await body<{ duplicateWarning: string | null }>(forced);
    expect(data.duplicateWarning).toBeTruthy();
  });

  it("blocks listings for sold vehicles and lets salespeople touch only their own listings", async () => {
    const owner = await createUser();
    const sales = await createUser();
    const org = await createOrg(owner.id);
    await addMember(org.id, sales.id, "SALESPERSON");
    const soldVehicle = await prisma.vehicle.create({
      data: { organizationId: org.id, make: "Mazda", model: "CX-5", status: "SOLD" },
    });

    const res = await createListing(
      makeRequest("/x", {
        method: "POST",
        cookie: sales.cookie,
        json: { vehicleId: soldVehicle.id },
      }),
      params({ orgId: org.id }),
    );
    expect(res.status).toBe(400);

    const vehicle = await seedVehicle(org.id);
    const ownersListing = await prisma.listing.create({
      data: { organizationId: org.id, vehicleId: vehicle.id, userId: owner.id, status: "PREPARED" },
    });
    const denied = await patchListing(
      makeRequest("/x", { method: "PATCH", cookie: sales.cookie, json: { status: "DRAFT" } }),
      params({ orgId: org.id, listingId: ownersListing.id }),
    );
    expect(denied.status).toBe(404);
  });
});
