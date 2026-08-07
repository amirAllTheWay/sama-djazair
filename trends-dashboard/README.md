# Star Style Tracker

Dashboard en colonnes de la couverture presse des tenues de célébrités, une
colonne par star. Pour chaque article : la photo, le look, la marque,
l'occasion et un résumé — de quoi décider en un coup d'œil s'il y a matière à
en faire un contenu.

## Ce qu'il fait

Au clic sur **Actualiser**, pour chaque star de `config/stars.json` :

1. Envoie chaque requête de `articleQueries` à **Google**, avec son filtre de
   récence (`recency`, « month » par défaut) — via Serper ou l'API Custom
   Search, ou à défaut en lisant la page de résultats dans un navigateur.
2. Écarte tout ce qui n'est pas de la presse — réseaux sociaux, vidéo, wikis,
   forums, places de marché, agrégateurs — via `lib/publishers.js`.
3. Ne garde que les résultats qui parlent de vêtements, via le vocabulaire mode
   de `lib/fashionVocabulary.js`.
4. Dédoublonne sur le titre. Un article trouvé par plusieurs requêtes conserve
   son meilleur rang — sa pertinence est plus large.
5. Récupère photo et résumé : l'API les fournit directement, sinon la page de
   l'éditeur est lue pour ses métadonnées OpenGraph.
6. Extrait les pièces, les maisons et l'occasion depuis le titre et le résumé.
7. Classe, et garde les 5 meilleurs.

La recherche Google est la seule source. Google News RSS, Bing et les flux RSS
des magazines ont été essayés : le premier n'indexe que les éditeurs
enregistrés comme médias et laisse de côté les blogs mode et les articles de
tendance, les autres n'existaient que pour contourner des liens relais que le
navigateur résout désormais.

## Sur le classement

Aucun compteur de partages n'a plus d'API publique — Facebook a fermé la
sienne, X aussi. Le signal d'engagement utilisé est donc **le rang Google
lui-même**, qui intègre déjà l'autorité du site, les liens entrants et le
comportement de clic. Un article bien classé sur plusieurs requêtes différentes
pèse davantage. Le badge « top N Google » sur la carte rend ce critère lisible
plutôt que de le laisser implicite.

S'y ajoutent la récence (fenêtre de 45 jours) et la présence d'une photo, qui
compte lourd : sans image, la carte ne répond pas à la question pour laquelle
le tableau existe.

Enfin, un titre de presse mode reconnu (`PRESS_DOMAINS` dans
`lib/publishers.js`) prend un bonus : à mots-clés égaux, Vogue passe devant un
blog inconnu. Ce n'est pas une liste blanche — un domaine absent de la liste
est conservé, il n'obtient simplement pas le bonus.

### Ce qui est écarté d'office

`lib/publishers.js` élimine par domaine ce qui ne peut pas être un article de
presse : YouTube et la vidéo, Instagram, TikTok, Pinterest, X, Facebook, les
forums (Reddit, Quora), les wikis (Wikipedia, Fandom, IMDb), les places de
marché (Amazon, eBay, Etsy, Vinted, StockX), les agrégateurs (MSN, Flipboard,
Google News) et les banques d'images (Getty, Shutterstock).

Le filtre s'applique dans `fetchArticles.js`, là où toutes les sources
convergent : il vaut donc pour Serper, Custom Search et le navigateur.
`npm run diagnose` affiche le nombre d'écartés et les domaines concernés.

S'y ajoutent les **liens morts** : une requête `HEAD` vérifie que la page
existe encore, et un `404` ou `410` retire l'article. Une carte dont le lien
ne s'ouvre pas est pire que pas de carte — elle paraît exploitable jusqu'au
clic. Un `403` ne compte pas : beaucoup d'éditeurs refusent les robots alors
que la page s'ouvre normalement dans un navigateur.

## Remplir les cinq cartes

