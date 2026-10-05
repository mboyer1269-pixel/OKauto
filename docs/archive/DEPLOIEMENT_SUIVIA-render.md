# ARCHIVÉ — déploiement Render (obsolète)

> **Ne plus suivre ce document.** La production Suivia Auto est un VPS Hostinger
> (`/opt/okauto`) derrière Traefik v3. Voir `deploy/README.md` et `deploy/RUNBOOK.md`.
> `render.yaml` est marqué obsolète.

# Déploiement de Suivia Auto (historique Render)

## Architecture retenue

Suivia Auto utilisait le Blueprint `render.yaml` afin de déployer ensemble :

- l’application web Next.js et le worker de synchronisation dans le même service;
- PostgreSQL gratuit;
- le service Key Value gratuit compatible BullMQ.

Cette architecture ne demande aucune carte et coûte 0 $. Le worker démarre avec l’application afin d’éviter le service Worker payant.

## Limites du forfait gratuit

- Render met le service web en veille après environ 15 minutes sans trafic. La première ouverture suivante peut prendre près d’une minute.
- La base PostgreSQL gratuite expire après 30 jours. Il faut alors migrer vers une base gratuite durable externe ou passer à une base Render payante pour conserver les données.
- Le service Key Value gratuit n’est pas persistant : les travaux en attente peuvent être perdus lors d’un redémarrage, mais l’inventaire enregistré dans PostgreSQL demeure disponible.
- Le worker fonctionne seulement lorsque le service web est réveillé.

Cette version gratuite convient au lancement et aux essais réels. Elle devra être migrée avant l’expiration de PostgreSQL pour devenir durable.

## Première mise en ligne

1. Dans Render, choisissez **New → Blueprint**.
2. Connectez le dépôt GitHub `mboyer1269-pixel/OKauto`.
3. Sélectionnez le fichier `render.yaml`.
4. Ajoutez les variables optionnelles demandées : stockage S3 et OpenAI.
5. Lancez la création des services.

Le Blueprint génère automatiquement un secret JWT, crée la base et applique les migrations au démarrage.

## Domaine suivia.ca

Le domaine utilise actuellement les serveurs DNS Cloudflare `jaziel.ns.cloudflare.com` et `lilyana.ns.cloudflare.com`. Les enregistrements doivent donc être modifiés dans Cloudflare, même si le domaine est enregistré chez WHC.

Après la création de `suivia-web` :

1. Dans Render, ouvrez **suivia-web → Settings → Custom Domains** et confirmez `suivia.ca`.
2. Copiez l’adresse `suivia-web.onrender.com` indiquée par Render.
3. Dans Cloudflare, ouvrez **suivia.ca → DNS → Records**.
4. Remplacez l’ancien enregistrement A de `@` par un CNAME `@` vers `suivia-web.onrender.com`.
5. Ajoutez un CNAME `www` vers la même adresse.
6. Réglez temporairement les deux enregistrements sur **DNS only**.
7. Dans Cloudflare, choisissez **SSL/TLS → Full**.
8. Revenez dans Render et cliquez **Verify**.

Ne supprimez pas les enregistrements MX ou TXT utilisés par le courriel. Le certificat HTTPS est ensuite créé automatiquement par Render.

## Extension Chrome

Après chaque nouvelle construction :

1. exécutez `pnpm --filter @okauto/extension build`;
2. ouvrez `chrome://extensions`;
3. cliquez **Recharger** sur **Suivia Auto — Assistant Marketplace**;
4. utilisez `https://suivia.ca` comme URL API dans ses réglages.
