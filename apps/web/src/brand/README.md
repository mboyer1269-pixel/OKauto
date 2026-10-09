# Marque Suivia

Source unique de la piste **active** : `spec.json`.

Le pictogramme React (`logo-mark.tsx`), le mot-symbole hachuré (`wordmark.tsx`), le favicon, les icônes Chrome, l’image Open Graph et les jetons CSS (`generated/tokens.css`) sont dérivés de ce fichier via `pnpm brand:assets`.

Direction actuelle : **D — Le NIV** (mot-symbole « SUIVIA AUTO » hachuré, dégradé marine → cyan, flèche). A, B et C restent disponibles.

Ne jamais écrire « SuiviaAuto ». Le mot-symbole est « SUIVIA AUTO » (deux mots).

## Changer de direction

```bash
cp apps/web/src/brand/directions/D.json apps/web/src/brand/spec.json   # ou A.json / B.json / C.json
pnpm brand:assets
```

| Piste | Nom | `mark.kind` | Fichier |
| --- | --- | --- | --- |
| A | Le Tracé | `stroke-s` | `directions/A.json` |
| B | Le Code | `vin-bars` | `directions/B.json` |
| C | Le Repère | `map-pin` | `directions/C.json` |
| D | Le NIV (active) | `hatched-s` | `directions/D.json` |

Les formes des lettres D sont dans `letterforms.json`. Les points et le V coupé de l’esquisse générée ne sont **pas** reproduits.

Ne pas dupliquer des SVG à la main dans `app/icon.svg` ni dans `apps/extension/public/icons`.
