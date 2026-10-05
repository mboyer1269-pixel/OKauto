# Suivia Auto — Analyse concurrentielle, classement des améliorations et specs du sprint 1

*Rédigé le 5 octobre 2026 (heure de Toronto, HAE). Base : dépôt `mboyer1269-pixel/OKauto`, commit `19408f8`, cloné en lecture seule. Rien n'a été modifié ni poussé.*
*Règle suivie : aucune donnée inventée. Tout ce qui n'a pas pu être vérifié porte la mention **[non vérifié]**, avec la source secondaire. Les prix sont en USD, sauf mention contraire.*

---

## 0. Résumé

**Constats principaux**

1. **Les deux règles Meta citées dans GUIDE_DEMARRAGE sont réelles, mais il faut nuancer la première.**
   - Depuis le **30 janvier 2023**, une Page d'entreprise ne peut plus créer d'annonces Véhicules sur Marketplace. Le **Canada** figure dans la liste des marchés touchés (aide Meta Business).
   - Meta documente une limite de **5 nouvelles annonces Véhicules par mois civil** (et 20 annonces au total), mais seulement « dans certaines régions ». Depuis le serveur de recherche, la page affiche « This article doesn't apply to your region ». On ne peut donc pas confirmer que la limite s'applique à chaque compte canadien. **Suivia doit traiter cette limite comme un paramètre configurable**, pas comme une constante.
   - Point important : **une annonce supprimée peut quand même compter** dans la limite.
2. **La voie officielle pour diffuser tout l'inventaire, ce sont les Automotive Inventory Ads (AIA).** Elles reposent sur un catalogue Véhicules alimenté par un flux CSV, TSV ou XML planifié. Marketplace reste un *placement publicitaire* possible.
   - La diffusion *gratuite* des catalogues partenaires sur Marketplace a été retirée au Canada le **13 septembre 2021** (EDealer).
   - Suivia ne produit encore aucun flux. C'est le levier d'échelle numéro un.
3. **Le marché des extensions « Marketplace pour concessionnaires » a explosé.** On compte au moins 8 produits actifs : Shiftly, Owini, AutoLister Pro, autobook.io, PostDrop, AutoLander, Marketplace Pro, CARVID.
   - Les plus agressifs (Owini, AutoLister Pro) vendent de l'**auto-publication avec frappe et souris « humaines »** et de l'**« auto-repost »** (suppression puis republication). Ces pratiques heurtent directement les Conditions de Meta, notamment §3.2.3 (accès automatisé) et §3.2.7 (contournement des mesures techniques), ainsi que la limite mensuelle.
   - **Suivia ne doit pas les copier.** Sa différenciation, c'est d'être « conforme et québécois ».
4. **Ce que les concurrents font et qui fait vraiment vendre :**
   - une file de publication priorisée sous un plafond quotidien ou mensuel ;
   - la mise à jour du prix sur l'annonce ;
   - le retrait rapide des véhicules vendus ;
   - le rafraîchissement des annonces qui vieillissent ;
   - un CRM des prospects Marketplace (Owini Elite à 247 $/mois) ;
   - des photos améliorées par IA (Spyne, Glo3D, Owini) ;
   - un tableau de bord directeur.
5. **Le contexte québécois est un avantage que personne n'exploite :**
   - le **prix tout inclus** est obligatoire (LPC art. 224 c) et page OPC) ;
   - le **français** doit être au moins équivalent à toute autre langue (guide OQLF médias sociaux 2025) ;
   - Buckingham est à côté d'Ottawa, donc un public anglophone existe pour des descriptions **FR puis EN**.
6. **Problèmes trouvés dans le code** (détail en §2.3) :
   - le worker n'avertit pas le vendeur qui a publié l'annonce quand le véhicule disparaît du flux ;
   - les changements de prix n'avertissent que les gestionnaires ;
   - les notifications du worker sont en anglais ;
   - la synchronisation n'importe aucun équipement (`features`) ;
   - aucun suivi de l'âge des annonces, du renouvellement, ni de l'écart de prix annonce/inventaire.

**Sprint 1 proposé** (5 items, migrations Prisma purement additives, publication toujours humaine) :

| # | Item | Impact attendu |
|---|------|----------------|
| S1-1 | **File « Aujourd'hui » + compteur de quota Meta** | Les 5 publications mensuelles vont aux véhicules qui en ont le plus besoin (âge en stock, baisse de prix, priorité du directeur), sans que deux vendeurs publient le même véhicule. |
| S1-2 | **Santé des annonces : prix à corriger + renouvellement** | Plus d'annonce au mauvais prix (risque LPC 224 c) et des annonces renouvelées par le bouton officiel « Renouveler », sans brûler le quota. |
| S1-3 | **Retrait des vendus fiabilisé + suivi du délai pour le directeur** | Moins d'appels sur des véhicules déjà vendus, et le directeur voit qui traîne. |
| S1-4 | **Description conforme Québec : prix tout inclus vérifié + FR/EN + garanties configurées** | Protection légale et portée élargie au marché anglophone d'Ottawa, sans rien inventer. |
| S1-5 | **Flux catalogue Meta (Automotive Inventory Ads)** | Tout l'inventaire devient diffusable par la voie officielle, au-delà de la limite de 5 par mois. |

---

## 1. Contexte réglementaire et règles de plateforme (vérifiés)

### 1.1 Meta / Facebook Marketplace

| Règle | Statut | Source |
|---|---|---|
| Plus de création d'annonces Véhicules depuis une **Page d'entreprise** à partir du 30 janvier 2023. Marchés touchés : US, **CA**, FR, GB, MX, BR, ID, DE, AU. « La possibilité de rejoindre des audiences par les publicités ne change pas. » | **Vérifié** | https://www.facebook.com/business/help/492940666175475 |
| Limites de **5 nouvelles annonces Véhicules / mois civil**, 5 Pièces auto, 5 Immobilier, **20 au total**, remise à zéro le 1er du mois ; **les annonces supprimées peuvent compter** | **Documenté par Meta « dans les régions concernées »**. La page officielle affiche « doesn't apply to your region » depuis notre serveur, donc l'application au Canada n'est **pas confirmée**. Contenu repris par plusieurs sources secondaires concordantes. | https://www.facebook.com/help/811082570742714 ; https://autolander.ai/bulk-post-cars-to-facebook-marketplace/ ; https://ruit.es/en/blog/fb-marketplace-limit/ |
| Une annonce reste active tant qu'on vend ; suppression possible après **2 ans d'inactivité** ; **« Renouveler »** et « Modifier » réinitialisent ce délai | **Vérifié** | https://www.facebook.com/help/976748741431731 |
| Le bouton « Renouveler » apparaît **après 7 jours** | Sources secondaires seulement (Reddit, blogue) **[non vérifié chez Meta]** | https://www.reddit.com/r/FacebookMarketplace/comments/1k0xre1/why_am_i_constantly_renewing_listings/ ; https://mbial.com/how-many-times-can-you-renew-a-facebook-marketplace-listing/ |
| Conditions Meta §3.2.3 : interdit d'« accéder à nos Produits ou d'en collecter des données par des moyens automatisés » sans permission ; §3.2.7 : interdit de contourner les mesures techniques | **Vérifié** | https://www.facebook.com/legal/terms |
| Diffusion Marketplace des **catalogues partenaires** retirée le 13 septembre 2021 (Canada et É.-U.) ; Marketplace **reste un placement** pour les publicités automobiles | **Vérifié** (EDealer, concessionnaire-fournisseur canadien) | https://www.edealer.ca/blog/changes-to-facebook-marketplace/ |

### 1.2 Meta Automotive Inventory Ads (AIA), la voie officielle à grande échelle

- **Mise en place en 4 étapes** :
  1. catalogue Auto, puis Véhicules ;
  2. Meta Pixel ou SDK (inutile pour une destination sur Facebook) ;
  3. liaison catalogue-pixel ;
  4. modèle de publicité dans Ads Manager.

  Source : https://www.facebook.com/business/help/1930396467200635
- **Flux** : CSV, TSV ou XML hébergé, téléversement planifié **horaire, quotidien ou hebdomadaire**. Sources : https://www.facebook.com/business/help/143781049600895 et https://developers.facebook.com/docs/marketing-api/auto-ads/guides/catalog/
- **Champs** (référence développeur) : https://developers.facebook.com/docs/marketing-api/auto-ads/reference/ et https://developers.facebook.com/docs/marketing-api/reference/product-catalog/vehicles/
  - **Champs requis** :
    - `vehicle_id` (max. 100 caractères, le NIV est accepté) ;
    - `title` (max. 500) ;
    - `description` (max. 5000, **sans texte promotionnel, sans lien, pas tout en majuscules**) ;
    - `url` ;
    - `make`, `model`, `year` ;
    - `mileage.value` et `mileage.unit` (`KM`), avec **0 pour un véhicule neuf** ;
    - `image[0].url` (max. 20 images, **au moins 2 pour le placement Marketplace**) ;
    - `state_of_vehicle` (`New`, `Used` ou `CPO`) ;
    - `price` (format « 24495 CAD ») ;
    - `address` (city, region, country) ;
    - `exterior_color`.
  - **Note** : pour le placement Marketplace, la doc indique aussi un kilométrage **supérieur à 500 km**.
  - **Champs utiles** :
    - `date_first_on_lot` et `days_on_lot` (âge en stock) ;
    - `availability` (`available` / `not_available`) ;
    - `body_style` (enum : CONVERTIBLE, COUPE, CROSSOVER, HATCHBACK, MINIVAN, PICKUP, SEDAN, SUV, TRUCK, VAN, WAGON, OTHER…) ;
    - `transmission`, `fuel_type`, `drivetrain`, `trim`, `vin`, `dealer_name`, `dealer_phone`.
- **Catalogue localisé** : Meta prend en charge des flux de *langue* (`override` = `fr_XX`, `en_XX`) pour title, description et url. Source : https://developers.facebook.com/docs/marketing-api/catalog/localized-catalog/localized-catalog-setup/ **[support pour le type Véhicules à valider en test]**
- **Destination sur Facebook** : passée des pages détail Marketplace aux pages produit de Shops en janvier 2024, selon un fil du forum développeurs Meta **[non vérifié en détail]** : https://developers.facebook.com/community/threads/268250319606970/

### 1.3 Québec

| Règle | Source |
|---|---|
| **Prix tout inclus** obligatoire dans toute publicité, Web compris. Il doit inclure le transport, la préparation, la livraison, les frais d'administration et la « taxe d'accise » sur les climatiseurs. **Seules la TPS, la TVQ et le droit spécifique sur les pneus neufs peuvent s'ajouter.** Le prix total doit être plus évident que ses composantes. Si le prix exigé est plus élevé, le consommateur peut exiger le prix annoncé. | OPC : https://www.opc.gouv.qc.ca/commercant/secteur/vehicule/publicite/regle/prix (page modifiée le 26 février 2025) |
| Art. 224 c) LPC : interdit d'exiger un prix supérieur au prix annoncé ; que le client connaisse les frais d'avance ne suffit pas | https://lpc.quebec/decisions/gagnon-c-berard-autos-choix-inc-2017-qccq-2528/ |
| Publications commerciales sur les médias sociaux **en français**. Si une autre langue est utilisée, le français doit être **« au moins équivalent »** et accessible dans des conditions au moins aussi favorables. | OQLF, *Guide médias sociaux 2025* : https://www.oqlf.gouv.qc.ca/francisation/entreprises/Guide_Medias-sociaux_2025.pdf |

