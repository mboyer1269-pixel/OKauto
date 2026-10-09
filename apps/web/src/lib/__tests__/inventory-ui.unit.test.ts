import { describe, expect, it } from "vitest";
import {
  completeness,
  daysInStock,
  daysTone,
  marketplaceStatus,
  matchesSavedView,
} from "../inventory-ui";

const base = {
  status: "AVAILABLE",
  createdAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
  price: 25000,
  trim: "Sport",
  engine: "2.0L",
  description: "Prêt",
  photos: [{ url: "https://example.com/a.jpg" }],
  listings: [] as Array<{
    status: string;
    listedAt?: string;
    lastRenewedAt?: string | null;
  }>,
};

describe("inventory-ui", () => {
  it("calcule les jours en stock et la teinte", () => {
    expect(daysInStock(new Date(Date.now() - 5 * 86_400_000).toISOString())).toBe(
      5,
    );
    expect(daysTone(12)).toBe("signal");
    expect(daysTone(45)).toBe("warning");
    expect(daysTone(90)).toBe("danger");
  });

  it("détecte le statut Marketplace", () => {
    expect(marketplaceStatus(base)).toBe("never");
    expect(
      marketplaceStatus({
        ...base,
        listings: [
          {
            status: "ACTIVE",
            listedAt: new Date().toISOString(),
            lastRenewedAt: null,
          },
        ],
      }),
    ).toBe("active");
    expect(
      marketplaceStatus({
        ...base,
        listings: [
          {
            status: "ACTIVE",
            listedAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
            lastRenewedAt: null,
          },
        ],
      }),
    ).toBe("renew");
    expect(marketplaceStatus({ ...base, status: "SOLD" })).toBe("sold");
  });

  it("mesure la complétude de fiche", () => {
    expect(completeness(base).percent).toBe(100);
    expect(completeness({ ...base, photos: [], description: "" }).percent).toBe(
      50,
    );
  });

  it("filtre les vues enregistrées", () => {
    expect(matchesSavedView(base, "ready")).toBe(true);
    expect(matchesSavedView({ ...base, photos: [] }, "nophoto")).toBe(true);
    expect(matchesSavedView({ ...base, trim: null, engine: null }, "nobuild")).toBe(
      true,
    );
  });
});
