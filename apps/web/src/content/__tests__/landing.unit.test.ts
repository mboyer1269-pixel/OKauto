import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { landingCopy, landingHrefs } from "../landing";
import { isPublicSignupEnabled } from "@/lib/signup";

const here = dirname(fileURLToPath(import.meta.url));
const home = readFileSync(
  join(here, "../../components/landing/home-page.tsx"),
  "utf8",
);

describe("page d’accueil — textes validés", () => {
  it("reproduit les textes du propriétaire sans les altérer", () => {
    expect(landingCopy.nav.login).toBe("Se connecter");
    expect(landingCopy.nav.create).toBe("Créer mon espace");
    expect(landingCopy.hero.kicker).toBe("Centre de publication automobile");
    expect(landingCopy.hero.title).toBe(
      "Du NIV à vendu, chaque véhicule suivi.",
    );
    expect(landingCopy.hero.lede).toBe(
      "Suivia Auto prépare vos annonces Facebook Marketplace à partir de votre inventaire, et suit chaque publication jusqu’à la vente.",
    );
    expect(landingCopy.hero.primary).toBe("Créer mon espace");
    expect(landingCopy.hero.secondary).toBe("Voir comment ça marche");
    expect(landingCopy.journey.steps.map((step) => step.title)).toEqual([
      "NIV décodé",
      "Fiche complète",
      "Annonce Marketplace",
      "Vendu",
    ]);
    expect(landingCopy.journey.steps[0].text).toBe(
      "Entrez le NIV ou laissez la synchronisation l’apporter. Suivia remplit les champs vides : marque, modèle, année, version, carrosserie, traction, moteur, transmission. Les données de votre site gardent toujours la priorité.",
    );
    expect(landingCopy.journey.steps[1].text).toBe(
      "Photos, prix et description prêts au même endroit. La description est générée à partir de la fiche, et vous la modifiez au besoin.",
    );
    expect(landingCopy.journey.steps[2].text).toBe(
      "L’extension Chrome remplit le formulaire Facebook à votre place. Vous vérifiez, puis vous cliquez sur Publier : vous gardez le contrôle.",
    );
    expect(landingCopy.journey.steps[3].text).toBe(
      "Le statut de chaque annonce est suivi, avec le vendeur responsable. Quand un véhicule est marqué vendu, votre équipe est avertie.",
    );
    expect(landingCopy.team.title).toBe("Toute l’équipe, un seul inventaire");
    expect(landingCopy.team.text).toBe(
      "Propriétaire, administrateur, directeur ou vendeur : chacun voit ce qu’il doit voir. L’historique des publications et le journal d’activité restent consultables.",
    );
    expect(landingCopy.carfax).toBe(
      "Rapport Carfax gratuit disponible, écrivez-nous !",
    );
    expect(landingCopy.cta.title).toBe("Prêt à publier plus vite ?");
    expect(landingCopy.cta.button).toBe("Créer mon espace");
    expect(landingCopy.footer.copyright).toBe("© Suivia Auto");
    expect(landingCopy.footer.privacy).toBe("Confidentialité");
    expect(landingCopy.footer.terms).toBe("Conditions d’utilisation");
    expect(landingCopy.footer.contact).toBe("Nous joindre");
    expect(landingCopy.legal.preparing).toBe("Page en préparation");
  });

  it("n’invente ni statistique ni témoignage", () => {
    const blob = JSON.stringify(landingCopy);
    expect(blob).not.toMatch(/\d[\d\s]*véhicule/i);
    expect(blob.toLowerCase()).not.toMatch(/témoign/);
    expect(blob).not.toMatch(/%/);
  });

  it("pointe « Créer mon espace » vers la demande d’accès, pas une inscription ouverte", () => {
    expect(isPublicSignupEnabled()).toBe(false);
    expect(landingHrefs.createSpace).toBe("/demande-acces");
    expect(landingHrefs.login).toBe("/login");
    expect(landingHrefs.journey).toBe("#parcours");
    expect(home).toMatch(/landingHrefs\.createSpace/);
    expect(home).toMatch(/landingHrefs\.login/);
    expect(home).toMatch(/landingHrefs\.journey/);
  });

  it("expose Confidentialité, Conditions et Nous joindre", () => {
    expect(landingHrefs.privacy).toBe("/confidentialite");
    expect(landingHrefs.terms).toBe("/conditions");
    expect(landingHrefs.contact).toBe("/nous-joindre");
    expect(home).toMatch(/landingHrefs\.privacy/);
    expect(home).toMatch(/landingHrefs\.terms/);
    expect(home).toMatch(/landingHrefs\.contact/);
  });
});
