import { describe, expect, it } from "vitest";
import { summarizeExtensionEventLog } from "@/lib/extension-event-log";

describe("summarizeExtensionEventLog", () => {
  it("omits client metadata on successful form_filled events", () => {
    const summary = summarizeExtensionEventLog({
      eventType: "form_filled",
      organizationId: "org_1",
      vehicleId: "veh_1",
      metadata: {
        source: "extension",
        filled: ["année", "marque"],
        spy: "should-not-appear",
        facebookUrl: "https://www.facebook.com/marketplace/create/vehicle",
      },
    });
    expect(summary).toEqual({
      eventType: "form_filled",
      organizationId: "org_1",
      vehicleId: "veh_1",
      listingId: null,
      source: "extension",
      filledCount: 2,
    });
    expect(JSON.stringify(summary)).not.toContain("spy");
    expect(JSON.stringify(summary)).not.toContain("facebook.com");
  });

  it("allowlists failure fields and drops unknown keys", () => {
    const summary = summarizeExtensionEventLog({
      eventType: "listing_error",
      organizationId: "org_1",
      vehicleId: "veh_1",
      listingId: "lst_1",
      metadata: {
        source: "extension",
        filled: ["année"],
        failedFields: [
          {
            field: "make",
            step: "select_make",
            reason: "missing_field",
            message: "Champ « Marque » introuvable.",
          },
        ],
        facebookUrl: "https://www.facebook.com/marketplace/create/vehicle",
        cookies: "session=secret",
        html: "<form>huge</form>",
      },
    });
    const serialized = JSON.stringify(summary);
    expect(summary.metadata).toMatchObject({
      source: "extension",
      failedFields: [
        expect.objectContaining({ field: "make", step: "select_make" }),
      ],
    });
    expect(serialized).not.toContain("session=secret");
    expect(serialized).not.toContain("<form>");
    expect(serialized.length).toBeLessThanOrEqual(2048);
  });
});
