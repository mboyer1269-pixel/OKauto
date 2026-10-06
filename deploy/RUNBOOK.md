# Runbook production Suivia Auto

Racine VPS : `/opt/okauto`. Compose : `compose.prod.yml`. État : `.deployed` (SHA actuel). `APP_VERSION` dans `.env` est aligné sur ce SHA après chaque deploy réussi.

> **Ne jamais `docker compose down`** sur le projet `okauto` : `down` **supprime le réseau** `okauto`, que `compose.prod.yml` déclare `external: true`. Le deploy suivant échoue alors (« network okauto declared as external, but could not be found »).
>
> Arrêter l’ancienne stack : `docker compose stop` puis `docker compose rm -f` (conteneurs seulement). Recréer le réseau si besoin : `docker network create okauto`.
>
> **Ne jamais `down -v`** (ni `down --volumes`) : cela **détruit** `postgres_data` / `redis_data`.

## [ ] BLOQUANT — GHCR privé (juste après le premier publish)

Les paquets doivent rester **Private**. Après le **premier** job `publish` réussi :

- [ ] GitHub → Packages → `okauto-web` → Package settings → visibilité **Private**
- [ ] GitHub → Packages → `okauto-worker` → Package settings → visibilité **Private**
- [ ] Vérifier qu’un pull **anonyme** échoue (sur une machine sans `docker login`) :

```bash
docker logout ghcr.io
docker pull ghcr.io/mboyer1269-pixel/okauto-web:<sha>
# attendu : denied / unauthorized (pas de layers)
docker pull ghcr.io/mboyer1269-pixel/okauto-worker:<sha>
# attendu : denied / unauthorized
```

Puis reconnecter le VPS en **root** :

```bash
echo '<PAT read:packages>' | docker login ghcr.io -u <github-user> --password-stdin
chmod 600 /root/.docker/config.json
```

Sans cette case, n’importe qui tire le binaire applicatif.

## Déployer

1. CI verte sur `main` (jobs `quality`, `test`, `images`).
2. Le workflow **Deploy** pousse les images GHCR (paquets **privés**) puis attend l’approbation environment `production`.
3. Approuver. Le job SSH exécute `deploy <sha>` (≤ 10 min : postgres+redis up → dump → répétition de migration → pull → migrate → up web/worker → health → `APP_VERSION` dans `.env`).
4. Vérifier `curl -s https://suivia.ca/api/health` — `version` = SHA, `status` = `ok`.

`deploy.sh` démarre **postgres et redis** (`docker compose up -d --wait`) avant le dump, la répétition, `migrate`, et avant `up --no-deps web worker`. Un premier cutover ou un `stop` + `rm -f` fonctionne donc sans démarrer la data plane à la main.

Ne pas déployer à la main depuis un PC en root. Exception : copie unique des scripts (voir `README.md`).

`workflow_dispatch` refuse un SHA qui n’est pas un ancêtre de `origin/main` (pas de publish/deploy d’une branche non mergée).

## Revenir en arrière (app seulement)

```text
GitHub → Actions → Deploy → Run workflow → sha=<ancien SHA 7–40 hex, ancêtre de main> → approuver
```

Le SHA doit déjà exister sur GHCR **et** être un ancêtre de `origin/main`. `deploy.sh` **re-tire** l’image depuis GHCR (source de vérité). Le tag local `:previous` ne survit **pas** à `docker image prune -af`.

En urgence sur le VPS (root) :

```bash
sudo /opt/okauto/scripts/deploy.sh <ancien-sha-40>
```

**Le rollback ne ramène pas le schéma.** `prisma migrate deploy` n’est pas inversé. Les migrations doivent être expand/contract (compatibles avec le SHA précédent). Voir `packages/database/prisma/MIGRATIONS.md`. Une migration `DROP` / `TRUNCATE` / `RENAME` / `ALTER TYPE` / `SET NOT NULL` sans défaut exige le fichier `ALLOW_DESTRUCTIVE` (CI) et un plan de restore.

## Sauvegardes

Cron (`/etc/cron.d/okauto-backup`) : `15 3 * * *` → `/opt/okauto/scripts/backup.sh` → log `/opt/okauto/backups/backup.log`.

1. **Local (toujours)** : `pg_dump -Fc` → `/opt/okauto/backups/suivia-<UTC>.dump`, contrôle taille + `pg_restore -l`, rétention locale `BACKUP_RETENTION_DAYS` (14, dans `backup.env`).
2. **Hors VPS (si configuré dans `backup.env`)** : `offsite-backup.sh` emballe dump + `.env` + `backup.env`, chiffre avec `age`, envoie sur R2. Vérifie taille + `x-amz-meta-sha256`. **Aucun prune** : rétention = lifecycle R2 (30 j). Jeton VPS write-only.
3. Si R2 n’est pas configuré : `offsite backup skipped: R2 not configured` puis exit 0. Le dump local reste.
4. Si R2 est configuré sans `BACKUP_AGE_RECIPIENT` : **refus** d’uploader du plaintext (exit 1 **de l’offsite seulement**).
5. `backup.sh --label …` (appelé par `deploy.sh`) : dump local seulement — pas d’offsite, pas de heartbeat. Un échec R2 **ne fait jamais échouer** le deploy.
6. Heartbeat `BACKUP_HEARTBEAT_URL` : GET après un nocturne dont l’offsite a réussi ou a été skippé proprement. Pas pingé si l’offsite échoue (Better Stack alerte alors).

