/**
 * Textes de la page d’accueil publique.
 * BUILDER remplacera ce fichier : ne pas disperser de copies ailleurs.
 * Aucune statistique, aucun témoignage, aucun chiffre inventé.
 */
export const landingCopy = {
  meta: {
    title: "Suivia — Inventaire et publications automobiles",
    description:
      "Suivez chaque véhicule : inventaire synchronisé, décodage NIV, préparation d’annonce Marketplace et mention Carfax.",
  },
  nav: {
    login: "Se connecter",
    request: "Demander un accès",
  },
  hero: {
    kicker: "Pour les concessions du Québec",
    title: "Suivre l’auto, de l’arrivée à la vente.",
    lede: "Suivia rassemble l’inventaire, le décodage NIV, les photos et la préparation des annonces Facebook Marketplace dans un seul espace d’équipe. L’inscription publique est fermée : l’accès se fait sur invitation.",
    loginCta: "Se connecter",
    requestCta: "Demander un accès",
  },
  journey: {
    kicker: "Le parcours",
    title: "Une unité, un fil.",
    hint: "Faites défiler pour suivre le véhicule.",
    steps: [
      {
        id: "vin",
        title: "NIV décodé",
        text: "Un NIV valide est lu avec le service public NHTSA vPIC. Les champs vides de la fiche peuvent être complétés ; une saisie déjà présente n’est pas écrasée.",
      },
      {
        id: "fiche",
        title: "Fiche complète",
        text: "Photos, prix tout inclus, version, moteur et description restent attachés au véhicule. L’inventaire se synchronise depuis le site de la concession.",
      },
      {
        id: "annonce",
        title: "Annonce Marketplace prête",
        text: "L’extension Chrome préremplit l’annonce Facebook. Vous relisez, puis vous publiez. Suivia ne clique pas à votre place.",
      },
      {
        id: "sold",
        title: "Vendu",
        text: "Le statut passe à vendu dans Suivia. L’équipe voit la même fiche, sans chercher le véhicule dans plusieurs outils.",
      },
    ],
  },
  features: {
    kicker: "Ce que fait l’app",
    title: "Les fonctions réellement en service.",
    items: [
      {
        title: "Synchronisation de l’inventaire",
        text: "Les véhicules du site concessionnaire arrivent dans Suivia avec photos, prix et caractéristiques, pour travailler sur le lot réel.",
      },
      {
        title: "Décodage NIV",
        text: "Le NIV est décodé (NHTSA vPIC, sans frais). La fiche reprend année, marque, modèle, carrosserie, motorisation et rouage lorsqu’ils manquent.",
      },
      {
        title: "Assistant Marketplace",
        text: "L’extension Chrome ouvre Facebook Marketplace, recopie le titre, le prix, la description et tente d’ajouter la photo principale. Le clic Publier reste le vôtre.",
      },
      {
        title: "Mention Carfax",
        text: "Les descriptions d’occasion et de démonstrateurs peuvent inclure une mention Carfax. Par défaut, sans URL, pour éviter un signalement d’annonce.",
      },
    ],
  },
  access: {
    kicker: "Accès",
    title: "Connexion, ou invitation.",
    text: "Les inscriptions publiques sont fermées. Si votre concession utilise déjà Suivia, connectez-vous. Sinon, demandez une invitation à un administrateur de votre équipe.",
    loginCta: "Se connecter",
    closedNote:
      "Aucun compte ne se crée depuis cette page. Un administrateur ouvre l’accès.",
  },
  footer: {
    note: "La publication finale sur Facebook demeure sous votre contrôle.",
  },
} as const;
