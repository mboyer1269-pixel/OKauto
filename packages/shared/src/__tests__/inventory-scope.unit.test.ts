import { describe, expect, it } from "vitest";
import {
  isOnSaleVehicle,
  isStaleUnseenFromSync,
  listingNeedsMarketplaceRemoval,
  listingNeedsMarketplaceRemovalWhere,
  onSaleVehicleWhere,
  soldHistoryVehicleWhere,
  staleUnseenReviewReason,
} from "../inventory-scope";

const now = new Date("2026-10-10T12:00:00.000Z");

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
    expect(vehicles.filter((vehicle) => isOnSaleVehicle(vehicle, now))).toHaveLength(
      3,
    );
  });

  it("exclut un véhicule non vu depuis plus de 48 h si la synchro a réussi depuis", () => {
    const stale = {
      status: "AVAILABLE" as const,
      feedAbsenceStatus: "IN_FEED" as const,
      syncSourceId: "src1",
      lastSeenAt: "2026-10-07T10:00:00.000Z",
      syncSource: {
        isActive: true,
        lastSyncStatus: "success",
        lastSyncAt: "2026-10-10T11:00:00.000Z",
      },
    };
    expect(isStaleUnseenFromSync(stale, now)).toBe(true);
    expect(isOnSaleVehicle(stale, now)).toBe(false);
    expect(staleUnseenReviewReason(stale.lastSeenAt, now)).toBe(
      "non vu depuis 3 jours",
    );
    expect(
      isOnSaleVehicle(
        {
          ...stale,
          syncSourceId: null,
          syncSource: null,
        },
        now,
      ),
    ).toBe(true);
    expect(
      isStaleUnseenFromSync(
        {
          ...stale,
          syncSource: {
            isActive: true,
            lastSyncStatus: "error",
            lastSyncAt: "2026-10-10T11:00:00.000Z",
          },
        },
        now,
      ),
    ).toBe(false);
    expect(
      isStaleUnseenFromSync(
        {
          ...stale,
          lastSeenAt: "2026-10-09T10:00:00.000Z",
          syncSource: {
            isActive: true,
            lastSyncStatus: "success",
            lastSyncAt: "2026-10-08T11:00:00.000Z",
          },
        },
        now,
      ),
    ).toBe(false);
    expect(
      isStaleUnseenFromSync(
        {
          ...stale,
          lastSeenAt: "2026-10-08T12:00:00.000Z",
        },
        now,
      ),
    ).toBe(false);
    expect(
      isStaleUnseenFromSync(
        {
          ...stale,
          syncSource: {
            isActive: false,
            lastSyncStatus: "success",
            lastSyncAt: "2026-10-10T11:00:00.000Z",
          },
        },
        now,
      ),
    ).toBe(false);
    expect(
      isStaleUnseenFromSync(
        {
          ...stale,
          lastSeenAt: null,
        },
        now,
      ),
    ).toBe(false);
  });

  it("exclut SOLD, ARCHIVED et PENDING_REVIEW de la clause Prisma", () => {
    expect(onSaleVehicleWhere()).toEqual({
      status: { in: ["AVAILABLE", "PENDING"] },
      feedAbsenceStatus: { in: ["IN_FEED", "KEPT"] },
    });
    expect(soldHistoryVehicleWhere()).toEqual({ status: "SOLD" });
  });

  it("signale une annonce ACTIVE à retirer pour un vendu, un absent ou un périmé", () => {
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
      listingNeedsMarketplaceRemoval(
        {
          status: "ACTIVE",
          vehicle: {
            status: "AVAILABLE",
            feedAbsenceStatus: "IN_FEED",
            syncSourceId: "src1",
            lastSeenAt: "2026-10-07T10:00:00.000Z",
            syncSource: {
              isActive: true,
              lastSyncStatus: "success",
              lastSyncAt: "2026-10-10T11:00:00.000Z",
            },
          },
        },
        now,
      ),
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