```bash
# manuel
sudo OKAUTO_ROOT=/opt/okauto /opt/okauto/scripts/backup.sh
tail -n 50 /opt/okauto/backups/backup.log
```

Prérequis hôte pour l’offsite : `apt-get install -y age`. Générer la paire **hors VPS** :

```bash
age-keygen -o suivia-backup.age
# ligne « public key: age1… » → BACKUP_AGE_RECIPIENT dans /opt/okauto/backup.env
# fichier identité (AGE-SECRET-KEY-1…) → coffre-fort + secret Environment `backup-drill`
# ne jamais copier l’identité sur le VPS
```

R2 : bucket privé, **lifecycle 30 jours**, jeton VPS **PutObject only**, jeton **lecture seule** dans l’environment GitHub `backup-drill` (branches = `main`).

## Restaurer un dump

**Snapshot Hostinger avant.** Ne pas automatiser une restore « réelle » dans `deploy.sh`. Ne jamais `down` / `down -v`.

### Drill local (dump encore sur le VPS)

```bash
sudo OKAUTO_ROOT=/opt/okauto /opt/okauto/scripts/restore-drill.sh
```

### Drill hors site (âge + R2) — laptop ou GitHub Actions

L’identité age est requise. Sur le VPS de prod ce script ne doit **pas** avoir la clé privée.

```bash
# depuis une machine qui a l’identité + un jeton R2 lecture
export BACKUP_AGE_IDENTITY_FILE=./suivia-backup.age
export BACKUP_R2_ENDPOINT=https://<ACCOUNT>.r2.cloudflarestorage.com
export BACKUP_R2_BUCKET=…
export BACKUP_R2_ACCESS_KEY_ID=…          # read-only
export BACKUP_R2_SECRET_ACCESS_KEY=…
bash deploy/scripts/restore-offsite.sh --latest
```

Le script lève un Postgres jetable (`--network none`), `pg_restore`, exige orgs ≥ 1, users ≥ 1, vehicles ≥ 100, puis `docker rm -fv`.

Workflow mensuel : Actions → **Backup restore drill** (environment `backup-drill`, limité à `main`). Sort 0 tant que les secrets d’environment sont vides.

### Restauration réelle (maintenance)

Restaurer vers une **nouvelle** base, pointer `DATABASE_URL`, basculer. Ne pas écraser `postgres_data` à chaud.

RPO 24 h / RTO 1 h une fois R2+age actifs.

## Reconstruire le VPS de zéro

1. Nouveau VPS, Docker, Traefik v3 (certresolver `letsencrypt`, entrypoints `web` / `websecure`, **`network_mode: host`**) comme aujourd’hui pour Oria.
2. Relancer `install-host.sh`, réseau `okauto` (sans `docker network connect` Traefik), `authorized_keys` forcée, `.env`, `docker login ghcr.io` root. `/opt/okauto` est **chmod 751** pour que `deploy` atteigne `scripts/deploy-gate.sh`.
3. Restaurer le dernier dump Postgres dans le volume, ou recréer vide puis `migrate`.
4. Déclencher **Deploy** avec le SHA de `main`.
5. Recréer les enregistrements DNS Cloudflare si l’IP change (ne pas toucher aux MX).

## Tourner les secrets

1. Générer le nouveau secret **hors VPS**.
2. Snapshot + dump (`backup.sh`).
3. Mettre à jour `/opt/okauto/.env` (chmod 600).
4. `docker compose --env-file .env -f compose.prod.yml up -d` (ou un deploy SHA identique pour recréer les conteneurs).
5. Invalider les sessions si `JWT_SECRET` change (tous les utilisateurs se reconnectent).
6. Révoquer l’ancien secret.

Clé de déploiement GitHub : régénérer la paire, remplacer le secret `VPS_DEPLOY_KEY` **et** la ligne `authorized_keys`.

PAT GHCR : régénérer un jeton `read:packages`, `docker login ghcr.io` en root, `chmod 600 /root/.docker/config.json`, révoquer l’ancien.

## Alertes et observabilité

Tout est optionnel. Sans DSN / URL : no-op + une ligne de log.

| Signal | Variable | Comportement |
|--------|----------|--------------|
| Sentry web + worker | `SENTRY_DSN` | `release=APP_VERSION` (ou `GIT_SHA`). `sendDefaultPii=false` + scrub email/cookies/Authorization. Pas de wrapper `next.config`. |
| Heartbeat backup | `BACKUP_HEARTBEAT_URL` | GET après `backup.sh` OK |
| Heartbeat worker | `WORKER_HEARTBEAT_URL` | GET avec le heartbeat fichier/Redis (30 s) |
| Sync DÉGRADÉE | `SYNC_DEGRADED_ALERTS=1` + webhook optionnel | **Off par défaut.** Sources actives seulement. Scheduler 15 min. Notif `SYSTEM` 1× / org / jour UTC. |

