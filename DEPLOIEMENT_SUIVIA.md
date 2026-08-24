# Déploiement de Suivia Auto

## Architecture retenue

Suivia Auto utilise le Blueprint `render.yaml` afin de déployer ensemble :

- l’application web Next.js;
- le worker de synchronisation d’inventaire;
- PostgreSQL;
- le service Redis compatible BullMQ.

Cette architecture conserve les synchronisations et les files de travaux, contrairement à un déploiement web stateless sans worker permanent.

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
