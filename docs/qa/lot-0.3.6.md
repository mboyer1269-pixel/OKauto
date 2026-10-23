# QA lot 0.3.6 — extension + web

Version extension : **0.3.6**. Branche : `fix/extension-autofill-0.3.5`. Ne pas merger ni déployer.

Zip : `/opt/cursor/artifacts/Suivia-Auto-Extension-Chrome-v0.3.6.zip` (manifest à la racine, version 0.3.6).

La migration `20261023200000_drop_marketplace_leads` est isolée et destructive. En production : dump R2 d’abord (voir `deploy/RUNBOOK.md`).

Automatisé ici : shared 106, extension 20, web unit 48, web int 110, e2e Playwright 13/13.

## 1. Photos Marketplace

| Étape | Attendu | Résultat |
| --- | --- | --- |
| Publier depuis Suivia ouvre le formulaire create | Formulaire véhicule | **PASS** code (Facebook live : non) |
| Service worker fetch `GET_VEHICLE_PHOTO` | Images en base64 via host_permissions Suivia | **PASS** + proxy suit les redirects HTTPS |
| `File` + `DataTransfer` sur `input[type=file][accept*=image]` | Caché, multiple, `image/*,heif,heic,video/*`, input+change bubbles | **PASS** unit |
| MutationObserver + timeout | Pas de 1200 ms fixe | **PASS** `waitForPredicate` |
| Vignettes | Compteur + étape `verify_thumbnails` | **PASS** code |
| Sélecteurs | aria-label / rôles FR+EN, pas de classes obfusquées | **PASS** unit |
| Échec | Log d’étape (`find_photo_input`, `fetch_photos`, `assign_files`, `verify_thumbnails`) | **PASS** code |

## 2. Clés API

| Étape | Attendu | Résultat |
| --- | --- | --- |
| `revokedAt` lu à chaque requête | 401 si révoquée | **PASS** `api-key-revocation` |
| Révoquer une clé | `isActive=false` + `revokedAt` + audit | **PASS** |
| Nettoyer les révoquées | Suppression + audit | **PASS** |
| Clé locale | `chrome.storage.local` | **PASS** code |
| 401 | clé locale effacée | **PASS** code |

## 3. Relier mes annonces

URL canonique : `https://www.facebook.com/marketplace/item/<id numérique>/`.

| Étape | Attendu | Résultat |
| --- | --- | --- |
| Relier depuis l’extension | Lit l’onglet Facebook connecté (content script) | **PASS** code + unit session |
| Hors session | Message clair, page vide | **PASS** unit `logged_out` |
| VIN > stock | Liaison automatique | **PASS** shared + API int |
| Titre approximatif | `needs_confirmation`, pas d’auto-lien | **PASS** shared |
| Dashboard Relier | `externally_connectable` Suivia + postMessage origin+nonce | **PASS** code |
| `sender.origin` | origines Suivia seulement | **PASS** code |

## 4. Concessionnaire

| Étape | Attendu | Résultat |
| --- | --- | --- |
| Paramètres tenant | nom, logo URL, marques, codes | **PASS** code |
| Défauts | Suivia Auto si nom vide | **PASS** `displayDealershipName` |
| Extension | lit branding via API | **PASS** code |
| CI | échoue si Buckingham / « Chevrolet Buick GMC » | **PASS** `no-hardcoded-dealership.unit.test.ts` |

## 5. Leads

| Étape | Attendu | Résultat |
| --- | --- | --- |
| Navigation / pages / API | retirés | **PASS** |
| Client présent | véhicule `PENDING`, sans table leads | **PASS** int |
| Activer | remet `AVAILABLE` | **PASS** code |
| DROP | fichier isolé, après backup seulement | **PASS** migration + RUNBOOK |

## Facebook réel seulement

- Upload photos sur le formulaire create live (React + HEIC).
- Relier sur `marketplace/you/selling` avec session Facebook.
- Login wall hors session sur Facebook.
- `externally_connectable` depuis suivia.ca vers l’ID d’extension packagé (Chrome Web Store / unpacked ID).

## Captures

Le MCP navigateur n’était pas disponible. Vérification UI = Playwright e2e 13/13 (landing, login, dashboard). Pas de capture Facebook.
