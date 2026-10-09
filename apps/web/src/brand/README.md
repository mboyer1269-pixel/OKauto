# Marque Suivia

Source unique de la piste **active** : `spec.json`.

Le pictogramme React (`logo-mark.tsx`), le mot-symbole (`BrandMark`), le favicon, les icônes Chrome, l’image Open Graph et les jetons CSS (`generated/tokens.css`) sont tous dérivés de ce fichier via `pnpm brand:assets` (`scripts/generate-brand-assets.mjs` + `scripts/brand-mark.mjs`).

Direction actuelle : **B — Le Code** (17 barres = 17 caractères d’un NIV). Le propriétaire n’a pas encore tranché entre A, B et C.

Ne jamais écrire « SuiviaAuto ». Le mot-symbole et le descripteur `Auto` sont des champs séparés.

## Changer de direction (A, B ou C)

Les trois pistes sont déjà implémentées. Il suffit de remplacer la spec active et de régénérer les fichiers dérivés :

```bash
cp apps/web/src/brand/directions/A.json apps/web/src/brand/spec.json   # ou B.json / C.json
pnpm brand:assets
```

| Piste | Nom | `mark.kind` | Fichier |
| --- | --- | --- | --- |
| A | Le Tracé | `stroke-s` | `directions/A.json` |
| B | Le Code (active) | `vin-bars` | `directions/B.json` |
| C | Le Repère | `map-pin` | `directions/C.json` |

Ne pas dupliquer des SVG à la main dans `app/icon.svg` ni dans `apps/extension/public/icons`.
