# /opt/okauto — production (Suivia Auto)

This file is installed at **`/opt/okauto/README.md`**. Production is a Hostinger VPS behind Traefik v3 (`network_mode: host`, certresolver `letsencrypt`). This is **not** Render.

| Item | Value |
|------|--------|
| Root | `/opt/okauto` |
| Compose file | `/opt/okauto/compose.prod.yml` |
| Project name | `okauto` |
| Images | `ghcr.io/mboyer1269-pixel/okauto-{web,worker}:<git-sha>` (**private** GHCR) |
| Env | `/opt/okauto/.env` (`chmod 600`, root-only) |
| Deploy | GitHub Environment `production` (manual approval) → `ssh deploy@VPS "deploy <sha>"` |
| Do **not** use | `docker-compose.yml`, `src/` bind mounts, `docker compose build` on the VPS |

The VPS **does not compile**. Images are built in GitHub Actions and pulled by `deploy.sh` as root.

> **Ne jamais `docker compose down`** (supprime le réseau externe `okauto`). **Jamais `down -v`**. Arrêter : `docker compose -f /opt/okauto/compose.prod.yml stop && docker compose -f /opt/okauto/compose.prod.yml rm -f`.

## Commandes courantes (root)

```bash
cd /opt/okauto
docker compose --env-file .env -f compose.prod.yml ps
docker compose --env-file .env -f compose.prod.yml logs -f --tail=200 web worker
curl -s https://suivia.ca/api/health          # { status, version==APP_VERSION, db }
curl -s https://suivia.ca/api/health/ready    # worker stale → 503

# Dump local (conservé 14 jours) + offsite si R2/age sont configurés
OKAUTO_ROOT=/opt/okauto /opt/okauto/scripts/backup.sh

# Drill local (dernière dump → okauto_drill → drop)
OKAUTO_ROOT=/opt/okauto /opt/okauto/scripts/restore-drill.sh
```

Le déploiement quotidien passe par GitHub Actions, pas par un `git pull` sur le VPS. L’utilisateur `deploy` est **sans docker** ; sudoers n’autorise que `/opt/okauto/scripts/deploy.sh`.

## Architecture

```
GitHub Actions (CI verte sur main)
  → publish GHCR  ghcr.io/mboyer1269-pixel/okauto-web:<sha>
                  ghcr.io/mboyer1269-pixel/okauto-worker:<sha>
  → environment GitHub `production` (approbation manuelle)
  → ssh deploy@VPS  "deploy <sha>"
        deploy-gate.sh  (ForcedCommand)
        sudo deploy.sh
          dump → rehearsal okauto_rehearsal
          → pull → migrate (one-shot) → up web/worker
          → GET /api/health version==sha
```

`render.yaml` est obsolète.

## Secrets applicatifs (VPS uniquement)

`/opt/okauto/.env` = secrets applicatifs (injectés dans les conteneurs).  
`/opt/okauto/backup.env` = age + R2 + heartbeat backup (**hôte seulement**, chmod 600).  
**Aucun secret dans le dépôt.**

### Lot 2 — à fournir par Michael (quand les comptes existent)

Tout est **éteint** tant que la variable est vide (log « skipped », pas d’erreur), y compris l’alerte sync DÉGRADÉE (`SYNC_DEGRADED_ALERTS`).

| Variable | Où | Rôle |
|----------|----|------|
| `BACKUP_AGE_RECIPIENT` | `/opt/okauto/backup.env` | Clé **publique** age (`age1…`). Générer hors VPS : `age-keygen -o suivia-backup.age`. La clé **privée** ne va **jamais** sur le VPS. |
| `BACKUP_R2_ENDPOINT` | `backup.env` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `BACKUP_R2_BUCKET` | `backup.env` | Bucket R2 **privé** + **lifecycle 30 j** + verrou objet. Pas de prune depuis le VPS. |
| `BACKUP_R2_ACCESS_KEY_ID` / `BACKUP_R2_SECRET_ACCESS_KEY` | `backup.env` | Jeton R2 **écriture seule** (PutObject). Pas de List/Delete. |
| `BACKUP_R2_REGION` | `backup.env` | `auto` (défaut) |
| `BACKUP_R2_PREFIX` | `backup.env` | Préfixe objets, défaut `suivia` |
| `BACKUP_R2_RETENTION_DAYS` | `backup.env` | Documente le lifecycle (min 7, défaut 30). N’efface rien. |
| `BACKUP_HEARTBEAT_URL` | `backup.env` | GET après un backup **nocturne** OK. Pas pingé sur les dumps `--label` (deploy). |
| `SENTRY_DSN` | `.env` | Sentry web + worker. No-op si vide. `release` = `APP_VERSION`. Pas de PII. |
| `WORKER_HEARTBEAT_URL` | `.env` | GET périodique du worker. Alias : `UPTIME_HEARTBEAT_URL`, `BETTERSTACK_HEARTBEAT_URL`. |
| `SYNC_DEGRADED_ALERTS` | `.env` | `1` pour activer l’alerte in-app. **Off par défaut.** |
| `SYNC_ALERT_WEBHOOK_URL` | `.env` | POST JSON optionnel (uniquement si `SYNC_DEGRADED_ALERTS=1`). |
| `SYNC_FETCH_TIMEOUT_MS` / `SYNC_FETCH_MAX_BYTES` | `.env` | Limites HTTP sync (défauts 30s / 8 Mio). |

