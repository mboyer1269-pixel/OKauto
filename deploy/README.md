# Déploiement Suivia Auto (VPS Hostinger)

Production : **Hostinger VPS**, répertoire `/opt/okauto`, derrière un Traefik v3 **déjà en place** (certresolver `letsencrypt`, HTTP-01, **`network_mode: host`**). Ce n’est **pas** Render. Les images immuables sont construites en CI, poussées sur GHCR (paquets **privés**), marquées par le SHA git, puis tirées sur le VPS.

`render.yaml` est obsolète. Ne plus déployer via Render.

## Architecture

```
GitHub Actions (CI verte sur main)
  → publish GHCR  ghcr.io/mboyer1269-pixel/okauto-web:<sha>
                  ghcr.io/mboyer1269-pixel/okauto-worker:<sha>
  → environment GitHub `production` (approbation manuelle, 30 jours)
  → ssh deploy@VPS  "deploy <sha>"
        deploy-gate.sh  (commande forcée)
        sudo deploy.sh
          dump → répétition de migration (okauto_rehearsal)
          → pull → migrate (one-shot) → up web/worker
          → GET /api/health version==sha
          → sinon retour arrière applicatif par tag SHA (schéma non annulé)
```

Le VPS **ne compile plus**. Source de vérité des images = **GHCR**. Un `docker image prune -af` nocturne (Oria) peut supprimer les copies locales, y compris le tag `:previous` si aucun conteneur ne les utilise. `deploy.sh` re-tire toujours le SHA depuis GHCR. Le tag `:previous` n’est qu’un raccourci local, pas une protection contre le prune.

## GHCR privé (décision propriétaire)

Les paquets `okauto-web` et `okauto-worker` restent **privés**. Ne pas les rendre publics.

Le job GitHub `publish` pousse avec `GITHUB_TOKEN`. Le VPS tire en root :

```bash
# PAT classic ou fine-grained, scope read:packages uniquement (pas repo write)
echo '<PAT>' | docker login ghcr.io -u <github-username> --password-stdin
chmod 600 /root/.docker/config.json
```

`deploy.sh` s’exécute via sudo root, donc ce login suffit. Ne pas stocker le PAT dans `/opt/okauto/.env`.

## Secrets et variables GitHub (noms seulement)

Créer l’environment **`production`** (Settings → Environments) avec un relecteur requis (Michael). Puis :

**Secrets** (environment `production`, ou repository si vous préférez) :

| Nom | Rôle |
|-----|------|
| `VPS_HOST` | Nom d’hôte ou IP du VPS |
| `VPS_KNOWN_HOSTS` | Ligne `ssh-keyscan -t ed25519,rsa <host>` (épinglage, jamais `StrictHostKeyChecking=no`) |
| `VPS_DEPLOY_KEY` | Clé privée ed25519 **dédiée** (uniquement ce dépôt → utilisateur `deploy`) |

**Variables** (optionnelles) :

| Nom | Défaut |
|-----|--------|
| `VPS_USER` | `deploy` |
| `PRODUCTION_HEALTH_URL` | `https://suivia.ca/api/health` |

Aucun secret applicatif (`JWT_SECRET`, `DATABASE_URL`, clés AWS, PAT GHCR) ne doit être dans GitHub pour ce lot — ils restent sur le VPS (`/opt/okauto/.env` chmod 600, `/root/.docker/config.json` chmod 600).

## Mise en place VPS (une fois, après snapshot Hostinger)

Ne supposez pas que l’utilisateur `deploy` existe déjà.

1. Snapshot du VPS dans hPanel.
2. En local, générer une clé **uniquement** pour ce flux :
   ```bash
   ssh-keygen -t ed25519 -f suivia-github-deploy -C suivia-github-deploy -N ""
   ```
   Coller la **privée** dans le secret `VPS_DEPLOY_KEY`. Ne jamais réutiliser votre clé perso.
3. Copier le dossier `deploy/` du dépôt sur le VPS (temporairement en root), puis :
   ```bash
   sudo bash /chemin/deploy/scripts/install-host.sh /chemin/deploy
   ```
   Ce script crée l’utilisateur `deploy` (hors groupe `docker`, shell `/bin/bash` — OpenSSH exécute la ForcedCommand via le shell ; `nologin` cassait `ssh deploy@… "deploy <sha>"`). `/opt/okauto` est **chmod 751** (pas 750) pour que `deploy` traverse jusqu’à `scripts/deploy-gate.sh`. Copie compose/scripts, installe sudoers limité à `deploy.sh`, crée le réseau Docker `okauto`.
