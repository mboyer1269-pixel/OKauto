import { describe, expect, it } from "vitest";
import { GET as bootstrap } from "@/app/api/v1/ext/bootstrap/route";
import { GET as extVehicles } from "@/app/api/v1/ext/vehicles/route";
import { POST as extCreateListing } from "@/app/api/v1/ext/listings/route";
import { POST as extStatus } from "@/app/api/v1/ext/listings/[listingId]/status/route";
import {
  addMember,
  body,
  createApiToken,
  createOrg,
  createUser,
  makeRequest,
  params,
  prisma,
} from "./helpers";

describe("extension API (bearer tokens)", () => {
  it("rejects missing/invalid/revoked tokens", async () => {
    const noToken = await bootstrap(makeRequest("/x"), {});
    expect(noToken.status).toBe(401);

    const badToken = await bootstrap(makeRequest("/x", { bearer: "lp_not_a_real_token" }), {});
    expect(badToken.status).toBe(401);

    const owner = await createUser();
    const org = await createOrg(owner.id);
    const value = await createApiToken(org.id, owner.id);
    await prisma.apiToken.updateMany({
      where: { organizationId: org.id },
      data: { revokedAt: new Date() },
    });
    const revoked = await bootstrap(makeRequest("/x", { bearer: value }), {});
    expect(revoked.status).toBe(401);
  });

  it("serves bootstrap + marketplace-ready vehicles and records posted listings", async () => {
    const owner = await createUser();
    const sales = await createUser();
    const org = await createOrg(owner.id);
    await addMember(org.id, sales.id, "SALESPERSON");
    const token = await createApiToken(org.id, sales.id);

    await prisma.vehicle.create({
      data: {
        organizationId: org.id,
        make: "Toyota",
        model: "RAV4",
        trim: "XLE",
        year: 2021,
        mileage: 32_500,
        priceCents: 2_749_900,
        bodyStyle: "SUV",
        description: "Nice RAV4.",
      },
    });

    const boot = await bootstrap(makeRequest("/x", { bearer: token }), {});
    expect(boot.status).toBe(200);
    const bootData = await body<{ user: { role: string }; organization: { name: string } }>(boot);
    expect(bootData.user.role).toBe("SALESPERSON");

    const vehiclesRes = await extVehicles(
      makeRequest("/api/v1/ext/vehicles", { bearer: token }),
      {},
    );
    expect(vehiclesRes.status).toBe(200);
    const { vehicles } = await body<{
      vehicles: Array<{
        id: string;
        marketplaceFields: { title: string; bodyStyle: string; price: string };
      }>;
    }>(vehiclesRes);
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0]!.marketplaceFields.title).toBe("2021 Toyota RAV4 XLE");
    expect(vehicles[0]!.marketplaceFields.bodyStyle).toBe("SUV");
    expect(vehicles[0]!.marketplaceFields.price).toBe("27499");

    const created = await extCreateListing(
      makeRequest("/x", { method: "POST", bearer: token, json: { vehicleId: vehicles[0]!.id } }),
      {},
    );
    expect(created.status).toBe(201);
    const { listing } = await body<{ listing: { id: string; status: string } }>(created);
    expect(listing.status).toBe("PREPARED"); // extension listings go straight to prepared

    const posted = await extStatus(
      makeRequest("/x", {
        method: "POST",
        bearer: token,
        json: { status: "POSTED", externalUrl: "https://www.facebook.com/marketplace/item/99/" },
      }),
      params({ listingId: listing.id }),
    );
    expect(posted.status).toBe(200);

    const audit = await prisma.auditLog.findMany({
      where: { organizationId: org.id, action: "listing.posted" },
    });
    expect(audit.length).toBeGreaterThanOrEqual(1);
  });

  it("keeps tokens org-scoped: a token cannot touch another org's listings", async () => {
    const ownerA = await createUser();
    const orgA = await createOrg(ownerA.id);
    const tokenA = await createApiToken(orgA.id, ownerA.id);

    const ownerB = await createUser();
    const orgB = await createOrg(ownerB.id);
    const vehicleB = await prisma.vehicle.create({
      data: { organizationId: orgB.id, make: "Kia", model: "Telluride" },
    });
    const listingB = await prisma.listing.create({
      data: {
        organizationId: orgB.id,
        vehicleId: vehicleB.id,
        userId: ownerB.id,
        status: "PREPARED",
      },
    });

    const crossOrg = await extStatus(
      makeRequest("/x", {
        method: "POST",
        bearer: tokenA,
        json: { status: "POSTED", externalUrl: "https://www.facebook.com/marketplace/item/1/" },
      }),
      params({ listingId: listingB.id }),
    );
    expect(crossOrg.status).toBe(404);
  });
});
