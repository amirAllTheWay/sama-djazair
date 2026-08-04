# Star Style Tracker

Dashboard en colonnes de la couverture presse des tenues de célébrités, une
colonne par star. Pour chaque article : la photo, le look, la marque,
l'occasion et un résumé — de quoi décider en un coup d'œil s'il y a matière à
en faire un contenu.

## Ce qu'il fait

Au clic sur **Actualiser**, pour chaque star de `config/stars.json` :

1. Interroge Google News RSS sur plusieurs requêtes orientées tenue
   (`articleQueries`, par défaut « outfit », « style », « wore »,
   « red carpet »).
2. Ne garde que les résultats qui parlent de vêtements, via le vocabulaire mode
   de `lib/fashionVocabulary.js`.
3. Dédoublonne sur le titre : un sujet syndiqué garde son titre, pas son URL.
   Le nombre de médias l'ayant repris est conservé.
4. Suit chaque lien jusqu'à l'éditeur pour en lire les métadonnées OpenGraph —
   photo de partage et résumé rédactionnel.
5. Extrait les pièces, les maisons et l'occasion depuis le titre et le résumé.
6. Classe, et garde les 3 meilleurs.

## Sur le classement

Les compteurs de partages n'ont plus d'API publique (Facebook a fermé la
sienne, X aussi). « Les plus partagés » est donc approximé par la **reprise
médiatique** — combien de médias différents ont couvert le même sujet —
pondérée par la récence. La carte affiche « repris ×N » pour que l'indicateur
soit lisible plutôt que sous-entendu.

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
