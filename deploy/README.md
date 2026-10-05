# Déploiement Suivia Auto (VPS Hostinger)

Production : **Hostinger VPS**, répertoire `/opt/okauto`, derrière un Traefik v3 **déjà en place** (certresolver `letsencrypt`, HTTP-01). Ce n’est **pas** Render. Les images immuables sont construites en CI, poussées sur GHCR, marquées par le SHA git, puis tirées sur le VPS.

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
          → sinon retour arrière par tag SHA
```

Le VPS **ne compile plus**. Retour arrière = re-tirer le SHA précédent depuis GHCR (résiste au `docker image prune` nocturne d’Oria, à condition de garder le tag SHA et `:previous`).

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

`GITHUB_TOKEN` suffit pour pousser sur GHCR (packages du même dépôt). Aucun secret applicatif (`JWT_SECRET`, `DATABASE_URL`, clés AWS) ne doit être dans GitHub pour ce lot — ils restent dans `/opt/okauto/.env` (chmod 600).

Après le **premier** push GHCR, rendre les paquets `okauto-web` et `okauto-worker` **publics** (Packages → Package settings → Change visibility). Tant que le dépôt est public, le VPS n’a pas besoin de jeton de lecture GHCR.

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
   Ce script crée l’utilisateur `deploy` (hors groupe `docker`, shell `nologin`), copie compose/scripts, installe sudoers limité à `deploy.sh`, crée le réseau Docker `okauto`.
4. Remplir `/opt/okauto/.env` à partir de `.env.prod.example` (`chmod 600`).
5. Brancher Traefik sur le réseau `okauto` :
   ```bash
   docker network connect okauto <nom-du-conteneur-traefik>
   ```
6. `authorized_keys` de `deploy` — **une seule ligne**, commande forcée :
   ```
   command="/opt/okauto/scripts/deploy-gate.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA... suivia-github-deploy
   ```
   `chown -R deploy:deploy /home/deploy && chmod 600 /home/deploy/.ssh/authorized_keys`
7. Vérifier :
   ```bash
   ssh -i suivia-github-deploy deploy@VPS bash          # doit être refusé
   ssh -i suivia-github-deploy deploy@VPS "deploy $(git rev-parse HEAD)"  # seulement après images GHCR
   ```
8. Remplir `VPS_KNOWN_HOSTS` :
   ```bash
   ssh-keyscan -t ed25519,rsa VOS_HÔTES >> known_hosts_snip
   ```

Sudoers installé (`deploy/sudoers.deploy`) :

```
deploy ALL=(root) NOPASSWD: /opt/okauto/scripts/deploy.sh
```

## Diff avec le compose actuellement sur le VPS

Le compose versionné ici reprend le modèle `/opt/okauto` (Traefik par labels, réseau `okauto`, Postgres lié à `127.0.0.1:5433`, Redis à `127.0.0.1:6379`) et y ajoute ce que le sprint 2 exige :

| Sujet | Changement |
|-------|------------|
| Images | `ghcr.io/mboyer1269-pixel/okauto-{web,worker}:${APP_VERSION}` au lieu d’un build local |
| Worker | Image **séparée** (plus d’image web + `RUN_EMBEDDED_WORKER`) |
| Migrations | Service `migrate` one-shot (`restart: "no"`), `web`/`worker` attendent `service_completed_successfully` |
| Santé | `/api/health` (liveness + SHA), heartbeat fichier worker, labels Traefik healthcheck |
| Redis | `--appendonly yes --maxmemory-policy noeviction` |
| Limites | web 1 Go, worker 512 Mo, postgres 1 Go, redis 256 Mo |
| Durcissement | `init: true`, `no-new-privileges`, `stop_grace_period: 60s`, logs json-file 10 Mo × 5 |
| www | redirection permanente `www.suivia.ca` → `suivia.ca` |

Les secrets et volumes Postgres/Redis **restent sur le VPS**. Ce fichier ne les contient pas.

## Mise à jour des scripts

Le déploiement SSH n’autorise que `deploy <sha>`. Après un merge qui change `deploy/scripts` ou `compose.prod.yml`, recopier ces fichiers en root vers `/opt/okauto` (ou relancer `install-host.sh`) **avant** le déploiement suivant.

## Rollback

- Automatique : si le health check SHA échoue, `deploy.sh` re-tire le SHA dans `.deployed` (tag `:previous` + tag SHA).
- Manuel : Actions → **Deploy** → `Run workflow` → champ `sha` = ancien SHA 40 caractères.

## Health

- `GET /api/health` → `{ status, version, db }` — `version` doit égaler le SHA déployé. Reste 200 si le worker est mort.
- `GET /api/health/ready` → booléens/âges (db, redis, worker). Worker arrêté → 503 `worker: "stale"`.
