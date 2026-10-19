import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  buildFillTelemetry,
  formatFatalBanner,
  formatPreparationStatus,
  missingFieldIssue,
  missingOptionIssue,
} from "../marketplace-fill-report";

describe("marketplace fill report", () => {
  it("names the missing Facebook field in the banner copy", () => {
    const report = {
      filled: ["année"],
      issues: [missingFieldIssue("make", "select_make")],
    };
    const status = formatPreparationStatus(report);
    expect(status).toMatch(/Champ « Marque » introuvable/);
    expect(status).toMatch(/étape select_make/);
    expect(formatFatalBanner(report, "Remplissage impossible")).toMatch(
      /étape « Marque »/,
    );
  });

  it("distinguishes a missing option from a missing field", () => {
    const issue = missingOptionIssue("year", "2024", "select_year");
    expect(issue.reason).toBe("missing_option");
    expect(issue.message).toMatch(/2024/);
    expect(issue.message).toMatch(/Année/);
  });

  it("builds a listing_error payload for /api/v1/extension/events", () => {
    const payload = buildFillTelemetry(
      "veh_1",
      {
        filled: ["modèle"],
        issues: [missingFieldIssue("photos", "find_photo_input")],
      },
      "https://www.facebook.com/marketplace/create/vehicle",
    );
    expect(payload.eventType).toBe("listing_error");
    expect(payload.vehicleId).toBe("veh_1");
    expect(payload.metadata.failedFields[0].field).toBe("photos");
    expect(payload.metadata.failedFields[0].step).toBe("find_photo_input");
    expect(payload.metadata.source).toBe("extension");
  });

  it("uses form_filled when every expected field succeeded", () => {
    const payload = buildFillTelemetry("veh_1", {
      filled: ["année", "marque"],
      issues: [],
    });
    expect(payload.eventType).toBe("form_filled");
    expect(payload.metadata.failedFields).toEqual([]);
  });
});

describe("extension version and telemetry wiring", () => {
  it("bumps the packaged extension version", () => {
    const manifest = JSON.parse(
      readFileSync(
        resolve(__dirname, "../../public/manifest.json"),
        "utf8",
      ),
    ) as { version: string };
    expect(manifest.version).toBe("0.3.1");
  });

  it("reports missing fields through the existing events endpoint", () => {
    const background = readFileSync(
      resolve(__dirname, "../background/index.ts"),
      "utf8",
    );
    const content = readFileSync(
      resolve(__dirname, "../content/marketplace.ts"),
      "utf8",
    );
    expect(background).toContain("REPORT_EXTENSION_EVENT");
    expect(background).toContain("/api/v1/extension/events");
    expect(content).toContain("reportFillTelemetry");
    expect(content).toContain("missingFieldIssue");
    expect(content).not.toMatch(/hostname:\s*['"]\*\*['"]/);
  });
});
