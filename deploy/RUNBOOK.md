# Runbook production Suivia Auto

Racine VPS : `/opt/okauto`. Compose : `compose.prod.yml`. État : `.deployed` (SHA actuel).

## Déployer

1. CI verte sur `main` (jobs `quality`, `test`, `images`).
2. Le workflow **Deploy** pousse les images GHCR puis attend l’approbation environment `production`.
3. Approuver. Le job SSH exécute `deploy <sha>` (≤ 10 min : dump, répétition de migration, pull, migrate, up, health).
4. Vérifier `curl -s https://suivia.ca/api/health` — `version` = SHA, `status` = `ok`.

Ne pas déployer à la main depuis un PC en root. Exception : copie unique des scripts (voir `README.md`).

## Revenir en arrière

```text
GitHub → Actions → Deploy → Run workflow → sha=<ancien SHA 40 chars> → approuver
```

Le SHA doit déjà exister sur GHCR. Le script re-tag `:previous` pour protéger l’image du prune.

En urgence sur le VPS (root) :

```bash
sudo /opt/okauto/scripts/deploy.sh <ancien-sha>
```

## Restaurer un dump local

Les dumps sont dans `/opt/okauto/backups/` (14 jours). **Snapshot Hostinger avant.**

```bash
# test non destructif
sudo OKAUTO_ROOT=/opt/okauto /opt/okauto/scripts/restore-drill.sh

# restauration réelle (fenêtre de maintenance) : restaurer vers une nouvelle base,
# pointer DATABASE_URL, puis basculer. Ne pas écraser postgres_data à chaud.
```

RPO cible 24 h / RTO 1 h (sauvegardes hors VPS : lot 2).

## Reconstruire le VPS de zéro

1. Nouveau VPS, Docker, Traefik v3 (certresolver `letsencrypt`, entrypoints `web` / `websecure`) comme aujourd’hui pour Oria.
2. Relancer `install-host.sh`, réseau `okauto`, `authorized_keys` forcée, `.env`.
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

## Alertes (lot 2)

Pas de Sentry / Better Stack dans ce lot. En attendant : `docker compose -f /opt/okauto/compose.prod.yml logs -f web worker`.
