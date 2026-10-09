import { describe, expect, it } from "vitest";
import {
  ACCESS_REQUEST_IP_RETENTION_DAYS,
  ACCESS_REQUEST_RETENTION_MONTHS,
  accessRequestIpCutoff,
  accessRequestRecordCutoff,
  isPlatformAdminUserId,
  parsePlatformAdminUserIds,
} from "../index";

describe("PLATFORM_ADMIN_USER_IDS", () => {
  it("refuse tout le monde si la variable est absente ou vide", () => {
    expect(parsePlatformAdminUserIds(undefined)).toEqual([]);
    expect(parsePlatformAdminUserIds("")).toEqual([]);
    expect(parsePlatformAdminUserIds("  ,  ")).toEqual([]);
    expect(isPlatformAdminUserId("cluser0123456789", null)).toBe(false);
    expect(isPlatformAdminUserId("cluser0123456789", "")).toBe(false);
  });

  it("n’accorde l’accès qu’aux identifiants listés, relus depuis la variable", () => {
    const raw = " cluseradmin1 , cluseradmin2 ";
    expect(parsePlatformAdminUserIds(raw)).toEqual([
      "cluseradmin1",
      "cluseradmin2",
    ]);
    expect(isPlatformAdminUserId("cluserother", raw)).toBe(false);
    expect(isPlatformAdminUserId("cluseradmin1", raw)).toBe(true);
    expect(isPlatformAdminUserId("  cluseradmin2  ", raw)).toBe(true);
    expect(isPlatformAdminUserId("ops@suivia.ca", raw)).toBe(false);
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

  it("ramène un 29 février au 28 février de l’année précédente", () => {
    expect(
      accessRequestRecordCutoff(
        new Date("2028-02-29T12:00:00.000Z"),
      ).toISOString(),
    ).toBe("2027-02-28T12:00:00.000Z");
  });
});
