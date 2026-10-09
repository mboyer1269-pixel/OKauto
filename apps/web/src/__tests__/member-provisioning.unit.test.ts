import { describe, expect, it } from "vitest";
import {
  MEMBER_CREATE_CONFLICT_MESSAGE,
  dealerMayResetMemberPassword,
} from "@/lib/member-provisioning";

describe("dealerMayResetMemberPassword", () => {
  const orgA = "org-a";
  const orgB = "org-b";

  it("allows reset only for staff provisioned by this dealership and attached only there", () => {
    expect(
      dealerMayResetMemberPassword({
        organizationId: orgB,
        provisionedByOrganizationId: orgB,
        membershipOrganizationIds: [orgB],
      }),
    ).toBe(true);
  });

  it("refuses an account that also belongs to another dealership", () => {
    expect(
      dealerMayResetMemberPassword({
        organizationId: orgB,
        provisionedByOrganizationId: orgB,
        membershipOrganizationIds: [orgA, orgB],
      }),
    ).toBe(false);
  });

  it("refuses an account this dealership did not create", () => {
    expect(
      dealerMayResetMemberPassword({
        organizationId: orgB,
        provisionedByOrganizationId: orgA,
        membershipOrganizationIds: [orgB],
      }),
    ).toBe(false);
    expect(
      dealerMayResetMemberPassword({
        organizationId: orgB,
        provisionedByOrganizationId: null,
        membershipOrganizationIds: [orgB],
      }),
    ).toBe(false);
  });

  it("uses a generic add-member conflict that does not say the email exists", () => {
    expect(MEMBER_CREATE_CONFLICT_MESSAGE.toLowerCase()).not.toContain(
      "déjà enregistré",
    );
    expect(MEMBER_CREATE_CONFLICT_MESSAGE.toLowerCase()).not.toContain(
      "existe",
    );
  });
});
