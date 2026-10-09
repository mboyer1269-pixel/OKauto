import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { invitationCopy } from "../invitation";
import { MEMBER_INVITE_NOTICE } from "@/lib/member-provisioning";

const here = dirname(fileURLToPath(import.meta.url));

describe("invitations d’équipe", () => {
  it("documente qu’aucun courriel n’est envoyé", () => {
    expect(invitationCopy.noEmail).toMatch(/Aucun courriel/);
    expect(MEMBER_INVITE_NOTICE).toMatch(/Aucun courriel/);

    const team = readFileSync(
      join(here, "../../app/dashboard/team/page.tsx"),
      "utf8",
    );
    expect(team).toMatch(/Aucun courriel n’est envoyé/);
    expect(team).toMatch(/Créer l’invitation/);
    expect(team).not.toMatch(/Créer le compte/);
  });
});
