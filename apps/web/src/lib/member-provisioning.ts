export const MEMBER_INVITE_NOTICE =
  "Aucun courriel n’est envoyé. Copiez ce lien maintenant — il ne sera plus réaffiché — et transmettez-le à la personne invitée. Le lien expire dans 7 jours.";

export const MEMBER_INVITE_INVALID_MESSAGE =
  "Invitation invalide ou expirée.";

export const MEMBER_PASSWORD_RESET_FORBIDDEN_MESSAGE =
  "Vous ne pouvez pas réinitialiser le mot de passe de ce compte.";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Same dummy hash as login, so existing vs new emails take a comparable time. */
export const INVITE_DUMMY_PASSWORD_HASH =
  "$2a$12$GeR0Sdv/LqGKs/Sgw40sPe/EV66O3omHonLcXOwfQ1/W3fVIUDRpu";

export function publicAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export function inviteUrlFor(token: string): string {
  return `${publicAppUrl()}/invitation/${token}`;
}

/**
 * A dealership may reset a password only for an account it provisioned
 * and that still belongs solely to that dealership.
 */
export function dealerMayResetMemberPassword(input: {
  organizationId: string;
  provisionedByOrganizationId: string | null | undefined;
  membershipOrganizationIds: string[];
}): boolean {
  if (input.provisionedByOrganizationId !== input.organizationId) {
    return false;
  }
  return (
    input.membershipOrganizationIds.length === 1 &&
    input.membershipOrganizationIds[0] === input.organizationId
  );
}
