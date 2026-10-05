# Suivia Auto — guide de démarrage

## Démarrer

Dans le dossier du projet :

```bash
pnpm start:local
```

Laissez le terminal ouvert, puis ouvrez <http://localhost:3000>.

## Comptes locaux

Le guide local utilise `owner@demo.okauto.local`. Le mot de passe n’est **pas** destiné à la production : le seed est bloqué lorsque `NODE_ENV=production`.

Le démarrage lance PostgreSQL, Redis, le site, la synchronisation BuckinghamGM et construit l’assistant Chrome.

## Routine recommandée

1. Ouvrez **Vue du matin** et confirmez que BuckinghamGM est « Opérationnelle ».
2. Traitez d’abord la file **À retirer** dans **Publications**.
3. Dans **À préparer**, recherchez un numéro de stock, un NIV, une marque ou un modèle.
4. Cliquez **Publier**, puis vérifiez le prix, le kilométrage, le stock, le NIV et la photo.
5. Cliquez **Publier sur Marketplace**. Avec l’assistant Chrome, Facebook s’ouvre avec les champs et la photo principale préparés. Sans l’assistant, Suivia Auto copie le contenu et télécharge la photo automatiquement.
6. Vérifiez l’annonce dans Facebook, complétez seulement les champs encore demandés, puis cliquez **Publier**.
7. Ouvrez ensuite l’annonce publiée, copiez son URL `/marketplace/item/...`, revenez dans Suivia Auto et cliquez **Marquer comme publiée**.
8. Lorsqu’un véhicule disparaît de BuckinghamGM, Suivia Auto place son annonce dans **À retirer**. Retirez-la sur Facebook, puis confirmez le retrait dans Suivia Auto.

## Limite Meta à respecter

Meta a retiré la publication d’inventaire véhicules via les Pages d’entreprise au Canada. Pour Marketplace organique, Suivia affiche un **quota mensuel configurable** (la limite documentée de 5 nouvelles annonces Véhicules n’est **pas confirmée** pour chaque compte canadien). Réglez-la dans **Paramètres**. Une annonce supprimée peut quand même compter : **ne supprimez pas pour republier**. Utilisez le bouton officiel **Renouveler**.

Pour tout le lot (~200 véhicules), la voie officielle est le **catalogue Meta** (Automotive Inventory Ads) : activez le flux CSV dans Paramètres, puis collez le lien dans le Commerce Manager. Suivia ne crée ni ne paie aucune publicité.

## Files du matin

1. **À retirer** — véhicules vendus encore en ligne (relance automatique après 24 h).
2. **Synchronisation** — véhicules absents du flux à confirmer (aucune vente automatique si le garde-fou détecte une chute anormale).
3. **Aujourd’hui** — suggestions priorisées, anti-doublon d’équipe, compteur de quota.
4. **Publiées** — écart de prix inventaire/annonce et renouvellement guidé.

Suivia Auto prépare et suit les annonces. La validation et la publication demeurent humaines.

## Assistant Chrome facultatif

Le Centre de publication suffit pour travailler. Pour ajouter l’assistant :

1. Ouvrez `chrome://extensions`.
2. Activez le mode développeur.
3. Cliquez **Charger l’extension non empaquetée**.
4. Choisissez `apps/extension/dist`.
5. Dans Suivia Auto, créez une clé sous **Clés API** et collez-la dans les réglages de l’extension.

L’assistant préremplit les champs qu’il reconnaît et tente d’ajouter la photo principale. Après une nouvelle construction, cliquez **Recharger** sur la fiche de l’extension dans Chrome, puis actualisez Suivia Auto. Si Facebook modifie son formulaire, les champs non reconnus restent clairement indiqués et peuvent être complétés manuellement.

## Vérification rapide

```bash
curl http://localhost:3000/api/health
```

La réponse doit commencer par `{"status":"ok"`.
