import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { landingCopy } from "../landing";

const here = dirname(fileURLToPath(import.meta.url));

const landingSource = JSON.stringify(landingCopy);

describe("page d’accueil publique — contenu unique", () => {
  it("reste en français et décrit des fonctions réelles", () => {
    expect(landingCopy.meta.title).toMatch(/Suivia/);
    expect(landingCopy.hero.lede).toMatch(/inventaire/i);
    expect(landingCopy.hero.lede).toMatch(/NIV/);
    expect(landingCopy.features.items.map((item) => item.title).join(" ")).toMatch(
      /Marketplace/i,
    );
    expect(landingSource).toMatch(/Carfax/);
  });

  it("n’invente ni statistique ni témoignage", () => {
    expect(landingSource).not.toMatch(/\d[\d\s]*véhicule/i);
    expect(landingSource.toLowerCase()).not.toMatch(/témoign/);
    expect(landingSource.toLowerCase()).not.toMatch(/%/);
    expect(landingSource).not.toMatch(/<( 2 min|2 min)/);
  });

  it("oriente vers la connexion ou une demande d’accès, pas l’inscription", () => {
    expect(landingCopy.hero.loginCta).toBe("Se connecter");
    expect(landingCopy.hero.requestCta).toBe("Demander un accès");
    expect(landingCopy.access.closedNote).toMatch(/Aucun compte/i);
    expect(landingSource).not.toMatch(/\/register/);
  });

  it("n’est référencé que depuis le fichier de contenu et les écrans d’accueil", () => {
    const home = readFileSync(
      join(here, "../../components/landing/home-page.tsx"),
      "utf8",
    );
    expect(home).not.toMatch(/\/register/);
    expect(home).toMatch(/href="\/login"/);
    expect(home).toMatch(/href="#acces"/);
  });
});
