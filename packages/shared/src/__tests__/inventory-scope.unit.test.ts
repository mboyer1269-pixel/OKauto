import { describe, expect, it } from "vitest";
import {
  isOnSaleVehicle,
  listingNeedsMarketplaceRemoval,
  listingNeedsMarketplaceRemovalWhere,
  onSaleVehicleWhere,
  soldHistoryVehicleWhere,
} from "../inventory-scope";

describe("inventaire en vente", () => {
  it("compte 3 en vente parmi 3 AVAILABLE + 2 SOLD + 1 absent du flux", () => {
    const vehicles = [
      { status: "AVAILABLE", feedAbsenceStatus: "IN_FEED" },
      { status: "AVAILABLE", feedAbsenceStatus: "IN_FEED" },
      { status: "PENDING", feedAbsenceStatus: "KEPT" },
      { status: "SOLD", feedAbsenceStatus: "IN_FEED" },
      { status: "SOLD", feedAbsenceStatus: "IN_FEED" },
      { status: "AVAILABLE", feedAbsenceStatus: "PENDING_REVIEW" },
    ];
    expect(vehicles.filter(isOnSaleVehicle)).toHaveLength(3);
  });

  it("exclut SOLD, ARCHIVED et PENDING_REVIEW de la clause Prisma", () => {
    expect(onSaleVehicleWhere()).toEqual({
      status: { in: ["AVAILABLE", "PENDING"] },
      feedAbsenceStatus: { in: ["IN_FEED", "KEPT"] },
    });
    expect(soldHistoryVehicleWhere()).toEqual({ status: "SOLD" });
  });

  it("signale une annonce ACTIVE à retirer pour un vendu ou un absent du flux", () => {
    expect(
      listingNeedsMarketplaceRemoval({
        status: "ACTIVE",
        vehicle: { status: "SOLD", feedAbsenceStatus: "IN_FEED" },
      }),
    ).toBe(true);
    expect(
      listingNeedsMarketplaceRemoval({
        status: "ACTIVE",
        vehicle: { status: "AVAILABLE", feedAbsenceStatus: "PENDING_REVIEW" },
      }),
    ).toBe(true);
    expect(
      listingNeedsMarketplaceRemoval({
        status: "ACTIVE",
        vehicle: { status: "AVAILABLE", feedAbsenceStatus: "IN_FEED" },
      }),
    ).toBe(false);
    expect(
      listingNeedsMarketplaceRemoval({
        status: "STALE",
        vehicle: { status: "SOLD" },
      }),
    ).toBe(false);
    expect(listingNeedsMarketplaceRemovalWhere().status).toBe("ACTIVE");
  });
});
