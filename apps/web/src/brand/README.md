# Marque Suivia

Source unique : `spec.json`. Le pictogramme, le favicon, les icônes Chrome et l’image Open Graph sont générés par `pnpm brand:assets` (script `scripts/generate-brand-assets.mjs`).

Direction actuelle : **B — Le Code** (17 barres = 17 caractères d’un NIV). Le propriétaire n’a pas encore tranché entre A, B et C.

## Changer de direction (A, B ou C)

1. Remplacer `spec.json` (couleurs, `mark.kind`, géométrie).
2. Si le `kind` n’est pas `vin-bars`, ajouter le rendu correspondant dans `logo-mark.tsx` **et** dans le script de génération.
3. Lancer `pnpm brand:assets`.
4. Le composant `BrandMark` affiche le mot-symbole `SUIVIA` et le descripteur `Auto` séparément — jamais « SuiviaAuto ».

Ne pas dupliquer des SVG à la main dans `app/icon.svg` ni dans `apps/extension/public/icons`.