> Constat sur la source BuckinghamGM : la page inventaire indique « Les montants affichés excluent les taxes ». Elle **ne dit pas** explicitement que les prix sont « tout inclus ». Suivia ne peut donc pas présumer que le prix synchronisé respecte la règle ; il faut une **confirmation de la direction** (voir S1-4). Le gabarit actuel affirme déjà « Aucun frais obligatoire additionnel » sans vérification.

---

## 2. Ce que Suivia fait déjà (inventaire du code)

### 2.1 Fonctions présentes

| Domaine | Ce qui existe | Fichiers |
|---|---|---|
| Sync inventaire | Adaptateurs `generic`, `dealer-json`, `json-ld`, **`d2c` (BuckinghamGM)** avec pagination, galerie photos depuis la fiche détail, **arrêt de sécurité** si plus de 25 % de l'inventaire disparaît, confirmation en 2 passes avant de marquer « vendu », historique `SyncRun` | `apps/worker/src/sync.ts`, `packages/shared/src/sync/adapters/d2c.ts` |
| Détection prix | Changement de prix détecté et notifié **aux OWNER/ADMIN/MANAGER seulement** | `sync.ts` (`notifyPriceChange`) |
| Centre de publication | Files **À préparer / Publiées / À retirer / Historique**, recherche (stock, NIV, marque, modèle), filtre Neufs/Occasion/Démonstrateurs, brouillon par vendeur (`MarketplaceDraft`), copie du titre et de la description, téléchargement des photos | `apps/web/src/app/dashboard/listings/page.tsx` |
| Extension MV3 | Préremplit le formulaire Marketplace (type, année, marque, modèle, km, titre, prix, description, carrosserie, couleur, carburant, boîte), joint la photo principale, **détecte l'URL `/marketplace/item/…` après la publication** et crée la `Listing` | `apps/extension/src/content/marketplace.ts`, `publication-tracking.ts`, `api/v1/extension/events` |
| Descriptions | Gabarit FR à la première personne + OpenAI (`gpt-4o-mini`) avec consigne « n'invente jamais ». Mention « Prix affiché avant TPS, TVQ et droit sur pneus neufs ». Validation bloquante : titre, prix, km. | `packages/shared/src/description.ts`, `apps/web/src/lib/services.ts` |
| Instantané | `Listing.priceAtListing`, `titleAtListing`, `descriptionAtListing`, `photoUrlsAtListing` | `schema.prisma` |
| RBAC | OWNER / ADMIN / MANAGER / SALESPERSON, `withAuth({minRole})`, journal d'audit | `apps/web/src/lib/api.ts`, `auth.ts` |
| Vue du matin | Inventaire disponible, sans annonce active, à retirer, santé de la sync, statistiques par membre (semaine, mois, dernière activité) | `apps/web/src/app/dashboard/page.tsx`, `services.ts#getDashboardStats` |
| Notifications | Modèle `Notification` (SOLD_ALERT, PRICE_CHANGE, SYNC_ERROR, LISTING_REMINDER, SYSTEM), lu/non lu. **Aucune ne part par courriel ou SMS.** | `api/v1/notifications` |
| Avertissement Meta | Bandeau dans Publications sur la limite de 5 par mois | `listings/page.tsx` (vers la ligne 890) |

### 2.2 Ce qui manque (par rapport au marché)

Il n'existe pas :

- d'ordre de priorité dans « À préparer » (tri `updatedAt desc`) ;
- de compteur de quota ;
- de signalement d'un véhicule déjà publié par un collègue ;
- de suivi de l'âge des annonces ni du renouvellement ;
- d'écart prix annonce/inventaire ;
- de délai de retrait des vendus ;
- de vue d'équipe pour « À retirer » (`GET /listings` est filtré sur `userId = auth.sub`) ;
- de flux catalogue Meta ;
- de version anglaise ;
- de leads ou CRM ;
- de contrôle qualité des photos au-delà de « photo principale présente ».

### 2.3 Problèmes et dette repérés (à corriger en passant)

1. **Alerte « vendu » incomplète**. `apps/worker/src/sync.ts#notifySoldVehicles` n'avertit que `assignedToId`, ou les gestionnaires à défaut. **Le vendeur qui a publié l'annonce n'est pas averti** s'il n'est pas assigné. À l'inverse, `services.ts#notifySoldVehicle` (marquage manuel) l'avertit bien.
2. **Notifications du worker en anglais** (« Vehicle Removed From Dealer Inventory », « Price Change Detected », « Sync Failed »), alors que toute l'interface est en français.
3. **Équipements jamais importés**. `SyncVehicle` n'a pas de champ `features`, donc la section « ÉQUIPEMENTS QUI RESSORTENT » est vide pour tout l'inventaire synchronisé.
   - La fiche BuckinghamGM contient pourtant un bloc Description du concessionnaire (« JAMAIS ACCIDENTÉ », « UN SEUL PROPRIÉTAIRE »), une section **GARANTIE** (« Garantie légale seulement… ») et des caractéristiques de sécurité.
   - Attention : la liste « Options » du HTML est un gabarit générique masqué (`display:none`), elle n'est **pas fiable telle quelle**.
4. **`soldAt` réécrit à chaque passage** de la sync pour un véhicule au statut SOLD encore présent dans le flux, ou remis à `null`. Impact mineur.
5. **L'âge en stock est approximatif**. Seul `Vehicle.createdAt` (première vue par Suivia) existe. Tous les véhicules importés le jour du lancement ont donc le même âge. Il faut le dire dans l'interface.
6. **Aucune donnée de coût ou de marge** : pas de DMS. La priorité « marge » ne peut pas être calculée ; on la remplace par un drapeau « Priorité du directeur » (S1-1).

---

## 3. Recherche concurrentielle

### 3.1 Fiches

#### Shiftly Auto (la référence initiale d'OKauto)
- **Fonctions** : extension « Shiftly Auto Lister » pour publier sur Marketplace **et dans des Groupes**, portail de gestion avec suivi des annonces par vendeur, alertes vendus pour retirer les annonces, descriptions « conformes », communauté de formation. Sources : https://shiftlyauto.com/ ; https://shiftlyauto.com/terms-and-conditions
- **Chrome Web Store** : 10 000 utilisateurs, 5,0/5 sur **3 avis seulement**, version 5.0 mise à jour le 28 août 2026. Source : https://chromewebstore.google.com/detail/shiftly-auto-lister/ekojgodjldjgppkjnjacbeedofegfioh
- **Prix** : officiellement **sur devis**. Sources tierces contradictoires :
  - 129 $/mois + 369 $ de mise en place + 30 jours d'essai (PostDrop, juin 2026, concurrent) : https://postdrop.ai/reviews/shiftly-auto
  - environ 149 $/mois avec 3 mois payés d'avance, selon des utilisateurs (AutoLister Pro, concurrent) : https://www.autolisterpro.com/pricing

  **[non vérifié]**
