/**
 * Textes validés de la page d’accueil publique.
 * Ne pas paraphraser : le propriétaire a figé chaque mot.
 * L’inscription publique reste fermée : « Créer mon espace » mène à /register (demande d’accès).
 */
export const landingCopy = {
  meta: {
    title: "Suivia Auto",
    description:
      "Suivia Auto prépare vos annonces Facebook Marketplace à partir de votre inventaire, et suit chaque publication jusqu’à la vente.",
  },
  nav: {
    login: "Se connecter",
    create: "Créer mon espace",
  },
  hero: {
    kicker: "Centre de publication automobile",
    title: "Du NIV à vendu, chaque véhicule suivi.",
    lede: "Suivia Auto prépare vos annonces Facebook Marketplace à partir de votre inventaire, et suit chaque publication jusqu’à la vente.",
    primary: "Créer mon espace",
    secondary: "Voir comment ça marche",
  },
  journey: {
    steps: [
      {
        id: "vin",
        title: "NIV décodé",
        text: "Entrez le NIV ou laissez la synchronisation l’apporter. Suivia remplit les champs vides : marque, modèle, année, version, carrosserie, traction, moteur, transmission. Les données de votre site gardent toujours la priorité.",
      },
      {
        id: "fiche",
        title: "Fiche complète",
        text: "Photos, prix et description prêts au même endroit. La description est générée à partir de la fiche, et vous la modifiez au besoin.",
      },
      {
        id: "annonce",
        title: "Annonce Marketplace",
        text: "L’extension Chrome remplit le formulaire Facebook à votre place. Vous vérifiez, puis vous cliquez sur Publier : vous gardez le contrôle.",
      },
      {
        id: "sold",
        title: "Vendu",
        text: "Le statut de chaque annonce est suivi, avec le vendeur responsable. Quand un véhicule est marqué vendu, votre équipe est avertie.",
      },
    ],
  },
  team: {
    title: "Toute l’équipe, un seul inventaire",
    text: "Propriétaire, administrateur, directeur ou vendeur : chacun voit ce qu’il doit voir. L’historique des publications et le journal d’activité restent consultables.",
  },
  carfax: "Rapport Carfax gratuit disponible, écrivez-nous !",
  cta: {
    title: "Prêt à publier plus vite ?",
    button: "Créer mon espace",
  },
  footer: {
    copyright: "© Suivia Auto",
    privacy: "Confidentialité",
    terms: "Conditions d’utilisation",
    contact: "Nous joindre",
  },
  legal: {
    preparing: "Page en préparation",
  },
} as const;

export const landingHrefs = {
  login: "/login",
  createSpace: "/register",
  journey: "#parcours",
  privacy: "/confidentialite",
  terms: "/conditions",
  contact: "/nous-joindre",
} as const;
