import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { accessRequestCopy, accessRequestHrefs } from "../access-request";
import { landingHrefs } from "../landing";
import { isPublicSignupEnabled } from "@/lib/signup";

const here = dirname(fileURLToPath(import.meta.url));

describe("demande d’accès", () => {
  it("pointe « Créer mon espace » vers le formulaire, pas /register", () => {
    expect(isPublicSignupEnabled()).toBe(false);
    expect(landingHrefs.createSpace).toBe(accessRequestHrefs.form);
    expect(accessRequestHrefs.form).toBe("/demande-acces");
    expect(accessRequestHrefs.privacy).toBe("/confidentialite");
  });

  it("exige un consentement Loi 25 non précoché et un lien Confidentialité", () => {
    const form = readFileSync(
      join(here, "../../app/demande-acces/access-request-form.tsx"),
      "utf8",
    );
    expect(form).toMatch(/useState\(false\)/);
    expect(form).not.toMatch(/defaultChecked\s*=\s*\{?true/);
    expect(form).toMatch(/accessRequestHrefs\.privacy/);
    expect(form).toMatch(/type="checkbox"/);
    expect(accessRequestCopy.consent).toMatch(/Loi 25/);
    expect(accessRequestCopy.consent).toMatch(/adresse IP/);
    expect(accessRequestCopy.consent).toMatch(/prévenir les abus/);
    expect(accessRequestCopy.consent).toMatch(/30 jours/);
    expect(accessRequestCopy.consent).toMatch(/12 mois/);
  });

  it("laisse /register fermé avec un lien vers la demande d’accès", () => {
    const register = readFileSync(
      join(here, "../../app/register/page.tsx"),
      "utf8",
    );
    expect(register).toMatch(/Inscriptions fermées/);
    expect(register).toMatch(/accessRequestHrefs\.form/);
    expect(register).toMatch(/isPublicSignupEnabled/);
  });

  it("n’expose pas l’adresse IP et réserve le tableau à l’admin plateforme", () => {
    const dashboard = readFileSync(
      join(here, "../../app/dashboard/access-requests/page.tsx"),
      "utf8",
    );
    expect(dashboard).not.toMatch(/ipAddress/);
    expect(dashboard).toMatch(/isPlatformAdmin/);
    expect(dashboard).not.toMatch(/hasMinRole/);
    expect(dashboard).toMatch(/accessRequestCopy\.dashboard\.delete/);
  });

  it("masque la navigation « Demandes d’accès » hors admin plateforme", () => {
    const layout = readFileSync(
      join(here, "../../components/dashboard-layout.tsx"),
      "utf8",
    );
    expect(layout).toMatch(/\/dashboard\/access-requests/);
    expect(layout).toMatch(/platformAdmin: true/);
    expect(layout).not.toMatch(/minRole: "OWNER"/);
    expect(layout).toMatch(/if \(item\.platformAdmin\) return isPlatformAdmin/);
  });

  it("documente PLATFORM_ADMIN_USER_IDS côté serveur", () => {
    const envExample = readFileSync(
      join(here, "../../../../../.env.example"),
      "utf8",
    );
    const vpsReadme = readFileSync(
      join(here, "../../../../../deploy/README.md"),
      "utf8",
    );
    expect(envExample).toMatch(/PLATFORM_ADMIN_USER_IDS/);
    expect(envExample).not.toMatch(/PLATFORM_ADMIN_EMAILS/);
    expect(vpsReadme).toMatch(/PLATFORM_ADMIN_USER_IDS/);
    expect(vpsReadme).toMatch(/SELECT id, email, name FROM users WHERE name = 'Michael Boyer'/);
    expect(vpsReadme).not.toMatch(/PLATFORM_ADMIN_EMAILS/);
  });
});