- **Avis** : Trustpilot 4,5/5 sur 23 avis, avec des reproches sur un support inégal et des problèmes de service payant non réglés (extrait de recherche : https://www.trustpilot.com/review/www.shiftlyauto.com ; page protégée par un défi anti-robot, donc **non consultée directement**). Sur Reddit r/carsales, avis partagés : plus de vues et de rendez-vous pour certains, « cher et moins efficace » pour d'autres (https://www.reddit.com/r/carsales/comments/1sci6a3/anyone_using_shiftly/, extrait de recherche seulement).
- **Position sur les limites** : Shiftly parle d'environ 10 annonces par jour « non publiées par Facebook » (https://shiftlyauto.com/blogs/how-many-cars-can-you-post-on-facebook-marketplace-per-day). Cela contredit la limite mensuelle documentée par Meta.

#### Owini Vehicle Poster (+ CRM / « AI Closer »)
- **Fonctions** : https://owini.ai/poster
  - extraction de l'inventaire depuis 11 sites, file de 50 véhicules avec pause, reprise et anti-doublon, **plafond quotidien choisi par l'usager** (environ 10 par jour recommandé) ;
  - **auto-repost** (suppression puis republication tous les 3, 5, 7 ou 14 jours) ;
  - **frappe et souris « humaines »** (« Gaussian delays », « Bezier mouse paths ») ;
  - publication sur Marketplace, Journal et Groupes ;
  - synchronisation du site, **mise à jour automatique du prix**, **retrait automatique des vendus** ;
  - IA photo (remplacement du fond, recadrage, **suppression des filigranes et bandeaux de prix**) ;
  - **AI Closer** : répond sur Messenger « en votre nom », pose les questions de qualification et réserve la visite ; garde-fous (aucun prix inventé, aucune mensualité ou approbation de crédit, remise au vendeur pour la négociation) ;
  - mini-CRM : étapes, score, calendrier, export CSV.
- **Prix** (https://owini.ai/pricing) :
  - Starter 97 $/mois, Pro 147 $/mois, **Elite (CRM + AI Closer) 247 $/mois** ;
  - forfaits d'équipe 397, 497 et 597 $/mois (5, 10 ou 15 places) ;
  - siège AI Closer à 97 $ par vendeur et par mois ;
  - CRM complet à 697, 797 ou 1 497 $/mois.
- **Avis indépendants** : aucun trouvé **[non vérifié]**.
- **Risque** : l'auto-repost et la simulation humaine vont contre les Conditions Meta (§3.2.3 et §3.2.7) et brûlent le quota mensuel, puisque les annonces supprimées comptent.

#### AutoLister Pro
- **Fonctions** : publication en 1 clic à partir de n'importe quelle fiche (site du concessionnaire, AutoTrader.ca, CarGurus.ca…), « Auto Pilot » jusqu'à 7 véhicules par clic, **auto-renew**, partage dans jusqu'à 20 Groupes, Instagram et TikTok, bandeau superposé personnalisé. Le forfait concession inclut un tableau de bord directeur avec suivi des usagers. Sources : https://www.autolisterpro.com/facebook-marketplace-auto-poster-chrome-extension ; https://www.autolisterpro.com/pricing
- **Prix** : 99 $/mois par vendeur, 149 $ (site personnel), 299 $ (avec CRM), **à partir de 799 $/mois pour une concession**. Pas de contrat.
- **Affirmations marketing** : « 618+ dealers, zero bans » **[non vérifié]**.

#### autobook.io
- **Fonctions** : extension plus plateforme ; lots jusqu'à 50, 30 s par défaut entre deux annonces ; import depuis Dealer.com, DealerOn, Dealer Inspire et d'autres ; descriptions IA ; « re-rendu » des photos. Disponible aux **États-Unis seulement**.
- **Prix** : 99, 199 et 299 $/mois en crédits (import = 2, publication = 1, description IA = +2, 2 photos refaites = +4).
- **Source** : https://autobook.io/blog/autobook-vs-shiftly (blogue de l'éditeur) ; https://autobook.io/blog/can-car-dealers-post-on-facebook-marketplace

#### PostDrop
- **Fonctions** : flux DMS ou site (synchro de 12 h à 15 min selon le forfait), import CSV, extension avec préremplissage et ordre des photos ; **c'est l'usager qui clique Post** ; IA pour les descriptions et le décodage ; gestion d'équipe. Sources : https://postdrop.ai/ ; https://postdrop.ai/pricing
- **Prix** (promotion en cours, annuel) : 16, 50, 127 $/mois, Entreprise sur devis ; prix normaux 25, 110, 254 $.

#### AutoLander
- **Fonctions** : application de bureau native ; charge tout le flux (CarGurus, Cars.com, exports DMS) ; **file configurable explicitement soumise aux limites Meta** (5 Véhicules et 20 au total par mois, cités) ; détection des nouveaux NIV ; rapprochement des vendus ; photo « showroom ».
- **Prix** : **à partir de 39 $/mois**, 5 publications gratuites.
- **Source** : https://autolander.ai/bulk-post-cars-to-facebook-marketplace/
- *C'est le concurrent dont le discours se rapproche le plus de celui de Suivia (honnête sur les limites).*

#### Marketplace Pro (R.-U., importe aussi pour le Canada)
- *Aucun produit nommé « Dealer Marketplace Pro » ni « MarketplaceBot » n'a été trouvé. Le plus proche est celui-ci.*
- **Fonctions** : « AI Quick Lister » en environ 30 s, descriptions IA, notifications nouveaux véhicules et vendus, publication sur Marketplace, Page, profil et Groupes, cours de formation.
- **Prix** : 57 £/mois (solo), 99 £, 139 £.
- **Sources** : https://www.marketplacepro.co.uk/ ; Chrome Web Store : https://chromewebstore.google.com/detail/facebook-marketplace-pro/llalepkemdeahfadgopnngobmfldfmld
- **Avis** : seulement des témoignages sur le site de l'éditeur (non indépendants).

#### CARVID
- Cité par AutoLister Pro, à partir de 249 $/mois et plafonné à 10 publications par jour **[non vérifié, source concurrente]**.

#### Carbly *(précision : ce n'est **pas** un outil Marketplace)*
- **Fonctions** : application d'**évaluation et de sourcing** de véhicules d'occasion réservée aux concessionnaires (permis requis) : lecture du NIV, valeurs de gros et de détail, historique, comparables locaux, encans, alertes. Sources : https://getcarbly.com/appraisals/ ; https://getcarbly.com/register/
- **Prix** : modulaire, par exemple J.D. Power Values 65 $/mois et Live Local Market 49 $/mois ; 14 jours d'essai.
- **Pertinence pour Suivia** : faible pour la publication. Idée réutilisable : afficher l'**écart prix vs marché** (voir le backlog), mais il faut une source de données sous licence.

#### LotLinx
- **Fonctions** : https://lotlinx.com/lotlinx-products-and-solutions/
  - **VIN Manager** : plateforme de données d'inventaire avec IA qui repère les NIV « à risque » (âge, demande) ;
  - forfaits Select et Sentinel (surveillance 24 h/24 et campagnes média par NIV) ;
  - VIN View Optimizer, extension VMX, Showroom (fiches mobiles), vidéos de 7 s par NIV, VIN Boosts.
- **Prix** : non publié (sur devis), https://lotlinx.com/products/packages/
- **Avis** : la synthèse de recherche évoque « trafic VDP moins cher, mais attribution difficile » **[non vérifié, aucune source primaire consultée]**.
- **Leçon pour Suivia** : **prioriser par NIV selon le risque d'âge**. C'est exactement l'idée de la file « Aujourd'hui ».

#### Fullpath (acquis par Cox Automotive, transaction conclue le 1er juin 2026)
- **Fonctions** : plateforme de données client (CDP) automobile ; profils fusionnés (site, CRM, DMS, inventaire, pubs) ; **analyse d'inventaire par jours en stock** ; audiences pour les pubs Facebook ; chatbot ChatGPT ; contenus de relance générés par IA. Source : https://www.fullpath.com/cdp-for-car-dealers/
- **Acquisition** : https://www.coxautoinc.com/press-releases/cox-automotive-completes-acquisition-of-fullpath/
- **Prix** : sur devis. D'anciens tarifs (ChatGPT 500 $/mois, avec Website Engagement 800 $/mois) ne sont cités que par des tiers **[non vérifié]**.
- **Avis** : 4,2/5 selon un comparateur tiers **[non vérifié]**.

#### LESA (LES Automotive)
- **Fonctions** : forfaits Pro (vidéo d'inventaire, Ultra 360 Spin), Elite (+ vidéos de fonctions du constructeur, **publication automatisée sur les médias sociaux** avec filtres et horaires), Ultimate (+ vidéos personnalisées des vendeurs, syndication ImagineAutos).
- **Options à la carte** : remplacement du fond (occasion), **commentaires vendeur générés automatiquement**, diapositives promotionnelles insérées dans la galerie, voix hors champ en espagnol.
- **Source** : https://www.lesautomotive.com/lesa-video-merchandising-packages-for-car-dealerships-simple-and-drive-value-for-website/ (2023)
- **Prix** : non publié.

#### Spyne
- **Fonctions** :
  - **Lite** : application photo IA (hors ligne), fonds studio avec logo, **masquage des plaques**, ordre intelligent des images, appariement à l'inventaire, autocollants de fenêtre, campagnes en superposition ;
  - **Pro** : + visites extérieures et intérieures, vidéos avec narration, **descriptions IA**, publication vers IMS, marketplaces et médias sociaux.
- **Source** : https://www.spyne.ai/pricing
- **Prix** : sur devis (selon le volume, le nombre de points de vente et les fonctions). Une ancienne page 360 indiquerait « à partir de 350 $/mois » **[non vérifié]**.
- **Revendique** 36 000 concessions.

#### Glo3D (Toronto)
- **Fonctions** : photos guidées (lecture du NIV ou du no de stock, puis tour 360, puis gros plans), retrait et remplacement du fond, correction de couleur et d'exposition, alignement et mise à l'échelle automatiques, en-tête et pied de page de marque, photos promotionnelles insérées, **synchronisation vers l'IMS**, rapports d'état. Source : https://glo3d.com/car-photography-app/
- **Prix** : la page https://glo3d.com/pricing/ n'affiche aucun montant. Fourchettes tierces de 50 à 944 $/mois **[non vérifié]**.
- **Avis** (Google Play, synthèse) : qualité et support appréciés ; courbe d'apprentissage pour le 360, crédits d'essai limités **[non vérifié en détail]**.

#### Flick Fusion (Nucleus)
- **Fonctions** : vidéos d'inventaire par NIV (en direct ou assemblées automatiquement à partir des photos du flux), 360 automatiques, **réutilisation dans les campagnes Facebook et Google et le reciblage**, vidéos par texto ou courriel avec suivi des visionnements, appel vidéo en direct.
- **Source** : https://flickfusion.com/tools/
- **Prix** : non publié.
- **Avis** : seulement des témoignages sur le site de l'éditeur.

#### Kijiji Autos (outils concessionnaires)
- **Forfaits** :
  - Business : suivi des appels, Finance Driver, page concession ;
  - Business Pro : + Photo AI (neufs), carrousel mobile, logo sur la fiche, **évaluations Black Book (TradesII)** ;
  - Business Elite : + **Auto Refresh**, fonctions gérées par des spécialistes, Photo Showcase.
- **Grille** (document du partenariat FCA, **date inconnue, probablement 2021-2022**) : de 350 à 1 150 $ CA/mois pour Business, de 450 à 1 500 $ pour Pro, de 530 à 1 800 $ pour Elite, selon le volume.
- **Source** : https://www.stellantisdigital.ca/docs/English/Inventory/kijijiautos.pdf

#### AutoTrader.ca (TRADER)
- **AutoTrader iQ Price Badges** (« Good » ou « Great » selon les données du marché) : **+31 % et +60 % de leads par VDP** selon TRADER (données 2021).
- **Photos** : **11 photos ou plus, c'est +185 % de leads (occasion) et +167 % (neuf)**. Recommandation : jusqu'à 30.
- **Description** : « Why Buy Here », « sans accident », odomètre.
- **Source** : https://go.trader.ca/lift-your-leads-with-better-merchandising/ (septembre 2022)
- **Prix** : non publié.

#### Meta Automotive Inventory Ads
Voir §1.2. Pas de coût de plateforme, on paie les médias. EDealer suggérait en 2021 **5 à 10 $ par véhicule** de budget publicitaire (frais de gestion compris), une indication de fournisseur **[à recalibrer]**.

### 3.2 Tableau concurrents × fonctionnalités

Légende : ✅ affiché publiquement · ◐ partiel ou optionnel · ❌ absent ou non affiché · ? non vérifiable · ⚠️ présent mais risqué au regard des Conditions de Meta

| Fonctionnalité | **Suivia (aujourd'hui)** | Shiftly | Owini | AutoLister Pro | autobook | PostDrop | AutoLander | Marketplace Pro | LotLinx | Fullpath | LESA | Spyne | Glo3D | Flick Fusion | Kijiji Autos | AutoTrader.ca | Meta AIA |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Import / sync de l'inventaire | ✅ (d2c, JSON, JSON-LD, CSV) | ✅ | ✅ (11 sites) | ✅ (extraction) | ✅ | ✅ (DMS, CSV) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (via fournisseur) | ✅ | ✅ (flux) |
| Préremplissage, **clic humain** | ✅ | ? | ❌ (auto) | ❌ (auto) | ❌ (lots) | ✅ | ◐ (file locale) | ? | — | — | — | — | — | — | — | — | — |
| Publication automatique « humaine » | ❌ (choix voulu) | ? | ⚠️ | ⚠️ | ⚠️ (lots de 50) | ❌ | ◐ | ? | — | — | — | — | — | — | — | — | — |
| File priorisée / plafond | ❌ | ? | ◐ (plafond/jour) | ◐ (7/clic) | ◐ (rythme) | ❌ | ✅ (limites Meta) | ❌ | ✅ (NIV à risque) | ◐ (jours en stock) | — | — | — | — | ◐ | — | ✅ (algorithme) |
| Compteur limite Meta (5/mois) | ◐ (texte seulement) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (mentionné) | ❌ | — | — | — | — | — | — | — | — | — |
| Retrait des vendus | ✅ (file + alerte) | ✅ (alerte) | ✅ (auto) | ? | ? | ? | ✅ (auto) | ✅ (alerte) | — | — | — | — | — | — | ✅ (flux) | ✅ (flux) | ✅ (flux) |
| Mise à jour du prix sur l'annonce | ❌ | ? | ✅ (auto) | ? | ? | ? | ✅ (refresh) | ✅ (suivi) | — | — | — | — | — | — | ✅ | ✅ | ✅ |
| Renouvellement / rafraîchissement | ❌ | ? | ⚠️ (supprimer-republier) | ✅ « auto-renew » (méthode ?) | ? | ? | ✅ (refresh) | ? | — | — | — | — | — | — | ✅ Auto Refresh (Elite) | ? | — |
| Descriptions IA | ✅ (FR) | ✅ | ✅ | ? | ✅ | ✅ | ✅ | ✅ | — | ◐ | ✅ | ✅ (Pro) | ❌ | — | — | — | — |
| Descriptions bilingues FR/EN | ❌ | ❌ | ◐ (EN/ES) | ❌ | ❌ | ❌ | ❌ | ❌ | — | — | ◐ (voix ES) | ? | ? | — | ? | ✅ (site bilingue) | ◐ (catalogue localisé) |
| Garde-fou prix tout inclus (QC) | ◐ (mention fixe) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | — | — | — | — | — | — | ? | ? | — |
| Amélioration photos IA | ❌ | ❌ | ✅ (fond, recadrage, filigranes) | ◐ (bandeau) | ✅ (re-rendu) | ◐ (ordre) | ✅ | ❌ | — | — | ✅ (fond) | ✅ | ✅ | ✅ | ✅ (Photo AI, neufs) | ◐ (photothèque neufs) | — |
| Vidéo / 360 | ❌ | ❌ | ❌ | ◐ (TikTok) | ❌ | ❌ | ❌ | ❌ | ✅ (vidéo 7 s) | — | ✅ | ✅ (Pro) | ✅ | ✅ | ❌ | ✅ | ✅ (formats pub) |
| Groupes / Instagram / TikTok | ❌ (choix voulu) | ✅ (Groupes) | ✅ (Groupes, Journal) | ✅ | ? | ❌ | ❌ | ✅ | — | — | ✅ (social auto) | ✅ | ✅ | ✅ | — | — | ✅ (IG) |
| Mini-CRM des leads | ❌ | ❌ | ✅ (Elite) | ✅ (299 $) | ❌ | ❌ | ❌ | ❌ | — | ✅ (CDP) | — | — | — | ✅ (relance vidéo) | ✅ (leads) | ✅ (leads) | ✅ (formulaires lead) |
| Réponses Messenger par IA | ❌ | ❌ | ⚠️ « en votre nom » | ❌ | ❌ | ❌ | ❌ | ❌ | — | ✅ (chatbot site) | — | — | — | — | ✅ (chat) | — | — |
| Tableau de bord directeur | ◐ (stats par membre) | ✅ | ✅ | ✅ (799 $+) | ? | ◐ (équipe) | ? | ❌ | ✅ | ✅ | — | ✅ (console) | ✅ | ✅ | ✅ | ✅ | ✅ (Ads Manager) |
| Prix vs marché | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ◐ | — | — | — | — | ◐ (Black Book) | ✅ (iQ) | — |
| Flux catalogue Meta (AIA) | ❌ | ❌ | ◐ (« pubs dynamiques » CRM) | ❌ | ❌ | ❌ | ❌ | ❌ | ◐ | ✅ (audiences) | — | — | — | ✅ (campagnes FB) | — | — | ✅ (natif) |
| Prix public | n/a | ❌ (devis) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ◐ (grille FCA ancienne) | ❌ | n/a |

---

## 4. Ce qu'ils font que Suivia ne fait pas encore (et faisabilité dans le code)

| # | Écart | Qui le fait | Gain concret | Faisabilité dans Suivia |
|---|---|---|---|---|
| G1 | **File « quoi publier aujourd'hui »** priorisée et plafonnée | LotLinx (NIV à risque), AutoLander, Owini (plafond) | Le quota rare (5 par mois si la limite s'applique) va aux unités qui coûtent le plus cher à garder | **Élevée**. `Vehicle.createdAt`, `price`, `photos` et `listings` sont disponibles ; il faut ajouter `priceDroppedAt` et un drapeau directeur. Endpoint et onglet à créer. |
| G2 | **Compteur de quota** par vendeur | AutoLander (mentionné) | Évite les annonces refusées et les suppressions inutiles qui comptent | **Élevée**. Il suffit de compter les `Listing` FB créées dans le mois (heure de Toronto). |
| G3 | **Prix à jour sur l'annonce** | Owini, AutoLander, Kijiji, AutoTrader | Leads plus qualifiés ; **conformité LPC** (le client peut exiger le prix annoncé) | **Élevée**. `priceAtListing` existe déjà et la sync détecte les changements. Il manque le « prix actuellement sur Marketplace » et le flux de confirmation humaine. |
| G4 | **Renouvellement** des annonces qui vieillissent | Owini, AutoLister, Kijiji Elite | Visibilité | **Élevée**, si on passe par le bouton officiel **Renouveler** (aide Meta). Il faut `lastRenewedAt` et une file. **On ne supprime pas pour republier** (le quota compte). |
| G5 | **Retrait rapide des vendus**, suivi du délai | Owini, AutoLander, Shiftly | Moins d'appels inutiles, meilleure réputation | **Élevée**. La file existe ; il faut corriger l'avertissement du vendeur, ajouter `staleSince`, une vue d'équipe et une relance. |
| G6 | **Descriptions bilingues** et blocs garanties | Owini (EN/ES), LESA (voix ES) | Portée Ottawa et Gatineau anglophone | **Élevée**. `description.ts` est pur et testable ; il faut un réglage d'organisation et des blocs saisis par la direction. Respecter l'OQLF (FR d'abord, au moins équivalent). |
| G7 | **Prix tout inclus vérifié** | Personne | Réduit le risque OPC et LPC | **Élevée**. Confirmation au niveau organisation et filtre sur le texte. |
| G8 | **Flux catalogue Meta (AIA)** | Fullpath, Flick Fusion, fournisseurs de sites (DealerOn…) | **Tout** l'inventaire diffusé par la voie officielle | **Élevée**. Une route publique à jeton, sans appel aux API Meta. Toutes les données sont déjà dans `Vehicle`, `VehiclePhoto` et `Organization`. |
| G9 | **Mini-CRM des leads Marketplace** | Owini Elite, AutoLister Total Access | Relances : c'est là que la vente se fait | **Moyenne**. Nouvelles tables additives. **La saisie doit être manuelle** : extraire Messenger automatiquement irait contre les Conditions §3.2.3. |
| G10 | **Photos améliorées par IA** | Spyne, Glo3D, Owini, autobook | Taux de clic | **Moyenne à faible**. Il faut un fournisseur payant (API) et du stockage S3 (déjà prévu dans `storage.ts`). Coût par image à évaluer. |
| G11 | **Qualité des photos** (nombre, ordre, couverture) | AutoTrader.ca (11 photos ou plus = +185 % de leads) | Leads | **Élevée**. Ce ne sont que des contrôles et des alertes. |
| G12 | **Tableau de bord directeur** (couverture, quota d'équipe, délais) | Shiftly, AutoLister 799 $, Fullpath | Pilotage | **Élevée**. Ce sont des requêtes sur l'existant ; une partie est livrée avec le sprint 1. |
| G13 | **Enrichissement des fiches** (points forts, sécurité, garantie depuis le site du concessionnaire) | LESA (commentaires vendeur), Spyne | Descriptions plus riches **sans rien inventer** | **Moyenne**. La fiche détail d2c est déjà téléchargée pour la galerie. Il faut parser le bloc Description et la section Garantie. La liste Options n'est pas fiable. |
| G14 | **Prix vs marché** | AutoTrader iQ, Carbly, LotLinx | Rotation | **Faible**. Il faut une licence de données (J.D. Power, Black Book, CBB…). |
| G15 | Vidéo / 360 | LESA, Flick Fusion, Glo3D, Spyne | Engagement | **Faible** (hors cœur de produit). |

**Ce que nous refusons volontairement de copier** (contraire aux contraintes non négociables de REQUIREMENTS.md §1.4 et aux Conditions de Meta) :

- frappe et souris « humaines » et publication sans clic de l'usager (Owini, autobook) ;
- **suppression puis republication automatique** (Owini « auto-repost ») ;
- publication de masse dans les Groupes ;
- **IA qui répond sur Messenger « en votre nom »** sans validation humaine ;
- extraction automatique des conversations Messenger ;
- suppression des filigranes d'autres sites (Owini), un risque de droit d'auteur.

---

## 5. Classement des améliorations (impact × effort)

Échelles : **Impact** de 1 à 5 (ventes ou temps gagné ou risque évité) · **Effort** de 1 à 5 (5 = le plus lourd) · **Ratio** = I / E · **Risque** = conformité HITL et migrations.

| Rang | Amélioration | Impact | Effort | Ratio | Risque | Décision |
|---|---|---|---|---|---|---|
| 1 | **S1-2** Santé des annonces : prix à corriger + renouvellement guidé (G3, G4) | 4 | 2 | **2,0** | Faible | **Sprint 1** |
| 2 | **S1-3** Retrait des vendus fiabilisé + délai suivi par le directeur (G5, partie de G12) | 4 | 2 | **2,0** | Faible | **Sprint 1** |
| 3 | **S1-4** Description conforme QC : prix tout inclus + FR/EN + garanties configurées (G6, G7) | 4 | 2 | **2,0** | Faible (texte) | **Sprint 1** |
| 4 | **S1-1** File « Aujourd'hui » + quota Meta + anti-doublon d'équipe (G1, G2) | 5 | 3 | **1,67** | Faible | **Sprint 1** |
| 5 | **S1-5** Flux catalogue Meta AIA en CSV (G8) | 5 | 3 | **1,67** | Faible (lecture seule, jeton) | **Sprint 1** |
| 6 | Qualité des photos : nombre, couverture, alerte sous 11 photos, choix de la couverture (G11) | 3 | 2 | 1,5 | Faible | Sprint 2 |
| 7 | Réponses rapides FR/EN à **copier** (disponibilité, essai routier, échange) depuis l'extension, sans envoi automatique | 3 | 2 | 1,5 | Faible | Sprint 2 |
| 8 | **Mini-CRM des leads** (saisie en 10 s, étapes, relances, liaison annonce → vente) (G9) | 5 | 4 | 1,25 | Moyen (données personnelles, Loi 25) | **Sprint 2 (priorité n° 1)** |
| 9 | Tableau de bord directeur complet : couverture des unités âgées, quota d'équipe, conversion leads → ventes (G12) | 4 | 3 | 1,33 | Faible | Sprint 2 (fondations en S1) |
| 10 | Enrichissement des fiches depuis le site (points forts, garantie, sécurité) (G13) | 3 | 3 | 1,0 | Moyen (parsing fragile) | Sprint 2-3 |
| 11 | Photos IA par fournisseur (fond studio, masquage des plaques) (G10) | 3 | 4 | 0,75 | Moyen (coût, droits) | Sprint 3 / test pilote |
| 12 | Prix vs marché (G14) | 3 | 5 | 0,6 | Licence | Plus tard |
| 13 | Vidéo / 360 (G15) | 2 | 5 | 0,4 | — | Non prioritaire |

**Pourquoi ce lot de sprint 1** : les 5 items s'appuient sur des données déjà présentes, ne demandent que des colonnes nullables ou avec valeur par défaut (aucune suppression ni renommage), ne publient rien à la place de l'usager, et couvrent les trois leviers : **mieux choisir** (S1-1), **garder les annonces justes** (S1-2, S1-3, S1-4), **passer à l'échelle légalement** (S1-5).

**Ordre d'exécution conseillé** : S1-3 (petit, corrige un défaut), puis S1-2, S1-4, S1-1, S1-5. Une seule migration Prisma regroupée est possible, par exemple `20261006000000_sprint1_marketplace_health`.

---

## 6. Specs du sprint 1 (prêtes pour un agent de code)

**Règles communes à tous les items**

- **Migrations additives uniquement** : `ADD COLUMN` nullable ou avec `DEFAULT`, `CREATE TABLE`, `CREATE INDEX`. Aucun `DROP`, aucun `RENAME`, aucun changement de type. Un remplissage par `UPDATE` est permis dans le SQL de migration.
- **HITL** : Suivia ne clique jamais « Publier », « Renouveler », « Supprimer » ou « Modifier » sur Facebook. Il ouvre la bonne page, copie les valeurs et enregistre la **confirmation humaine**.
- **Interface et notifications en français** (québécois, vouvoiement), dates et heures en `America/Toronto`.
- **Tests** : Vitest pour la logique pure dans `packages/shared` et pour l'intégration API (modèle : `apps/web/src/__tests__/*.integration.test.ts`), Playwright si l'interface change (`apps/web/e2e/app.spec.ts`).
- Les chemins de fichiers ci-dessous sont des **pistes non contraignantes**.

---

### S1-1 — File « Aujourd'hui » + compteur de quota Meta + anti-doublon d'équipe

**Objectif utilisateur**
« En tant que vendeur, en ouvrant Publications le matin, je vois tout de suite combien de nouvelles annonces Véhicules il me reste ce mois-ci, et les 5 véhicules que je devrais publier en priorité, avec la raison. Je ne publie pas un véhicule qu'un collègue a déjà en ligne. »
« En tant que directeur, je peux marquer un véhicule *Priorité du directeur* (par exemple une unité âgée ou à bonne marge) sans révéler le coût. »

**Changements de schéma (additifs)**
```prisma
model Organization {
  // ...
  marketplaceMonthlyVehicleLimit Int? @default(5) // null = pas de limite affichée
}
model OrganizationMember {
  // ...
  marketplaceMonthlyVehicleLimit Int? // remplace la valeur de l'organisation pour ce compte; null = hérite
}
model Vehicle {
  // ...
  managerPriority     Boolean   @default(false)
  managerPriorityNote String?
  managerPriorityById String?
  priceDroppedAt      DateTime? // posé par la sync quand le nouveau prix < ancien prix
}
```

**Logique**
1. **Fonction pure** `packages/shared/src/priority.ts` :
   ```ts
   scoreVehicleForToday(input: {
     createdAt, price, priceDroppedAt, managerPriority, photoCount,
     activeListingsByOthers: number, blockers: string[], now: Date
   }) → { score: number; reasons: string[]; excludedReason?: string }
   ```
   - **Exclusions** : `blockers.length > 0`, donc `excludedReason` = le premier bloqueur. Le statut doit valoir AVAILABLE.
   - **Âge** : `min(jours depuis createdAt, 90) / 90 × 40` points. Raison : « En stock depuis 47 jours ».
   - **Priorité du directeur** : +25. Raison : « Priorité du directeur » + la note.
   - **Baisse de prix depuis 7 jours ou moins** : +15. Raison : « Prix réduit il y a 2 jours ».
   - **Aucune annonce active dans l'équipe** : +10. Raison : « Personne de l'équipe ne l'a publié ».
   - **Déjà actif chez un collègue** : −30. Raison : « Déjà publié par Marie T. ».
   - **8 photos ou plus** : +5. **Moins de 2 photos** : −10, raison « Photos insuffisantes ».
   - **Constantes** exportées pour les tests ; aucune heuristique sur la marge (non disponible).
2. **Quota** :
   - `limit = member.marketplaceMonthlyVehicleLimit ?? org.marketplaceMonthlyVehicleLimit` ;
   - `used = count(Listing where userId, platform='facebook_marketplace', listedAt >= début du mois en America/Toronto)`, **tous statuts confondus**, parce que Meta indique que les annonces supprimées peuvent compter ;
   - `remaining = max(0, limit − used)` ; `resetsAt` = le 1er du mois suivant à 00 h 00, heure de Toronto.
3. **Sync** (`apps/worker/src/sync.ts`) : quand `newPrice < oldPrice`, poser `priceDroppedAt = now`.
4. **API** :
   - `GET /api/v1/listings/today` (tout membre authentifié) renvoie `{ quota: {limit, used, remaining, resetsAt}, suggestions: [{ vehicle(summary + 1 photo), score, reasons[], alreadyListedBy: [{name}] }], excluded: [{vehicleId, reason}] (max. 20) }`. La liste est triée par score décroissant et contient 20 suggestions au maximum.
   - `PATCH /api/v1/vehicles/:id/priority` `{ managerPriority: boolean, note?: string }` avec `minRole: MANAGER`, plus une entrée au journal d'audit.
   - `PATCH /api/v1/organizations/current` accepte `marketplaceMonthlyVehicleLimit` (ADMIN).
   - `PATCH /api/v1/organizations/members/:id` accepte `marketplaceMonthlyVehicleLimit` (MANAGER ou plus).
5. **Publication à quota épuisé** : on ne bloque pas, parce que la limite réelle dépend du compte, mais on demande une **confirmation**.

**Zones concernées** : `packages/shared/src/priority.ts` (nouveau) et son export dans `index.ts` ; `packages/shared/src/index.ts` (schémas zod) ; `apps/web/src/app/api/v1/listings/today/route.ts` (nouveau) ; `apps/web/src/app/api/v1/vehicles/[id]/priority/route.ts` (nouveau) ; `apps/web/src/app/dashboard/listings/page.tsx` (onglet) ; `dashboard/team/page.tsx` (limite par membre) ; `dashboard/settings/page.tsx` ; `dashboard/inventory/[id]/page.tsx` (bouton priorité) ; `apps/worker/src/sync.ts`.

**Textes d'interface (FR)**
- Onglet : **Aujourd'hui** (placé avant « À préparer »).
- Bandeau quota :
  - « **Il vous reste {remaining} nouvelle(s) annonce(s) Véhicules ce mois-ci** (limite indiquée : {limit}). Remise à zéro le {date}. »
  - Sous-texte : « Compté par Suivia à partir de vos publications enregistrées. Les annonces supprimées peuvent aussi compter pour Meta. Fiez-vous à la limite affichée dans votre compte Facebook. »
- Quota à 0 : « **Limite du mois atteinte.** Concentrez-vous sur les annonces déjà en ligne : prix à jour, renouvellement et retraits. »
- Confirmation à quota épuisé :
  - titre « Publier quand même? » ;
  - texte « Selon Suivia, vous avez déjà {used} annonce(s) Véhicules ce mois-ci. Facebook pourrait refuser la publication. » ;
  - boutons « Annuler » / « Ouvrir Marketplace quand même ».
- Carte suggestion : badge « Priorité n° {rang} », puces de raisons, bouton **Préparer l'annonce**.
- Doublon : « Déjà en ligne chez {nom} : évitez une deuxième annonce pour le même véhicule. »
- Directeur, sur la fiche véhicule : interrupteur « Priorité du directeur », champ « Note (visible par l'équipe) », aide « Utilisez-le pour les unités âgées ou à bonne marge. Le coût n'est jamais affiché. »
- Équipe : colonne « Limite Marketplace / mois », valeur vide = « Valeur de la concession ({n}) ».
- Note sur l'âge : « Âge calculé depuis l'arrivée du véhicule dans Suivia. »

**Critères d'acceptation (testables)**
1. Unitaire : un véhicule de 90 jours ou plus avec `managerPriority` et sans doublon obtient un score plus élevé qu'un véhicule de 5 jours sans priorité. La liste `reasons` contient « Priorité du directeur ».
2. Unitaire : un véhicule sans prix est exclu, avec `excludedReason = "Prix de vente requis."`.
3. Intégration : avec `limit = 5` et 3 `Listing` FB de ce vendeur créées ce mois-ci (dont 1 au statut REMOVED), `GET /listings/today` renvoie `used = 3` et `remaining = 2`.
4. Intégration : une `Listing` créée le dernier jour du mois précédent à 23 h 30 (heure de Toronto) n'est **pas** comptée. Un test garde le fuseau.
5. Intégration : un véhicule ACTIVE chez l'utilisateur B apparaît pour l'utilisateur A avec `alreadyListedBy = [{name: B}]` et passe sous un véhicule équivalent non publié.
6. Intégration : `PATCH /vehicles/:id/priority` par un SALESPERSON renvoie 403 ; par un MANAGER, 200 avec une entrée au journal d'audit.
7. Worker : une baisse de prix pose `priceDroppedAt` ; une hausse ne le pose pas.
8. E2E : l'onglet « Aujourd'hui » s'affiche, le bandeau montre le quota, et la boîte de confirmation apparaît quand `remaining = 0`.
9. Migration : `prisma migrate diff` ne montre que des ajouts.

---

### S1-2 — Santé des annonces : « Prix à mettre à jour » + « Renouvellement possible »

**Objectif utilisateur**
« Quand le prix d'un véhicule change dans l'inventaire, je suis averti que mon annonce Marketplace affiche l'ancien prix. Je la corrige dans Facebook en 30 secondes et je confirme dans Suivia. Quand une annonce a 7 jours ou plus, Suivia me propose de la **renouveler avec le bouton officiel de Facebook**, sans la supprimer. »

**Changements de schéma (additifs)**
```prisma
model Listing {
  // ...
  marketplacePrice     Decimal?  @db.Decimal(12, 2) // dernier prix confirmé sur Marketplace
  lastPriceConfirmedAt DateTime?
  lastRenewedAt        DateTime?
}
```
SQL de migration : `UPDATE listings SET "marketplacePrice" = "priceAtListing" WHERE "marketplacePrice" IS NULL;`

**Logique**
1. **Fonction pure** `packages/shared/src/listing-health.ts` :
   ```ts
   getListingHealth({ status, vehiclePrice, marketplacePrice, priceAtListing, listedAt, lastRenewedAt, now })
     → { priceMismatch: null | { from, to, direction: 'up'|'down' }, renewDue: boolean, daysSinceFreshness: number }
   ```
   - Écart de prix : statut ACTIVE et `vehiclePrice != (marketplacePrice ?? priceAtListing)`, comparé à l'unité près.
   - Renouvellement : statut ACTIVE et `now − (lastRenewedAt ?? listedAt) >= 7 jours`. Constante `RENEW_AFTER_DAYS = 7` ; le délai de 7 jours n'est confirmé que par des sources secondaires, d'où la constante.
2. **API** :
   - `GET /api/v1/listings` ajoute `health` à chaque annonce ACTIVE, plus `counts.PRICE_MISMATCH` et `counts.RENEW_DUE`. Filtre optionnel `?health=price|renew`.
   - `POST /api/v1/listings/:id/confirm-price` `{ price }` : l'annonce doit appartenir à l'utilisateur, ou l'utilisateur doit être MANAGER ou plus. Effets : `marketplacePrice = price`, `lastPriceConfirmedAt = now`, `ListingEvent('price_updated', {from, to})`, journal d'audit. Refus 422 si `price != vehicle.price`, avec le message « Le prix confirmé doit correspondre au prix de l'inventaire ».
   - `POST /api/v1/listings/:id/confirm-renewal` : `lastRenewedAt = now`, `ListingEvent('renewed')`. Refus 409 si `renewDue = false`.
   - Ajouter les deux actions à `apps/web/src/app/api/v1/extension/events` si l'extension les utilise.
3. **Worker** (`notifyPriceChange`) : **en plus** des gestionnaires, avertir chaque `userId` qui a une `Listing` ACTIVE sur ce véhicule.
   - Type `PRICE_CHANGE`, texte en français ; métadonnées `{ listingId, vehicleId, oldPrice, newPrice, direction }`.
   - Une **hausse** de prix produit un titre d'urgence.
4. **Vue du matin** : carte « Annonces à corriger » (écarts de prix et renouvellements dus).

**Zones concernées** : `packages/shared/src/listing-health.ts` (nouveau) ; `apps/web/src/app/api/v1/listings/route.ts` ; `listings/[id]/confirm-price/route.ts` et `confirm-renewal/route.ts` (nouveaux) ; `apps/worker/src/sync.ts` ; `dashboard/listings/page.tsx` (onglet « Publiées » : sous-filtres et badges) ; `dashboard/page.tsx`.

**Textes d'interface (FR)**
- Sous-filtres de « Publiées » : « Toutes · **Prix à mettre à jour ({n})** · **Renouvellement possible ({n})** ».
- Badge baisse : « Prix à mettre à jour : {ancien} → {nouveau} ».
- Badge hausse (rouge) : « **Prix augmenté : à corriger maintenant** ». Infobulle : « Au Québec, un client peut exiger le prix annoncé (LPC, art. 224 c)). Mettez l'annonce à jour sans délai. »
- Actions prix :
  - « Ouvrir l'annonce » (`externalUrl`) ;
  - « Copier le nouveau prix » ;
  - « **J'ai mis le prix à jour dans Facebook** » ;
  - aide : « Dans Facebook : ⋯ > Modifier l'annonce > Prix > Mettre à jour. »
- Badge renouvellement : « En ligne depuis {n} jours, renouvellement possible ».
- Actions renouvellement :
  - « Ouvrir mes annonces Marketplace » ;
  - « **J'ai cliqué Renouveler** » ;
  - aide : « Dans Facebook : Vendre > Vos annonces > **Renouveler**. Ne supprimez pas l'annonce pour la republier : une annonce supprimée peut compter dans votre limite mensuelle. »
  - URL à ouvrir : la page « Vos annonces » de Marketplace. **L'URL exacte est à vérifier par l'agent dans un navigateur connecté.** Repli : `https://www.facebook.com/marketplace/`.
- Notification (baisse) :
  - titre « Prix modifié : mettez votre annonce à jour » ;
  - message « {véhicule} (stock {stock}) : {ancien} → {nouveau}. Votre annonce Marketplace affiche encore l'ancien prix. »
- Notification (hausse) :
  - titre « Prix augmenté : annonce à corriger immédiatement » ;
  - message « {véhicule} (stock {stock}) : {ancien} → {nouveau}. Le client peut exiger le prix affiché sur Marketplace. »
- Message de confirmation : « Prix confirmé sur Marketplace. » / « Renouvellement enregistré. Prochain rappel dans 7 jours. »

**Critères d'acceptation**
1. Unitaire : une annonce ACTIVE avec `priceAtListing = 25 000`, `marketplacePrice = null` et `vehiclePrice = 23 995` donne `priceMismatch.direction = 'down'`.
2. Unitaire : une annonce publiée il y a 6 jours et 23 heures donne `renewDue = false` ; à 7 jours, `true` ; après `lastRenewedAt` il y a 2 jours, `false`.
3. Intégration : `confirm-price` avec le bon prix supprime l'écart au `GET` suivant et crée un `ListingEvent('price_updated')`. Avec un autre prix, 422.
4. Intégration : `confirm-renewal` sur une annonce de 3 jours renvoie 409 ; sur une annonce de 8 jours, 200, puis `renewDue = false`.
5. Intégration : un SALESPERSON ne peut pas confirmer l'annonce d'un collègue (404 ou 403) ; un MANAGER le peut.
6. Worker : une hausse de 23 995 à 24 995 sur un véhicule publié par A (non assigné) crée **une** notification en français pour A et une pour chaque gestionnaire.
7. Migration : les annonces existantes ont `marketplacePrice = priceAtListing` après la migration.
8. E2E : les badges et les compteurs des sous-filtres s'affichent ; le clic « J'ai mis le prix à jour dans Facebook » retire le badge.

---

### S1-3 — Retrait des vendus fiabilisé + délai suivi par le directeur

**Objectif utilisateur**
« Quand un véhicule que j'ai publié est vendu ou disparaît de BuckinghamGM, je suis averti tout de suite, en français, même si je n'étais pas assigné. »
« En tant que directeur, je vois toutes les annonces de véhicules vendus encore en ligne dans l'équipe, depuis combien d'heures, et Suivia relance automatiquement le vendeur après 24 h. »

**Changements de schéma (additifs)**
```prisma
model Listing {
  // ...
  staleSince             DateTime? // moment où l'annonce est passée à STALE
  removalReminderSentAt  DateTime?
}
```
SQL : `UPDATE listings SET "staleSince" = COALESCE("lastCheckedAt", "updatedAt") WHERE status = 'STALE' AND "staleSince" IS NULL;`

**Logique**
1. **`apps/worker/src/sync.ts`**, cas des véhicules confirmés manquants :
   - **avant** l'`updateMany` qui passe les annonces à STALE, lire les `Listing` ACTIVE (`id`, `userId`, `vehicleId`) ;
   - poser `staleSince = soldAt` ;
   - destinataires = ceux qui ont publié l'annonce, plus la personne assignée, ou les gestionnaires seulement si personne d'autre n'est concerné. On dédoublonne.
2. **`apps/web/src/lib/services.ts#notifySoldVehicle`** : poser `staleSince` et traduire les textes en français.
3. **Traduire en français** toutes les notifications du worker (SOLD_ALERT, PRICE_CHANGE, SYNC_ERROR).
4. **Relance** : tâche répétable BullMQ toutes les heures dans `apps/worker/src/index.ts` (modèle : `scheduleSyncJobs`). Pour les annonces STALE avec `staleSince < now − 24 h` et `removalReminderSentAt IS NULL` :
   - créer une notification `LISTING_REMINDER` pour le vendeur ;
   - créer une notification récapitulative pour les gestionnaires (une par organisation et par passage) ;
   - poser `removalReminderSentAt`.
5. **API** : `GET /api/v1/listings?scope=team&status=STALE`, avec `minRole: MANAGER` si `scope=team`. Renvoie les annonces de toute l'organisation avec `user.name`, `staleSince` et `hoursStale`.
6. **Vue du matin** (directeur) : carte « Véhicules vendus encore en ligne (équipe) », triée par ancienneté.
7. **Confirmation de retrait** : le `PATCH /listings/:id` existant (passage à REMOVED) est permis au propriétaire de l'annonce et aux MANAGER ou plus, avec `ListingEvent('listing_removed', {confirmedBy})`.

**Zones concernées** : `apps/worker/src/sync.ts`, `apps/worker/src/index.ts`, `apps/web/src/lib/services.ts`, `apps/web/src/app/api/v1/listings/route.ts` et `[id]/route.ts`, `apps/web/src/app/dashboard/page.tsx`, `dashboard/listings/page.tsx` (onglet « À retirer » : afficher « vendu depuis X h »).

**Textes d'interface (FR)**
- Notification au vendeur :
  - titre « Véhicule vendu : retirez votre annonce » ;
  - message « {véhicule} (stock {stock}) n'est plus dans l'inventaire de {concession}. Retirez l'annonce sur Facebook, puis confirmez le retrait dans Suivia. »
- Relance 24 h :
  - titre « Rappel : annonce d'un véhicule vendu encore en ligne » ;
  - message « {véhicule} est vendu depuis {n} h. Chaque jour en ligne génère des messages inutiles. »
- Récapitulatif directeur :
  - titre « {n} annonce(s) de véhicules vendus encore en ligne » ;
  - message « Les plus anciennes : {nom vendeur} ({véhicule}, {n} h)… »
- Carte Vue du matin : « Véhicules vendus encore en ligne (équipe) ». Colonnes « Vendeur », « Véhicule », « Vendu depuis », « Action ».
  - Couleurs : moins de 24 h en neutre, 24 à 48 h en orange, plus de 48 h en rouge.
- Onglet « À retirer » : sous-titre « Vendu depuis {n} h », bouton « J'ai retiré l'annonce ».
- Bouton du directeur : « Confirmer le retrait pour {vendeur} », avec la confirmation « Confirmez seulement si l'annonce n'est plus visible sur Facebook. »
- Sync en erreur :
  - titre « Synchronisation en échec : {source} » ;
  - message « {erreur}. Les retraits et les prix ne sont pas à jour tant que la synchronisation n'est pas rétablie. »

**Critères d'acceptation**
1. Worker (test avec la base) : un véhicule non assigné publié par A, absent du flux deux fois de suite, crée une notification SOLD_ALERT **pour A**, avec un titre en français, et `Listing.staleSince` est renseigné.
2. Worker : si le véhicule est assigné à B et publié par A, A et B reçoivent chacun **exactement une** notification.
3. Worker : l'arrêt de sécurité (baisse anormale) ne crée **aucune** notification et ne pose pas `staleSince` (non-régression).
4. Relance : une annonce STALE depuis 25 h reçoit une relance et `removalReminderSentAt` est posé ; au passage suivant, aucune deuxième relance.
5. API : `GET /listings?scope=team&status=STALE` par un SALESPERSON renvoie 403 ; par un MANAGER, les annonces de tous les vendeurs.
6. Aucun texte de notification créé par le worker ne contient « Vehicle », « Price Change » ni « Sync Failed » (test par recherche de chaînes).
7. Migration : les STALE existantes ont `staleSince` renseigné.

---

### S1-4 — Description conforme Québec : prix tout inclus vérifié + FR/EN + garanties configurées

**Objectif utilisateur**
« En tant que directeur, je confirme une fois que les prix synchronisés sont des prix tout inclus, et je saisis nos vrais avantages (garanties, inspection, échange) en français et en anglais. »
« En tant que vendeur, j'obtiens une annonce **française d'abord, puis anglaise**, qui reprend seulement des faits réels. Suivia m'empêche de publier un texte qui laisse entendre des frais en plus du prix. »

**Changements de schéma (additifs)**
```prisma
model Organization {
  // ...
  allInPriceConfirmedAt   DateTime?
  allInPriceConfirmedById String?
  listingLanguage         String    @default("fr") // "fr" | "fr_en"
  listingHighlights       Json?     // { NEW?: {fr, en}, USED?: {fr, en}, DEMO?: {fr, en} }, texte libre saisi par la direction
}
```

**Logique**
1. **`packages/shared/src/description.ts`**
   - `VehicleData` reçoit `allInPriceConfirmed?: boolean`, `language?: 'fr' | 'fr_en'` et `highlights?: { fr?: string; en?: string }`.
   - **Libellé de prix** dans le gabarit : « **Prix tout inclus : 24 495 $** ».
   - **Mention de bas de page** : « Prix tout inclus : transport, préparation et frais d'administration compris. Seules la TPS, la TVQ et, le cas échéant, le droit spécifique sur les pneus neufs s'ajoutent. » Elle remplace la ligne actuelle.
   - **Bloc « AVANTAGES CHEZ {concession} »** : `highlights.fr`, **reproduit tel quel**. En anglais : « WHY BUY FROM {dealer} ».
   - **`language = 'fr_en'`** : la version FR complète, puis le séparateur `— English version —`, puis une version EN qui contient **les mêmes faits**. La version EN est produite par le gabarit pour les libellés fixes, et par l'IA si elle est active.
2. **`validateMarketplacePackage`**
   - **Bloqueur** si `allInPriceConfirmed === false` : « Prix tout inclus non confirmé par la direction (Paramètres > Conformité). »
   - **Bloqueur** si le titre ou la description correspond à `ALL_IN_PRICE_VIOLATIONS`. Expressions régulières exportées et testées, par exemple :
     - `/\+\s*(frais|transport|pr[ée]p|admin)/i`
     - `/(plus|en sus|extra)\s+(les\s+)?(frais|transport|pr[ée]paration|livraison|administration)/i`
     - `/prix\s+avant\s+frais/i`
     - `/\bPDI\b/i`
     - `/frais\s+d['’]administration\s+(en sus|non inclus|additionnels?)/i`

     Message : « Le texte laisse entendre des frais en plus du prix. Au Québec, le prix annoncé doit être tout inclus (LPC, art. 224 c); OPC). »
   - **Avertissement** (non bloquant) si le texte contient des mensualités ou un taux (`/\$\s*\/\s*(mois|sem)|par (mois|semaine)|taux\s+de\s+\d/i`) : « Publicité de crédit : des mentions obligatoires s'appliquent. Retirez la mensualité ou faites valider le texte par la direction. »
   - **Avertissement** si `language = 'fr_en'` et que la section EN est plus longue de 20 % que la section FR, ou si le FR n'est pas en premier : « La version française doit être au moins équivalente à l'anglaise (OQLF). »
3. **IA** (`apps/web/src/lib/services.ts`) :
   - le prompt passe à « prix tout inclus » ;
   - injection des `highlights` comme **seules** garanties ou avantages permis, avec la consigne « reproduis-les sans les modifier ni en ajouter » ;
   - en mode `fr_en`, on demande un JSON `{fr, en}`, puis on assemble ;
   - le résultat de l'IA passe par `validateMarketplacePackage`. Un texte bloqué n'est jamais présenté comme prêt.
4. **API** : `PATCH /organizations/current` accepte `listingLanguage`, `listingHighlights` (zod : max. 600 caractères par texte) et `confirmAllInPrice: true`. Cette dernière option pose `allInPriceConfirmedAt` et `ById`, avec `minRole: ADMIN` et une entrée au journal d'audit. Le retrait de la confirmation est permis et journalisé lui aussi.
5. **Tous les appelants** de `generateMarketplacePackage`, `generateTemplateDescription` et `validateMarketplacePackage` (`listings/page.tsx`, `listings/route.ts`, `extension/events`, `extension/route.ts`, `marketplace-draft`) passent les nouveaux champs.

**Zones concernées** : `packages/shared/src/description.ts` et ses tests ; `packages/shared/src/index.ts` (zod `updateOrganizationSchema`) ; `apps/web/src/lib/services.ts` ; `apps/web/src/app/dashboard/settings/page.tsx` (section « Conformité et annonces ») ; les appelants listés ci-dessus.

**Textes d'interface (FR)**
- Section des Paramètres : **Conformité et annonces**.
- Case à cocher (ADMIN) : « Je confirme que les prix de l'inventaire synchronisé sont des **prix tout inclus** : transport, préparation, livraison, frais d'administration et taxe d'accise sur les climatiseurs compris. Seules la TPS, la TVQ et le droit spécifique sur les pneus neufs s'ajoutent. »
  - Lien : « Règle de l'OPC » (URL OPC).
  - Fois confirmée : « Confirmé par {nom} le {date}. »
- Sélecteur : « Langue des annonces : Français seulement · **Français puis anglais** ». Aide : « La version française apparaît en premier et reste au moins aussi complète (Charte de la langue française). »
- Champs « Avantages à mettre en valeur », par type (Neufs, Occasion, Démonstrateurs) et par langue :
  - placeholder FR : « Ex. : inspection mécanique complète; garantie… (inscrivez seulement ce qui est réellement offert) » ;
  - placeholder EN : « E.g., full mechanical inspection; warranty… (only what is actually offered) ».
- Bloqueur, dans la fenêtre Publier : « Prix tout inclus non confirmé par la direction. »
- Bandeau d'aide : « Aide à la conformité seulement : validez toujours l'exactitude du prix et des mentions. » (reprend la mention existante).

**Critères d'acceptation**
1. Unitaire : `generateTemplateDescription` contient « Prix tout inclus : 24 495 $ » et la nouvelle mention de bas de page ; il ne contient plus « Aucun frais obligatoire additionnel » seul.
2. Unitaire : `validateMarketplacePackage` avec `allInPriceConfirmed: false` renvoie `isReady = false` et le bloqueur en français.
3. Unitaire : chacune des phrases « 24 995 $ + frais de transport », « plus préparation », « prix avant frais », « PDI en sus » est bloquée ; « transport et préparation inclus » ne l'est **pas**.
4. Unitaire : en mode `fr_en`, la description commence par la version FR, contient `— English version —`, et les deux sections contiennent le même prix, le même kilométrage et le même NIV.
5. Unitaire : `highlights.fr = "Inspection 150 points"` apparaît mot pour mot dans le bloc AVANTAGES ; sans `highlights`, aucun bloc AVANTAGES et aucun mot « garantie » produit par le gabarit.
6. Intégration : `PATCH /organizations/current {confirmAllInPrice: true}` par un MANAGER renvoie 403 ; par un ADMIN, 200, `allInPriceConfirmedAt` posé et une entrée au journal d'audit.
7. Intégration (IA simulée) : si le texte renvoyé par l'IA contient « + frais d'administration », la réponse de `generate-description` signale le bloqueur.
8. E2E : sans confirmation, le bouton « Publier sur Marketplace » est désactivé et le bloqueur est visible.

---

### S1-5 — Flux catalogue Meta pour les Automotive Inventory Ads (CSV planifié)

**Objectif utilisateur**
« En tant que propriétaire, j'active un lien de flux sécurisé que je colle une fois dans le Commerce Manager de Meta (Catalogue > Auto > Véhicules > Source de données > Flux planifié). Tout l'inventaire disponible, en français et avec le prix tout inclus, alimente nos publicités d'inventaire et reste à jour automatiquement. Suivia ne crée et ne dépense aucune publicité : je garde la main dans Ads Manager. »

**Changements de schéma (additifs)**
```prisma
model Organization {
  // ...
  metaCatalogFeedEnabled Boolean @default(false)
  metaCatalogFeedToken   String? @unique // ≥ 32 octets aléatoires, base64url
  metaCatalogStateForDemo String @default("Used") // "Used" | "New" : à valider par la direction
}
```

**Logique**
1. **Route publique** `GET /api/feeds/meta/[token]/vehicles.csv`, hors `/api/v1`, sans session.
   - Jeton inconnu ou flux désactivé : **404**, même corps dans les deux cas.
   - En-têtes : `Content-Type: text/csv; charset=utf-8`, `Cache-Control: public, max-age=900`.
   - Limite de débit simple en mémoire ou Redis : 60 requêtes par heure et par jeton.
   - Le jeton n'est jamais journalisé en clair.
2. **Sélection** : `Vehicle.status = AVAILABLE` de l'organisation. Les véhicules vendus disparaissent du fichier ; Meta remplace le flux à chaque téléversement planifié.
3. **Correspondance des colonnes** (fonction pure `packages/shared/src/meta-catalog.ts#toMetaVehicleRow`) :

   | Colonne Meta | Source Suivia |
   |---|---|
   | `vehicle_id` | `vin` (sinon `stockNumber`, sinon exclusion) |
   | `vin` | `vin` |
   | `title` | `generateListingTitle` (≤ 500) |
   | `description` | variante « catalogue » : faits en phrases, **pas de titres en majuscules, pas d'URL, pas de téléphone**, avec la mention prix tout inclus. Max. 5000. |
   | `url` | `sourceUrl` (fiche du concessionnaire) |
   | `make`, `model`, `year`, `trim` (≤ 50) | `Vehicle` |
   | `mileage.value` / `mileage.unit` | `mileage` (0 si neuf) / `KM` |
   | `price` | `"{entier} CAD"` (prix tout inclus) |
   | `state_of_vehicle` | `classifyInventoryKind` : new → `New`, used → `Used`, demo → `metaCatalogStateForDemo` |
   | `exterior_color`, `interior_color` | `Vehicle` |
   | `body_style` | correspondance FR/EN vers l'enum Meta (VUS → SUV, Camionnette → PICKUP, Berline → SEDAN, Fourgonnette → MINIVAN ou VAN, Coupé → COUPE, Hayon → HATCHBACK, Familiale → WAGON, sinon OTHER) |
   | `transmission` | AUTOMATIC, MANUAL ou OTHER |
   | `fuel_type` | GASOLINE, DIESEL, ELECTRIC, HYBRID, FLEX ou OTHER |
   | `drivetrain` | AWD, FWD, RWD, 4X4 ou OTHER (correspondance de « Traction intégrale », « 4x4 »…) |
   | `image[0].url` … `image[19].url` | `VehiclePhoto` triées, URL https seulement |
   | `address` | `{addr1: '{address}', city: '{city}', region: '{state}', postal_code: '{zip}', country: 'Canada'}` |
   | `date_first_on_lot` | `createdAt` (aaaa-mm-jj), avec une note sur l'approximation |
   | `availability` | `available` |
   | `dealer_name`, `dealer_phone` | `Organization.name`, `phone` |

4. **Validation par véhicule** (`validateMetaVehicleRow`) :
   - **exclusion** si un champ requis manque : prix, NIV ou stock, année, marque, modèle, URL, 1 image, couleur extérieure, adresse de l'organisation ;
   - **avertissement** (pas d'exclusion) si moins de 2 images ou si le kilométrage d'un véhicule d'occasion est de 500 km ou moins : « non admissible au placement Marketplace ».
5. **Prérequis d'activation** : `allInPriceConfirmedAt` non nul (S1-4) **et** adresse complète de l'organisation. Sinon, 409 avec la raison.
6. **API d'administration** (ADMIN) :
   - `POST /api/v1/admin/meta-catalog/enable` (crée le jeton s'il n'existe pas) et `/disable` ;
   - `/rotate-token` (nouveau jeton, l'ancien devient 404 immédiatement) ;
   - `GET /api/v1/admin/meta-catalog/preview` renvoie `{ included, excluded: [{vehicleId, title, reasons[]}], warnings: [...] , sampleRows: 3 }` ;
   - tout est journalisé.
7. **Langue** : flux principal en **français**. Le flux de langue EN (`override = en_XX`) est reporté au sprint 2, après un test réel dans le Commerce Manager.

**Zones concernées** : `packages/shared/src/meta-catalog.ts` (nouveau, avec un sérialiseur CSV RFC 4180 : guillemets, retours de ligne, BOM UTF-8 optionnel à tester avec Meta) ; `apps/web/src/app/api/feeds/meta/[token]/vehicles.csv/route.ts` (nouveau) ; `apps/web/src/app/api/v1/admin/meta-catalog/*` (nouveaux) ; `apps/web/src/app/dashboard/settings/page.tsx` ou une nouvelle page `dashboard/meta-catalog/page.tsx` ; menu `components/dashboard-layout.tsx` (entrée « Catalogue Meta », ADMIN).

**Textes d'interface (FR)**
- Titre de page : **Catalogue Meta (publicités d'inventaire)**.
- Introduction : « Diffusez tout votre inventaire par la voie officielle de Meta : les publicités d'inventaire automobile (Facebook, Instagram et le placement Marketplace). Suivia fournit le flux ; vous gardez le contrôle des campagnes et du budget dans le Gestionnaire de publicités. »
- Interrupteur : « Activer le flux ». Prérequis non remplis : « Pour activer le flux, confirmez d'abord les prix tout inclus et complétez l'adresse de la concession. »
- Champ URL + bouton « Copier le lien ». Aide : « Gardez ce lien privé : il donne accès à votre inventaire disponible. »
- Bouton « Régénérer le lien », avec la confirmation « L'ancien lien cessera de fonctionner immédiatement. Mettez à jour la source de données dans Meta. »
- Aperçu :
  - « **{included} véhicules inclus** · {excluded} exclus · {warnings} avertissements » ;
  - tableau des exclus avec les raisons : « Prix manquant », « Aucune photo », « Couleur extérieure manquante », « NIV et numéro de stock manquants » ;
  - avertissement : « Moins de 2 photos : non admissible au placement Marketplace ».
- Réglage : « Démonstrateurs déclarés à Meta comme : Occasion / Neuf ». Aide : « À valider avec la direction. »
- Étapes dans Meta (liste numérotée) :
  1. Commerce Manager > Ajouter un catalogue > **Auto** > **Véhicules**.
  2. Sources de données > Flux de données > **Flux planifié** > collez le lien.
  3. Fréquence : **toutes les heures** ou **quotidienne**.
  4. Dans le Gestionnaire de publicités, créez une campagne avec le catalogue (publicités d'inventaire automobile).
- Mention : « Suivia ne crée aucune publicité et n'engage aucune dépense. »

**Critères d'acceptation**
1. Unitaire : `toMetaVehicleRow` d'un VUS d'occasion de 48 731 km à 24 495 $ produit `price = "24495 CAD"`, `mileage.unit = "KM"`, `state_of_vehicle = "Used"`, `body_style = "SUV"`, et une adresse avec `country: 'Canada'`.
2. Unitaire : un véhicule neuf produit `mileage.value = 0` et `state_of_vehicle = "New"` ; un démonstrateur suit `metaCatalogStateForDemo`.
3. Unitaire : la description du catalogue ne contient aucune ligne entièrement en majuscules, aucune URL `http`, et contient « Prix tout inclus ».
4. Unitaire : le CSV gère correctement les guillemets, les virgules et les retours de ligne (lecture aller-retour avec un parseur CSV) ; l'en-tête respecte l'ordre défini.
5. Intégration : `GET /api/feeds/meta/{bon-jeton}/vehicles.csv` renvoie 200, `text/csv`, une ligne par véhicule AVAILABLE valide, et aucune ligne SOLD.
6. Intégration : un jeton inconnu et un flux désactivé renvoient tous deux 404, avec un corps identique.
7. Intégration : après `rotate-token`, l'ancien jeton renvoie 404 et le nouveau 200.
8. Intégration : `enable` sans `allInPriceConfirmedAt` renvoie 409 ; par un MANAGER, 403.
9. Manuel (hors CI) : un téléversement de test dans le Commerce Manager d'un catalogue bac à sable accepte le fichier. On note les erreurs éventuelles dans `DEPLOIEMENT_SUIVIA.md`.

---

## 7. Backlog après le sprint 1 (pistes)

1. **Mini-CRM des leads Marketplace** (sprint 2, priorité n° 1).
   - Tables `Lead` (nom, canal, véhicule ou annonce, étape, prochaine relance, consentement), `LeadActivity` et `Listing.leadCount`.
   - Bouton « + Prospect » dans le Centre de publication et dans le menu de l'extension ; **la saisie est faite par le vendeur** ; relances en notifications.
   - Conformité Loi 25 : finalité, conservation de 24 mois configurable, suppression sur demande.
2. **Réponses rapides FR/EN** à copier (disponibilité, essai routier, échange, financement « à valider en concession »), sans envoi automatique.
3. **Qualité des photos** : score par véhicule (nombre, présence avant, côté, intérieur, tableau de bord), alerte sous 11 photos (repère AutoTrader.ca), choix de la photo de couverture.
4. **Tableau de bord directeur v2** : couverture des unités de 45 jours ou plus, quota utilisé par l'équipe, délai moyen de retrait, leads par annonce, ventes attribuées.
5. **Enrichissement d2c** : parser le bloc « Description » du concessionnaire (points forts déclarés : « jamais accidenté », « un seul propriétaire »), la section « Garantie » et les caractéristiques de sécurité, puis les stocker (`Vehicle.dealerHighlights`, `features`). La liste « Options » est **exclue** tant qu'on n'a pas trouvé comment repérer les éléments réellement cochés.
6. **Flux catalogue EN** (`override en_XX`) et option XML.
7. **Photos IA** : pilote de 30 jours avec un fournisseur (Spyne, Glo3D ou une API de détourage), avec mesure avant/après des clics. Aucune suppression de filigrane appartenant à des tiers.
8. **Correctif `soldAt`** : ne pas le réécrire à chaque passage de la sync.

---

## 8. Sources consultées

**Meta**
- https://www.facebook.com/business/help/492940666175475
- https://www.facebook.com/help/811082570742714
- https://www.facebook.com/help/976748741431731
- https://www.facebook.com/help/514314075439323
- https://www.facebook.com/legal/terms
- https://www.facebook.com/business/help/1930396467200635
- https://www.facebook.com/business/help/143781049600895
- https://developers.facebook.com/docs/marketing-api/auto-ads/reference/
- https://developers.facebook.com/docs/marketing-api/reference/product-catalog/vehicles/
- https://developers.facebook.com/docs/marketing-api/auto-ads/guides/catalog/
- https://developers.facebook.com/docs/marketing-api/auto-ads/guides/aia/
- https://developers.facebook.com/docs/marketing-api/catalog/localized-catalog/localized-catalog-setup/
- https://developers.facebook.com/community/threads/268250319606970/

**Québec**
- https://www.opc.gouv.qc.ca/commercant/secteur/vehicule/publicite/regle/prix
- https://lpc.quebec/decisions/gagnon-c-berard-autos-choix-inc-2017-qccq-2528/
- https://www.oqlf.gouv.qc.ca/francisation/entreprises/Guide_Medias-sociaux_2025.pdf
- https://www.buckinghamgm.com/occasion/ (mentions de prix)

**Concurrents**
- Shiftly :
  - https://shiftlyauto.com/
  - https://shiftlyauto.com/terms-and-conditions
  - https://shiftlyauto.com/blogs/how-many-cars-can-you-post-on-facebook-marketplace-per-day
  - https://chromewebstore.google.com/detail/shiftly-auto-lister/ekojgodjldjgppkjnjacbeedofegfioh
  - https://www.trustpilot.com/review/www.shiftlyauto.com (extrait seulement)
  - https://www.reddit.com/r/carsales/comments/1sci6a3/anyone_using_shiftly/ (extrait seulement)
  - https://postdrop.ai/reviews/shiftly-auto
- Owini : https://owini.ai/poster ; https://owini.ai/pricing
- AutoLister Pro : https://www.autolisterpro.com/facebook-marketplace-auto-poster-chrome-extension ; https://www.autolisterpro.com/pricing
- autobook.io : https://autobook.io/blog/autobook-vs-shiftly ; https://autobook.io/blog/can-car-dealers-post-on-facebook-marketplace
- PostDrop : https://postdrop.ai/ ; https://postdrop.ai/pricing
- AutoLander : https://autolander.ai/bulk-post-cars-to-facebook-marketplace/
- Marketplace Pro : https://www.marketplacepro.co.uk/ ; https://chromewebstore.google.com/detail/facebook-marketplace-pro/llalepkemdeahfadgopnngobmfldfmld
- Carbly : https://getcarbly.com/appraisals/ ; https://getcarbly.com/register/
- LotLinx : https://lotlinx.com/lotlinx-products-and-solutions/ ; https://lotlinx.com/products/packages/
- Fullpath : https://www.fullpath.com/cdp-for-car-dealers/ ; https://www.coxautoinc.com/press-releases/cox-automotive-completes-acquisition-of-fullpath/
- LESA : https://www.lesautomotive.com/lesa-video-merchandising-packages-for-car-dealerships-simple-and-drive-value-for-website/
- Spyne : https://www.spyne.ai/pricing
- Glo3D : https://glo3d.com/car-photography-app/ ; https://glo3d.com/pricing/
- Flick Fusion : https://flickfusion.com/tools/
- Kijiji Autos (grille FCA) : https://www.stellantisdigital.ca/docs/English/Inventory/kijijiautos.pdf
- AutoTrader.ca : https://go.trader.ca/lift-your-leads-with-better-merchandising/
- EDealer : https://www.edealer.ca/blog/changes-to-facebook-marketplace/

**Limites de la recherche**
- Trustpilot et Reddit protègent leurs pages par un défi anti-robot. Je ne l'ai pas contourné, et seuls des extraits de recherche ont été utilisés.
- Aucun avis indépendant n'a été trouvé pour Owini, AutoLister Pro, LotLinx, LESA et Flick Fusion ; seuls des témoignages des éditeurs.
- Les prix des concurrents sont ceux affichés le 5 octobre 2026 et peuvent être promotionnels (PostDrop, AutoLister Pro).
