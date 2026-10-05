# Runbook production Suivia Auto

Racine VPS : `/opt/okauto`. Compose : `compose.prod.yml`. État : `.deployed` (SHA actuel).

> **Ne jamais** `docker compose down -v` (ni `down --volumes`) : cela **détruit** `postgres_data` / `redis_data`. Arrêt = `down` sans `-v`, ou `stop`.

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
3. Approuver. Le job SSH exécute `deploy <sha>` (≤ 10 min : postgres+redis up → dump → répétition de migration → pull → migrate → up web/worker → health).
4. Vérifier `curl -s https://suivia.ca/api/health` — `version` = SHA, `status` = `ok`.

`deploy.sh` démarre **postgres et redis** (`docker compose up -d --wait`) avant le dump, la répétition, `migrate`, et avant `up --no-deps web worker`. Un premier cutover ou un `down` (sans `-v`) fonctionne donc sans démarrer la data plane à la main.

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

## Restaurer un dump (dernier recours, manuel)

Les dumps pré-deploy sont dans `/opt/okauto/backups/` (14 jours). **Snapshot Hostinger avant.** Ceci est le seul moyen de « rollbacker » le schéma. Ne pas l’automatiser dans `deploy.sh`.

```bash
# test non destructif
sudo OKAUTO_ROOT=/opt/okauto /opt/okauto/scripts/restore-drill.sh

# restauration réelle (fenêtre de maintenance) : restaurer vers une nouvelle base,
# pointer DATABASE_URL, puis basculer. Ne pas écraser postgres_data à chaud.
# Ne jamais down -v.
```

RPO cible 24 h / RTO 1 h (sauvegardes hors VPS : lot 2).

## Reconstruire le VPS de zéro

1. Nouveau VPS, Docker, Traefik v3 (certresolver `letsencrypt`, entrypoints `web` / `websecure`, **`network_mode: host`**) comme aujourd’hui pour Oria.
2. Relancer `install-host.sh`, réseau `okauto` (sans `docker network connect` Traefik), `authorized_keys` forcée, `.env`, `docker login ghcr.io` root.
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

## Alertes (lot 2)

Pas de Sentry / Better Stack dans ce lot. En attendant : `docker compose -f /opt/okauto/compose.prod.yml logs -f web worker`.

---

## Checklist cutover VPS

1. **Snapshot Hostinger** + dump manuel avec l’ancien `backup.sh` ; copier un dump **hors VPS**.
2. CI `quality` + `test` + `images` verts sur le SHA à déployer (déjà rebasé sur #3+#2).
3. GitHub : environment `production` (reviewer Michael), secrets `VPS_HOST`, `VPS_KNOWN_HOSTS`, `VPS_DEPLOY_KEY`.
4. Root sur VPS : `install-host.sh` (shell `/bin/bash` pour `deploy`). **Ne pas** `docker network connect` Traefik (déjà `network_mode: host`).
5. Préparer `/opt/okauto/.env` (chmod 600) à partir de `.env.prod.example` :
   - `DATABASE_URL=…@postgres:5432/…` (**pas** `127.0.0.1:5433`)
   - `REDIS_URL=redis://redis:6379`
   - `ALLOW_PUBLIC_SIGNUP=false`, `TRUST_PROXY=true`
   - conserver `POSTGRES_*`, `JWT_SECRET`, AWS/OpenAI existants
6. Copier `compose.prod.yml` + `scripts/` ; **arrêter** d’utiliser `docker-compose.yml` + build local `src/`. Arrêter l’ancienne stack avec `down` **sans** `-v`.
7. Migrer le cron : installer `deploy/cron.d/okauto-backup` → `/etc/cron.d/okauto-backup` (`OKAUTO_ROOT=/opt/okauto`, nouveau `backup.sh`, compose `-f compose.prod.yml`). Désactiver l’ancienne entrée.
8. Vérifier volumes : `docker volume ls | grep okauto` ; le réseau `okauto` existe. Les volumes `okauto_postgres_data` / `okauto_redis_data` doivent matcher le projet compose `name: okauto`.
9. Premier publish GHA, **puis** cocher la case BLOQUANT GHCR privé (pull anonyme = denied) et `docker login` root.
10. Premier `deploy.sh <sha>` (ou via GHA après approve) en fenêtre courte :
    - `deploy.sh` démarre postgres+redis (`up -d --wait`) s’ils sont down
    - dump → rehearsal `okauto_rehearsal` → drop
    - pull GHCR → `migrate` → up web/worker (`--no-deps`, data plane déjà healthy)
    - `curl -sk --resolve suivia.ca:443:127.0.0.1 https://suivia.ca/api/health` → `version==sha`
    - `/api/health/ready` worker ok
    - www → apex 301 (`https://www.suivia.ca/` redirige, TLS letsencrypt)
11. Smoke métier (login, sync health, une page listings).
12. Documenter le SHA dans `.deployed` ; tester rollback **image-only** (sans migration contract) via `workflow_dispatch` (SHA ancêtre de `main`).
13. Ne supprimer `/opt/okauto/src` qu’après 48 h stables.
