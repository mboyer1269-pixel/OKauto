export interface TeamMemberIdentity {
  name: string;
  email: string;
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Propriétaire",
  ADMIN: "Administration",
  MANAGER: "Direction des ventes",
  SALESPERSON: "Représentant aux ventes",
};

export function getTeamMemberTitle(
  role: string | null,
  user?: TeamMemberIdentity | null,
) {
  if (user?.name.trim().toLocaleLowerCase("fr-CA") === "michael boyer") {
    return "Représentant aux ventes";
  }

  return role ? (ROLE_LABELS[role] ?? role) : "Membre de l’équipe";
}

export function getTeamAccessLabel(role: string) {
  if (role === "OWNER") return "Administrateur principal";
  if (role === "ADMIN") return "Administrateur";
  if (role === "MANAGER") return "Gestion";
  return "Publication";
}
