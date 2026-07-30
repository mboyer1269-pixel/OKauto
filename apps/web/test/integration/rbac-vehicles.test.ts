import { describe, expect, it } from "vitest";
import {
  GET as listVehicles,
  POST as createVehicle,
} from "@/app/api/v1/orgs/[orgId]/vehicles/route";
import { PATCH as patchVehicle } from "@/app/api/v1/orgs/[orgId]/vehicles/[vehicleId]/route";
import { POST as bulkAction } from "@/app/api/v1/orgs/[orgId]/vehicles/bulk/route";
import { POST as importCsv } from "@/app/api/v1/orgs/[orgId]/vehicles/import/route";
import { addMember, body, createOrg, createUser, makeRequest, params, prisma } from "./helpers";

const VIN = "1HGCM82633A004352";

describe("vehicles + RBAC", () => {
  it("scopes access by membership: outsiders get 404, salespeople cannot create", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const sales = await createUser();
    const org = await createOrg(owner.id);
    await addMember(org.id, sales.id, "SALESPERSON");

    const outsiderRes = await listVehicles(
      makeRequest(`/api/v1/orgs/${org.id}/vehicles`, { cookie: outsider.cookie }),
      params({ orgId: org.id }),
    );
    expect(outsiderRes.status).toBe(404);

    const salesCreate = await createVehicle(
      makeRequest(`/x`, {
        method: "POST",
        cookie: sales.cookie,
        json: { make: "Honda", model: "Civic" },
      }),
      params({ orgId: org.id }),
    );
    expect(salesCreate.status).toBe(403);
  });

  it("creates vehicles, blocks duplicate VINs, and normalizes input", async () => {
    const owner = await createUser();
    const org = await createOrg(owner.id);

    const created = await createVehicle(
      makeRequest("/x", {
        method: "POST",
        cookie: owner.cookie,
        json: {
          vin: ` ${VIN.toLowerCase()} `,
          make: "honda",
          model: "Accord",
          priceCents: 899500,
          year: 2003,
        },
      }),
      params({ orgId: org.id }),
    );
    expect(created.status).toBe(201);
    const data = await body<{ vehicle: { vin: string; make: string } }>(created);
    expect(data.vehicle.vin).toBe(VIN);
    expect(data.vehicle.make).toBe("Honda");

    const dupe = await createVehicle(
      makeRequest("/x", {
        method: "POST",
        cookie: owner.cookie,
        json: { vin: VIN, make: "Honda", model: "Accord" },
      }),
      params({ orgId: org.id }),
    );
    expect(dupe.status).toBe(409);
  });

  it("records a price change when a manager edits the price", async () => {
    const owner = await createUser();
    const org = await createOrg(owner.id);
    const vehicle = await prisma.vehicle.create({
      data: { organizationId: org.id, make: "Ford", model: "F-150", priceCents: 3_000_000 },
    });

    const res = await patchVehicle(
      makeRequest("/x", {
        method: "PATCH",
        cookie: owner.cookie,
        json: { make: "Ford", model: "F-150", priceCents: 2_800_000 },
      }),
      params({ orgId: org.id, vehicleId: vehicle.id }),
    );
    expect(res.status).toBe(200);
    const changes = await prisma.priceChange.findMany({ where: { vehicleId: vehicle.id } });
    expect(changes).toHaveLength(1);
    expect(changes[0]!.newPriceCents).toBe(2_800_000);
  });

  it("bulk mark_sold flips status, requests delists, and notifies listers", async () => {
    const owner = await createUser();
    const sales = await createUser();
    const org = await createOrg(owner.id);
    await addMember(org.id, sales.id, "SALESPERSON");
    const vehicle = await prisma.vehicle.create({
      data: { organizationId: org.id, make: "Tesla", model: "Model 3", priceCents: 2_500_000 },
    });
    await prisma.listing.create({
      data: {
        organizationId: org.id,
        vehicleId: vehicle.id,
        userId: sales.id,
        status: "POSTED",
        postedAt: new Date(),
      },
    });

    const res = await bulkAction(
      makeRequest("/x", {
        method: "POST",
        cookie: owner.cookie,
        json: { action: "mark_sold", vehicleIds: [vehicle.id, "nonexistent-id"] },
      }),
      params({ orgId: org.id }),
    );
    expect(res.status).toBe(200);
    const data = await body<{ succeeded: number; failed: number }>(res);
    expect(data.succeeded).toBe(1);
    expect(data.failed).toBe(1);

    const updated = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicle.id } });
    expect(updated.status).toBe("SOLD");
    const listing = await prisma.listing.findFirstOrThrow({ where: { vehicleId: vehicle.id } });
    expect(listing.status).toBe("DELIST_REQUESTED");
    const notifications = await prisma.notification.findMany({
      where: { userId: sales.id, type: "VEHICLE_SOLD" },
    });
    expect(notifications.length).toBeGreaterThanOrEqual(1);
  });

  it("imports CSV idempotently and reports per-row issues", async () => {
    const owner = await createUser();
    const org = await createOrg(owner.id);
    const csv = [
      "VIN,Stock,Year,Make,Model,Price,Mileage",
      `${VIN},T-1,2003,Honda,Accord,"$8,995",88000`,
      ',T-2,2021,Toyota,RAV4,"$27,499",32500',
      "BADVIN,T-3,2018,Ford,Escape,19995,64000",
    ].join("\n");

    const first = await importCsv(
      makeRequest("/x", {
        method: "POST",
        cookie: owner.cookie,
        body: csv,
        headers: { "content-type": "text/csv" },
      }),
      params({ orgId: org.id }),
    );
    expect(first.status).toBe(200);
    const stats1 = await body<{ stats: { created: number; errors: unknown[] } }>(first);
    expect(stats1.stats.created).toBe(3);
    expect(stats1.stats.errors).toHaveLength(1); // bad VIN warning

    const second = await importCsv(
      makeRequest("/x", {
        method: "POST",
        cookie: owner.cookie,
        body: csv,
        headers: { "content-type": "text/csv" },
      }),
      params({ orgId: org.id }),
    );
    const stats2 = await body<{ stats: { created: number; updated: number } }>(second);
    expect(stats2.stats.created).toBe(0);
    expect(stats2.stats.updated).toBe(3);

    const count = await prisma.vehicle.count({ where: { organizationId: org.id } });
    expect(count).toBe(3);
  });
});
