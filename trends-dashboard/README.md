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
2. Ne garde que les résultats qui parlent de vêtements, via le vocabulaire mode
   de `lib/fashionVocabulary.js`, et écarte les agrégateurs, YouTube et les
   réseaux sociaux.
3. Dédoublonne sur le titre. Un article trouvé par plusieurs requêtes conserve
   son meilleur rang — sa pertinence est plus large.
4. Récupère photo et résumé : l'API les fournit directement, sinon la page de
   l'éditeur est lue pour ses métadonnées OpenGraph.
5. Extrait les pièces, les maisons et l'occasion depuis le titre et le résumé.
6. Classe, et garde les 5 meilleurs.

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
- `GEMINI_API_KEY` — rédaction des brouillons (sinon, gabarit sans IA)
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
