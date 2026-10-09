import { landingCopy, landingHrefs } from "./landing";

export const accessRequestCopy = {
  title: "Demander un accès",
  lede: "Les inscriptions publiques sont fermées. Laissez vos coordonnées : un propriétaire traitera la demande. Aucun compte n’est créé ici.",
  submitted: "Votre demande a été enregistrée.",
  fields: {
    name: "Nom",
    dealership: "Concession",
    email: "Courriel",
    phone: "Téléphone",
    phoneOptional: "optionnel",
    message: "Message",
  },
  consent:
    "J’accepte que ces renseignements soient conservés 12 mois pour traiter ma demande d’accès (Loi 25). L’adresse IP est enregistrée 30 jours pour prévenir les abus.",
  privacy: landingCopy.footer.privacy,
  submit: "Envoyer la demande",
  login: landingCopy.nav.login,
  dashboard: {
    title: "Demandes d’accès",
    empty: "Aucune demande pour le moment.",
    forbidden: "Réservé aux administrateurs de la plateforme.",
    consent: "Consentement",
    actions: "Actions",
    delete: "Supprimer",
    deleteConfirm: "Supprimer définitivement cette demande d’accès ?",
  },
} as const;

export const accessRequestHrefs = {
  privacy: landingHrefs.privacy,
  login: landingHrefs.login,
  form: "/demande-acces",
} as const;
