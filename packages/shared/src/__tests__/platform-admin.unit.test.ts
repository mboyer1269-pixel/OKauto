import { describe, expect, it } from "vitest";
import {
  ACCESS_REQUEST_IP_RETENTION_DAYS,
  ACCESS_REQUEST_RETENTION_MONTHS,
  accessRequestIpCutoff,
  accessRequestRecordCutoff,
  isPlatformAdminEmail,
  parsePlatformAdminEmails,
} from "../index";

describe("PLATFORM_ADMIN_EMAILS", () => {
  it("refuse tout le monde si la variable est absente ou vide", () => {
    expect(parsePlatformAdminEmails(undefined)).toEqual([]);
    expect(parsePlatformAdminEmails("")).toEqual([]);
    expect(parsePlatformAdminEmails("  ,  ")).toEqual([]);
    expect(isPlatformAdminEmail("owner@demo.okauto.local", undefined)).toBe(
      false,
    );
    expect(isPlatformAdminEmail("owner@demo.okauto.local", "")).toBe(false);
  });

  it("n’accorde l’accès qu’aux courriels de la liste, sans tenir compte de la casse", () => {
    const raw = " ops@suivia.ca , Michael@Suivia.ca ";
    expect(parsePlatformAdminEmails(raw)).toEqual([
      "ops@suivia.ca",
      "michael@suivia.ca",
    ]);
    expect(isPlatformAdminEmail("owner@demo.okauto.local", raw)).toBe(false);
    expect(isPlatformAdminEmail("OPS@suivia.ca", raw)).toBe(true);
    expect(isPlatformAdminEmail("  michael@suivia.ca  ", raw)).toBe(true);
  });
});

describe("conservation des demandes d’accès", () => {
  it("efface l’IP après 30 jours et la demande après 12 mois", () => {
    expect(ACCESS_REQUEST_IP_RETENTION_DAYS).toBe(30);
    expect(ACCESS_REQUEST_RETENTION_MONTHS).toBe(12);
    const now = new Date("2026-10-09T12:00:00.000Z");
    expect(accessRequestIpCutoff(now).toISOString()).toBe(
      "2026-09-09T12:00:00.000Z",
    );
    expect(accessRequestRecordCutoff(now).toISOString()).toBe(
      "2025-10-09T12:00:00.000Z",
    );
  });
});