Les quatre requêtes sont des variantes d'un même nom, donc Google renvoie
largement les mêmes articles : une quarantaine de résultats bruts retombe à
une douzaine après dédoublonnage. Ajoutés le filtre presse, le filtre mode et
une fenêtre d'un mois, le vivier peut descendre sous les cinq cartes que le
dashboard peut afficher.

La fenêtre s'élargit donc d'elle-même — `month` → `year` → sans limite —
jusqu'à ce qu'il y ait de quoi remplir. Un article un peu plus ancien vaut
mieux qu'une colonne à moitié vide, et la récence continue de peser dans le
classement : les articles frais gardent leur place en tête. Le `recency` de
`config/stars.json` fixe seulement le point de départ.

Aucune recherche supplémentaire n'est lancée quand le vivier est déjà
suffisant. Le log de refresh signale l'élargissement quand il a lieu.

## Lancer en local

```bash
npm install
npm run dev
```

Ouvre `http://localhost:3000` et clique sur **Actualiser**.

`npm run dev` se lance une fois et ne demande plus rien : il surveille la
branche courante, récupère les nouveaux commits, redémarre le serveur, et la
page se recharge d'elle-même.

Autres commandes :

```bash
npm start            # serveur seul, sans surveillance git (production)
npm run fetch:once   # une collecte unique en ligne de commande
```

## Ajouter une star

Éditer `config/stars.json` :

```json
{
  "slug": "nom-slug",
  "name": "Nom Affiché",
  "epithet": "Sous-titre optionnel",
  "articleQueries": ["Nom outfit", "Nom style", "Nom wore"]
}
```

Sans `articleQueries`, les requêtes sont dérivées de `keyword` ou du nom.
`geo` et `hl` sont surchargeables par star (défaut `US` / `en-US`).

## Enrichir la détection

`lib/fashionVocabulary.js` contient trois dictionnaires : `GARMENTS` (pièces,
libellées en français), `BRANDS` (maisons) et `OCCASIONS` (contextes). Ajouter
une entrée suffit pour qu'elle apparaisse dans le tableau « Le look / Marque /
Où ». Une entrée précise peut absorber une générique via `absorbs`, pour que
« pinstripe suit » donne *Costume rayé* seul et non *Costume rayé + Costume*.

## Variables d'environnement