4. Remplir `/opt/okauto/.env` à partir de `.env.prod.example` (`chmod 600`).
   `DATABASE_URL` doit pointer vers l’hôte compose `postgres:5432`, **pas** `127.0.0.1:5433`.
5. **Ne pas** `docker network connect okauto <traefik>`. Traefik tourne en `network_mode: host` et Docker refuse de l’attacher à un bridge. Traefik atteint déjà les IP du réseau `okauto` ; le label `traefik.docker.network=okauto` suffit. `web` n’expose **aucun** port hôte (identique à la prod actuelle).
6. `docker login ghcr.io` en root (PAT `read:packages`), voir plus haut.
7. `authorized_keys` de `deploy` — **une seule ligne**, commande forcée :
   ```
   command="/opt/okauto/scripts/deploy-gate.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA... suivia-github-deploy
   ```
   `chown -R deploy:deploy /home/deploy && chmod 600 /home/deploy/.ssh/authorized_keys`
8. Vérifier :
   ```bash
   ssh -i suivia-github-deploy deploy@VPS bash          # ForcedCommand refuse un shell libre
   ssh -i suivia-github-deploy deploy@VPS "deploy $(git rev-parse HEAD)"  # seulement après images GHCR
   ```
9. Remplir `VPS_KNOWN_HOSTS` :
   ```bash
   ssh-keyscan -t ed25519,rsa VOS_HÔTES >> known_hosts_snip
   ```
10. Migrer le cron de backup : copier `deploy/cron.d/okauto-backup` vers `/etc/cron.d/okauto-backup` (voir RUNBOOK).

Sudoers installé (`deploy/sudoers.deploy`) :

```
deploy ALL=(root) NOPASSWD: /opt/okauto/scripts/deploy.sh
```

## Diff avec le compose actuellement sur le VPS

Le compose versionné ici reprend le modèle `/opt/okauto` (Traefik par labels + `traefik.docker.network=okauto`, **pas de port hôte sur web**, Postgres lié à `127.0.0.1:5433`, Redis à `127.0.0.1:6379`) et y ajoute ce que le sprint 2 exige :

| Sujet | Changement |
|-------|------------|
| Images | `ghcr.io/mboyer1269-pixel/okauto-{web,worker}:${APP_VERSION}` au lieu d’un build local |
| Worker | Image **séparée** (plus d’image web + `RUN_EMBEDDED_WORKER`) |
| Migrations | Service `migrate` one-shot (`restart: "no"`), `web`/`worker` attendent `service_completed_successfully` |
| Santé | `/api/health` (liveness + SHA), heartbeat fichier worker, labels Traefik healthcheck |
| Redis | `--appendonly yes --maxmemory-policy noeviction` |
| Limites | web 1 Go, worker 512 Mo, postgres 1 Go, redis 256 Mo |
| Durcissement | `init: true`, `no-new-privileges`, `stop_grace_period: 60s`, logs json-file 10 Mo × 5 |
| www | un seul router `Host(suivia.ca \|\| www.suivia.ca)` + service port 3000 + middleware redirect 301 (pattern prod) |

Les secrets et volumes Postgres/Redis **restent sur le VPS**. Ce fichier ne les contient pas.

## Mise à jour des scripts

Le déploiement SSH n’autorise que `deploy <sha>`. Après un merge qui change `deploy/scripts` ou `compose.prod.yml`, recopier ces fichiers en root vers `/opt/okauto` (ou relancer `install-host.sh`) **avant** le déploiement suivant.

## Rollback (applicatif seulement)

- Automatique : si le health check SHA échoue, `deploy.sh` re-tire le SHA dans `.deployed` depuis GHCR et relance web/worker. **Le schéma SQL n’est pas annulé.**
- Manuel : Actions → **Deploy** → `Run workflow` → champ `sha` = ancien SHA (7–40 hex, **ancêtre de `origin/main`** — le workflow refuse un SHA de branche).
- Dernier recours : restaurer le dump pré-deploy — procédure manuelle dans `RUNBOOK.md`.

Toute migration livrée avec un SHA doit rester compatible avec le SHA précédent (expand/contract). Voir `packages/database/prisma/MIGRATIONS.md`. CI : `scripts/check-destructive-migrations.sh`.

## Health

- `GET /api/health` → `{ status, version, db }` — `version` doit égaler le SHA déployé. Reste 200 si le worker est mort.
- `GET /api/health/ready` → booléens/âges (db, redis, worker). Worker arrêté → 503 `worker: "stale"`.
