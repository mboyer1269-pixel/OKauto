export const MEMBER_CREATE_CONFLICT_MESSAGE =
  "Impossible d’ajouter ce membre. S’il a déjà un compte, demandez-lui de vous contacter. Sinon, vérifiez le courriel.";

export const MEMBER_PASSWORD_RESET_FORBIDDEN_MESSAGE =
  "Vous ne pouvez pas réinitialiser le mot de passe de ce compte.";

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