- `SERPER_API_KEY` — recherche Google via [serper.dev](https://serper.dev)
- `GOOGLE_API_KEY`, `GOOGLE_CSE_ID` — recherche via l'API Custom Search
- `GEMINI_API_KEY` / `GROQ_API_KEY` — IA (sinon, tout marche sans)
- `SHOPMY_API_KEY`, `IMPACT_*` — liens d'affiliation
- `PORT` — port HTTP (défaut `3000`)
- `REFRESH_COOLDOWN_MS` — délai minimum entre deux actualisations (défaut
  `30000`)

Tout est optionnel sauf une source de recherche. `.env.example` liste chaque
variable avec la marche à suivre.

## La recherche Google

- `SERPER_API_KEY` — option A, résultats Google contre une seule clé
- `GOOGLE_API_KEY` + `GOOGLE_CSE_ID` — option B, API officielle Custom Search

Trois chemins, essayés dans cet ordre : Serper, puis Custom Search, puis le
navigateur. Le premier configuré l'emporte ; `npm run diagnose` affiche lequel
est actif.

### Serper — le plus court chemin

Serper interroge Google et renvoie ses résultats en JSON. Une seule clé, prise
sur [serper.dev](https://serper.dev) : pas de projet Cloud, pas d'API à activer,
pas de restrictions de clé — c'est-à-dire aucune des trois choses qui font
échouer la mise en place de Custom Search. **2500 recherches offertes** à
l'inscription, ce qui fait plus de 600 collectes.

```bash
SERPER_API_KEY=…   # dans .env
npm run check-key  # vérifie la clé en une requête
```

Déployable exactement comme Custom Search : appel serveur, sans navigateur ni
captcha. Les photos arrivent dans la réponse, une collecte prend quelques
secondes.

### API Custom Search — l'alternative officielle

C'est l'API officielle de Google : du JSON, sans navigateur, sans captcha
possible, **100 requêtes par jour gratuites**. C'est la seule option qui
fonctionne sur un serveur, où une fenêtre de navigateur est impossible et où
l'IP de datacenter attire les vérifications.

Deux valeurs à mettre dans `.env` :

1. **`GOOGLE_CSE_ID`** — crée un moteur sur
   [programmablesearchengine.google.com](https://programmablesearchengine.google.com/controlpanel/create),
   puis dans ses paramètres active **« Rechercher sur l'ensemble du Web »**
   (sans quoi il ne cherchera que sur les sites que tu listes).
2. **Active l'API** — la console Google Cloud est peu lisible là-dessus, mais
   un lien direct y mène :
   [console.cloud.google.com/apis/library/customsearch.googleapis.com](https://console.cloud.google.com/apis/library/customsearch.googleapis.com)
   → bouton **ACTIVER**. Si un projet est demandé, crée-en un depuis le
   sélecteur en haut de page, puis reviens sur ce lien.
3. **`GOOGLE_API_KEY`** — sur
   [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
   → **+ CRÉER DES IDENTIFIANTS** → **Clé API**.

L'ordre compte : une clé créée avant l'activation de l'API existe, mais Google
refuse ses requêtes par un `403`.

Google renvoie plusieurs `403` de libellés voisins mais de causes distinctes —
`npm run check-key` affiche la réponse brute et son code `reason` :

| Ce que dit Google | Ce qu'il faut faire |
|---|---|
| *…are blocked* | La clé a des **restrictions d'API**. Ouvre la clé par son **nom** dans les identifiants, section « Restrictions relatives aux API », choisis « Ne pas restreindre la clé » ou coche Custom Search API. |
| *has not been used… or it is disabled* | L'API n'est **pas activée** sur ce projet. |
| *does not have the access to Custom Search JSON API* | L'activation n'a pas pris, ou la clé et l'API vivent dans **deux projets différents**. Le seul écran qui tranche : [les métriques de l'API](https://console.cloud.google.com/apis/api/customsearch.googleapis.com/metrics) — si elles s'affichent, l'API est bien activée sur le projet sélectionné en haut de page. |

Ce dernier cas peut résister à toutes les corrections de la console. C'est
précisément pour cela que Serper existe dans ce projet : il évite Google Cloud
entièrement.

L'API renvoie la photo de l'article dans sa réponse, ce qui évite d'ouvrir la
page : une collecte prend alors quelques secondes.

Au-delà de 100 requêtes/jour, il faut activer la facturation (5 $ pour 1000).
Avec 4 requêtes par collecte, cela laisse 25 actualisations par jour.

### Recherche par navigateur — repli local

Sans clé configurée, la recherche passe par Playwright, qui lit la page de
résultats. Utile pour essayer sans rien créer, mais **non déployable** : Google
challenge les navigateurs automatisés, et résoudre la vérification demande une
fenêtre visible (`BROWSER_HEADLESS=false`).

```bash
npm install
npx playwright install chromium
```

Le navigateur reste utile même avec l'API : il sert à lire les pages des
éditeurs qui refusent les requêtes ordinaires par un `403`.

## La bande de photos

Sous chaque carte, les photos trouvées **dans** l'article, en bande
horizontale. L'`og:image` de la carte n'est que la photo d'ouverture ; un
article sur le style de quelqu'un en contient plusieurs, et c'est la légende
qui nomme la marque.

`lib/articleLooks.js` lit la page à la recherche des `<figure>` — ce sont
elles qui portent une légende — puis des `<img>` restants pour les éditeurs
qui n'en utilisent pas. Sont écartés les logos, portraits d'auteur, icônes de
partage, bannières et pixels de suivi, ainsi que tout ce qui mesure moins de
200 px. Le `srcset` est résolu vers la plus grande version, et le `data-src`
des images en chargement différé est suivi.

Sous chaque photo, en petit : la marque et la pièce lues dans la légende, via
le même vocabulaire mode que les cartes. À défaut, la légende elle-même.

Cette lecture n'est faite que pour les cinq articles affichés — cinq requêtes
par collecte, pas une par candidat.

### Retrouver la pièce

Le bouton sous chaque photo interroge le modèle sur cette photo précise. Le
prompt lui donne le titre, le résumé, la légende et les marques déjà repérées,
et lui demande un JSON : la pièce, la maison, le modèle, un indice de
confiance, et une alternative nettement moins chère en enseigne accessible.

Il lui est explicitement interdit d'inventer une marque absente de l'article —
c'est `null` et une confiance « faible » plutôt qu'une réponse plausible et
fausse, puisque le modèle ne voit jamais l'image, seulement le texte.

Les deux pièces — l'originale et l'alternative — reçoivent chacune un lien
d'affiliation via `lib/affiliate.js`.

Sans clé IA, le bouton fonctionne quand même : la marque et la pièce sont lues
dans la légende, sans IA, et c'est indiqué dans le panneau. Les requêtes
d'achat partent alors en anglais (`garmentTerms`) et non avec le libellé
français affiché, puisque les marchands visés sont américains.

### Les deux fournisseurs IA

`lib/aiProvider.js` essaie **Gemini** puis **Groq**, et bascule sur le second
quand le premier échoue — même principe que Serper face à Custom Search, et
pour la même raison : le quota gratuit de Gemini dépend du projet Cloud lié à
la clé, et un projet sans allocation renvoie un `429` que rien ne débloque de
l'extérieur.

- `GEMINI_API_KEY` — [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- `GROQ_API_KEY` — [console.groq.com/keys](https://console.groq.com/keys),
  sans projet Cloud ni facturation

`npm run check-ai` interroge chaque fournisseur configuré et affiche la
réponse complète. Sur un `429` Gemini, le message distingue les trois cas, que
Google formule presque identiquement :

| Ce qui se passe | Ce que ça veut dire |
|---|---|
| Limite **par minute** | Passagère — le code attend le délai indiqué et réessaie tout seul. |
| Quota **du jour** épuisé | Se réinitialise sous 24 h. Groq prend le relais entre-temps. |
| **Aucun quota** | Le projet lié à la clé n'a pas d'allocation gratuite pour ce modèle. Attendre n'y change rien : il faut une clé d'un autre projet, un autre `GEMINI_MODEL`, ou Groq. |

## Créer un article depuis une carte

Chaque carte porte un bouton **Créer un article**. Il produit un brouillon
markdown : description du look, pourquoi il fonctionne, section shopping avec
liens d'affiliation, et trois accroches TikTok. Le brouillon s'ouvre dans un
panneau, prêt à copier.

### Rédaction

Copie `.env.example` en `.env` et renseigne `GEMINI_API_KEY` — la clé est
gratuite sur [AI Studio](https://aistudio.google.com/apikey), sans carte
bancaire. Sans clé, le brouillon reste produit mais non rédigé : un plan
pré-rempli avec toutes les informations connues, à compléter à la main.

### Affiliation

`ShopMy` et `impact.com` sont interrogés pour chaque pièce détectée, et le
premier qui renvoie un lien l'emporte — la couverture d'un vêtement donné
n'étant pas prévisible à l'avance. Renseigne l'une, l'autre, ou les deux :

- `SHOPMY_API_KEY`
- `IMPACT_ACCOUNT_SID`, `IMPACT_AUTH_TOKEN`, `IMPACT_PROGRAM_ID`

Sans identifiants, les liens pointent vers une recherche produit classique et
sont explicitement marqués « lien non affilié » dans le brouillon, pour qu'un
lien non rémunérateur ne passe jamais pour un lien affilié.

Les requêtes d'achat combinent marque et pièce (« Bottega Veneta cravate en
cuir ») plutôt que la marque seule, qui ne mène qu'à une page d'accueil.