**GitHub Environment `backup-drill`** (branches de déploiement = `main` seulement). Secrets **d’environment**, pas repository :

| Secret | Rôle |
|--------|------|
| `BACKUP_AGE_IDENTITY` | Contenu du fichier identité age (`AGE-SECRET-KEY-1…`) |
| `BACKUP_R2_ENDPOINT` / `BACKUP_R2_BUCKET` / `BACKUP_R2_ACCESS_KEY_ID` / `BACKUP_R2_SECRET_ACCESS_KEY` | Lecture R2 |
| `BACKUP_R2_REGION` / `BACKUP_R2_PREFIX` | Optionnels (défauts `auto` / `suivia`) |

Le workflow `.github/workflows/backup-restore.yml` sort 0 tant que ces secrets sont vides.

Paquet hôte : `apt-get install -y age` (python3 est déjà là pour `r2.py`, client S3 stdlib — pas d’awscli).

R2 à configurer côté Cloudflare **avant** de remplir `backup.env` : lifecycle « expire after 30 days », object lock si disponible, jeton VPS **PutObject only**.

## GHCR privé

Les paquets `okauto-web` et `okauto-worker` restent **privés**.

```bash
echo '<PAT read:packages>' | docker login ghcr.io -u <github-username> --password-stdin
chmod 600 /root/.docker/config.json
```

Ne pas mettre le PAT dans `.env`.

## Secrets et variables GitHub (déploiement)

Environment **`production`** (reviewer Michael) :

| Secret | Rôle |
|--------|------|
| `VPS_HOST` | Hôte / IP |
| `VPS_KNOWN_HOSTS` | `ssh-keyscan -t ed25519,rsa <host>` |
| `VPS_DEPLOY_KEY` | ed25519 dédiée → utilisateur `deploy` |

| Variable | Défaut |
|----------|--------|
| `VPS_USER` | `deploy` |
| `PRODUCTION_HEALTH_URL` | `https://suivia.ca/api/health` |

`JWT_SECRET`, `DATABASE_URL`, AWS, PAT GHCR, clés R2 **écriture** ne vont pas dans GitHub. Le drill utilise l’environment `backup-drill` (jeton lecture + identité age).

## Mise en place VPS (une fois)

1. Snapshot Hostinger.
2. Clé dédiée : `ssh-keygen -t ed25519 -f suivia-github-deploy -C suivia-github-deploy -N ""`
3. `sudo bash deploy/scripts/install-host.sh /chemin/deploy` — crée `deploy` (shell `/bin/bash`, hors groupe docker), `/opt/okauto` **chmod 751**, copie `compose.prod.yml`, `scripts/`, **ce README** et `RUNBOOK.md`, sudoers limité à `deploy.sh`, réseau `okauto`.
4. Remplir `/opt/okauto/.env` (`chmod 600`). `DATABASE_URL` → `postgres:5432`, **pas** `127.0.0.1:5433`. Les clés backup/R2 vont dans `/opt/okauto/backup.env`, pas dans `.env`.
5. **Ne pas** `docker network connect okauto <traefik>` (Traefik est `network_mode: host`).
6. `docker login ghcr.io` root.
7. `authorized_keys` de `deploy` — une ligne ForcedCommand :
   ```
   command="/opt/okauto/scripts/deploy-gate.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA... suivia-github-deploy
   ```
8. Cron : copier `deploy/cron.d/okauto-backup` → `/etc/cron.d/okauto-backup`.
9. `apt-get install -y age` avant d’activer R2.

Sudoers (`deploy/sudoers.deploy`) — **ne pas modifier** :

```
deploy ALL=(root) NOPASSWD: /opt/okauto/scripts/deploy.sh
```

## Mise à jour des fichiers hôte

Après un merge qui change `deploy/scripts`, `compose.prod.yml`, `README.md` ou `RUNBOOK.md`, recopier en root (ou relancer `install-host.sh`) **avant** le deploy suivant. Le SSH n’autorise que `deploy <sha>`.

## Rollback

- Auto : health SHA échoue → `deploy.sh` re-tire le SHA de `.deployed`. Schéma **non** annulé.
- Manuel : Actions → Deploy → `sha` = ancêtre de `origin/main`.
- Dernier recours : dump + procédure `RUNBOOK.md` (offsite age+R2).

Migrations expand/contract uniquement. CI : `scripts/check-destructive-migrations.sh`.

## Santé et files

- `GET /api/health` — liveness + SHA. Reste 200 si le worker est mort.
- `GET /api/health/ready` — db / redis / worker.
- Worker : schedulers BullMQ (`tick` 5 min, `reminders` 1 h, `degraded` 15 min), pas de `setInterval` métier. Les schedulers suffisent au démarrage (pas d’appel direct en double).
- Sync DÉGRADÉE : **off** sans `SYNC_DEGRADED_ALERTS=1`. Quand activé : sources **actives** seulement, notif SYSTEM 1×/jour/org + webhook optionnel.
