# Star Style Tracker

Dashboard en colonnes de la couverture presse des tenues de célébrités, une
colonne par star. Pour chaque article : la photo, le look, la marque,
l'occasion et un résumé — de quoi décider en un coup d'œil s'il y a matière à
en faire un contenu.

## Ce qu'il fait

Au clic sur **Actualiser**, pour chaque star de `config/stars.json` :

1. Tape chaque requête de `articleQueries` dans **le moteur de recherche
   Google**, via un vrai navigateur, avec le filtre de récence de Google
   (`recency`, « month » par défaut).
2. Ne garde que les résultats qui parlent de vêtements, via le vocabulaire mode
   de `lib/fashionVocabulary.js`, et écarte les agrégateurs, YouTube et les
   réseaux sociaux.
3. Dédoublonne sur le titre. Un article trouvé par plusieurs requêtes conserve
   son meilleur rang — sa pertinence est plus large.
4. Ouvre les mieux classés dans le navigateur et lit leurs métadonnées
   OpenGraph : photo de partage et résumé rédactionnel.
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

- `PORT` — port HTTP (défaut `3000`)
- `REFRESH_COOLDOWN_MS` — délai minimum entre deux actualisations (défaut
  `30000`)

## Le navigateur est requis

La recherche Google n'a pas d'API gratuite, et sa page de résultats est rendue
en JavaScript : seul un vrai navigateur peut la lire. Il sert aussi à ouvrir
les articles pour y prendre la photo, ce qui règle au passage les `403` que
plusieurs éditeurs opposent aux clients non-navigateurs.

Playwright est déclaré en dépendance optionnelle. Il reste à installer Chromium
une fois :

```bash
npx playwright install chromium
```

Si Chrome est déjà sur la machine, renseigne `CHROMIUM_PATH` dans `.env` pour
éviter le téléchargement. Sans navigateur disponible, rien ne casse : les
articles Google s'affichent sans photo, et le terminal le rappelle au début de
chaque collecte.

Le navigateur n'est plus optionnel : la recherche Google passe par lui. Sans
Playwright, la collecte s'arrête et le dashboard le dit explicitement.

Compter environ 30 à 60 secondes par collecte — quatre recherches, puis une
ouverture de page par article retenu.

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