Logs toujours : `docker compose --env-file /opt/okauto/.env -f /opt/okauto/compose.prod.yml logs -f web worker`

## Après merge de cette PR de suivi (hôte)

1. Snapshot Hostinger.
2. En root, copier **seulement** :
   - `deploy/scripts/{backup.sh,offsite-backup.sh,restore-offsite.sh,r2.py}` → `/opt/okauto/scripts/` (`root:root`, 755)
   - `deploy/README.md`, `deploy/RUNBOOK.md` → `/opt/okauto/`
   - `deploy/backup.env.example` → `/opt/okauto/backup.env` s’il n’existe pas encore (`chmod 600`)
   Ne pas toucher `deploy-gate.sh`, `deploy.sh` ni sudoers.
3. Si des `BACKUP_*` étaient déjà dans `.env` (lot 2 initial, jamais déployé) : les **déplacer** vers `backup.env` et les retirer de `.env`.
4. `apt-get install -y age` (même avant R2).
5. Laisser `backup.env` et `SYNC_DEGRADED_ALERTS` **vides**. Approuver le Deploy.
6. Vérifier :
   - worker : `BullMQ job schedulers registered`, `sentry skipped`
   - `/api/health` et `/api/health/ready`
   - **deux synchros successives** de la même source (`lastSyncAt` avance ; bouton « Synchroniser maintenant » aussi)
   - `backup.sh` manuel → skip R2 ; `backup.sh --label deploy-test` → skip offsite + heartbeat
7. Plus tard : lifecycle R2 30 j + jeton write-only, remplir `backup.env`, environment GitHub `backup-drill` (main only), drill manuel. Activer `SYNC_DEGRADED_ALERTS=1` seulement après revue des runs FAILED récents.

---

## Checklist cutover VPS

1. **Snapshot Hostinger** + dump manuel avec l’ancien `backup.sh` ; copier un dump **hors VPS**.
2. CI `quality` + `test` + `images` verts sur le SHA à déployer.
3. GitHub : environment `production` (reviewer Michael), secrets `VPS_HOST`, `VPS_KNOWN_HOSTS`, `VPS_DEPLOY_KEY`.
4. Root sur VPS : `install-host.sh` (shell `/bin/bash` pour `deploy`, **chmod 751** sur `/opt/okauto`). **Ne pas** `docker network connect` Traefik (déjà `network_mode: host`).
5. Préparer `/opt/okauto/.env` (chmod 600) à partir de `.env.prod.example` :
   - `DATABASE_URL=…@postgres:5432/…` (**pas** `127.0.0.1:5433`)
   - `REDIS_URL=redis://redis:6379`
   - `ALLOW_PUBLIC_SIGNUP=false`, `TRUST_PROXY=true`
   - conserver `POSTGRES_*`, `JWT_SECRET`, AWS/OpenAI existants
6. Copier `compose.prod.yml` + `scripts/` ; **arrêter** d’utiliser `docker-compose.yml` + build local `src/`.
   **Leçon cutover :** arrêter l’ancienne stack avec `docker compose stop` puis `docker compose rm -f`. **Pas** `down` (ça supprime le réseau `okauto` que le nouveau compose attend `external`). **Jamais** `down -v`.
   Si le réseau a déjà disparu : `docker network create okauto`.
7. Migrer le cron : installer `deploy/cron.d/okauto-backup` → `/etc/cron.d/okauto-backup` (`OKAUTO_ROOT=/opt/okauto`, nouveau `backup.sh`, logs `>> /opt/okauto/backups/backup.log`). Désactiver l’ancienne entrée.
8. Vérifier volumes : `docker volume ls | grep okauto` ; le réseau `okauto` existe. Les volumes `okauto_postgres_data` / `okauto_redis_data` doivent matcher le projet compose `name: okauto`.
9. Premier publish GHA, **puis** cocher la case BLOQUANT GHCR privé (pull anonyme = denied) et `docker login` root.
10. Premier `deploy.sh <sha>` (ou via GHA après approve) en fenêtre courte :
    - `deploy.sh` démarre postgres+redis (`up -d --wait`) s’ils sont down
    - dump → rehearsal `okauto_rehearsal` → drop
    - pull GHCR → `migrate` → up web/worker (`--no-deps`, data plane déjà healthy)
    - écrit `APP_VERSION=<sha>` dans `/opt/okauto/.env` (atomique, mode 600)
    - `curl -sk --resolve suivia.ca:443:127.0.0.1 https://suivia.ca/api/health` → `version==sha`
    - `/api/health/ready` worker ok
    - www → apex 301 (`https://www.suivia.ca/` redirige, TLS letsencrypt)
11. Smoke métier (login, sync health, une page listings).
12. Documenter le SHA dans `.deployed` ; tester rollback **image-only** (sans migration contract) via `workflow_dispatch` (SHA ancêtre de `main`).
13. Ne supprimer `/opt/okauto/src` qu’après 48 h stables.
