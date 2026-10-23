# QA lot 0.3.6 — extension + web

Version extension : **0.3.6**. Branche : `fix/extension-autofill-0.3.5`. Ne pas merger ni déployer.

La migration `20261023200000_drop_marketplace_leads` est isolée et destructive. En production : dump R2 d’abord (voir `deploy/RUNBOOK.md`).

## 1. Photos Marketplace

| Étape | Attendu | Résultat |
| --- | --- | --- |
| Publier depuis Suivia ouvre le formulaire create | Formulaire véhicule | *à exécuter* |
| Service worker fetch `GET_VEHICLE_PHOTO` (host_permissions Suivia) | Images en base64 | *à exécuter* |
| Content script pose `File` + `DataTransfer` sur `input[type=file][accept*=image]` (caché, multiple, `image/*,heif,heic,video/*`) | `input` + `change` bubbles | *à exécuter* |
| MutationObserver + timeout, pas de 1200 ms fixe | Formulaire et input détectés | *à exécuter* |
| Vignettes | Au moins une miniature, sinon log `verify_thumbnails` | *à exécuter* |
| Sélecteurs | aria-label / rôles FR+EN, pas de classes obfusquées | *à exécuter* |
| Échec | Bannière + étape (`find_photo_input`, `fetch_photos`, `assign_files`, `verify_thumbnails`) | *à exécuter* |

Facebook réel seulement : le DOM create réel, HEIC/HEIF, et l’acceptation React de `DataTransfer`.

## 2. Clés API

| Étape | Attendu | Résultat |
| --- | --- | --- |
| `revokedAt` lu à chaque requête | 401 si révoquée | *à exécuter* |
| Révoquer une clé | `isActive=false` + `revokedAt` + audit | *à exécuter* |
| Nettoyer les révoquées | Suppression + audit | *à exécuter* |
| Clé locale | `chrome.storage.local` | *à exécuter* |
| 401 | clé locale effacée | *à exécuter* |

## 3. Relier mes annonces

URL canonique : `https://www.facebook.com/marketplace/item/<id numérique>/`.

| Étape | Attendu | Résultat |
| --- | --- | --- |
| Relier depuis l’extension | Lit l’onglet Facebook connecté (content script) | *à exécuter* |
| Hors session | Bannière : page vide, se connecter | *à exécuter* |
| VIN > stock | Liaison automatique | *à exécuter* |
| Titre approximatif | `needs_confirmation`, pas d’auto-lien | *à exécuter* |
| Dashboard Relier | `externally_connectable` Suivia + postMessage origin+nonce | *à exécuter* |
| `sender.origin` | origines Suivia seulement | *à exécuter* |

Facebook réel seulement : session Marketplace, SPA « Vos annonces », login wall.

## 4. Concessionnaire

| Étape | Attendu | Résultat |
| --- | --- | --- |
| Paramètres tenant | nom, logo URL, marques, codes | *à exécuter* |
| Défauts | Suivia Auto si nom vide | *à exécuter* |
| Extension | lit `logoUrl` / `brands` / `dealerCodes` via API | *à exécuter* |
| CI | `no-hardcoded-dealership.test.ts` échoue si Buckingham ou « Chevrolet Buick GMC » | *à exécuter* |

## 5. Leads

| Étape | Attendu | Résultat |
| --- | --- | --- |
| Navigation / pages / API | retirés | *à exécuter* |
| Client présent | véhicule `PENDING`, sans table leads | *à exécuter* |
| Activer | remet `AVAILABLE` | *à exécuter* |
| DROP | fichier isolé, après backup seulement | *à exécuter* |

## Hors Facebook réel (automatisable ici)

- Tests unitaires photos, session, URLs numériques, approx+confirmation, CI Buckingham.
- Tests API clés `revokedAt` + cleanup.
- Client présent.
- Playwright e2e existants + simulation create/photo si le harness le permet.

## Facebook réel (non automatisable ici)

- Upload photos sur le formulaire create live.
- Relier sur `marketplace/you/selling` connecté.
- Détection login wall hors session.
- `externally_connectable` depuis suivia.ca vers l’ID d’extension packagé.
