import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { invitationCopy } from "../invitation";
import {
  MEMBER_INVITE_LOGIN_OR_CREATE_MESSAGE,
  MEMBER_INVITE_NOTICE,
} from "@/lib/member-provisioning";

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

  it("montre le même écran que le compte existe ou non", () => {
    expect(invitationCopy.lede).toBe(MEMBER_INVITE_LOGIN_OR_CREATE_MESSAGE);
    expect(invitationCopy.lede).toBe("Connectez-vous ou créez votre mot de passe.");

    const page = readFileSync(
      join(here, "../../app/invitation/[token]/page.tsx"),
      "utf8",
    );
    const form = readFileSync(
      join(here, "../../app/invitation/[token]/invitation-form.tsx"),
      "utf8",
    );
    const previewRoute = readFileSync(
      join(here, "../../app/api/v1/invitations/[token]/route.ts"),
      "utf8",
    );
    expect(page).toMatch(/invitationCopy\.lede/);
    expect(form).toMatch(/preview\.prompt/);
    expect(form).not.toMatch(/accountExists/);
    expect(previewRoute).not.toMatch(/accountExists/);
    expect(previewRoute).toMatch(/MEMBER_INVITE_LOGIN_OR_CREATE_MESSAGE/);
    expect(form).toMatch(/Connectez-vous/);
  });
});
