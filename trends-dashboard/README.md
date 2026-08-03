# Outfit Trend Tracker

Dashboard en colonnes suivant les tendances mode des célébrités, une colonne
par star. Le serveur interroge Google Trends à la demande, quand on clique sur
**Actualiser** — pas de cron, pas d'appel automatique en arrière-plan.

## Ce qu'il fait

- Le bouton "Actualiser" appelle `POST /api/refresh`, qui récupère pour chaque
  star listée dans `config/stars.json` :
  - la courbe d'intérêt de recherche des 7 derniers jours (`interestOverTime`)
  - les recherches associées les plus fréquentes et celles en forte hausse
    (`relatedQueries`)
- Les résultats sont stockés dans `data/latest.json` (dernier snapshot) et
  `data/history/<slug>.jsonl` (historique append-only, un point par clic).
- Un garde-fou empêche de relancer une actualisation moins de 30s après la
  précédente (`REFRESH_COOLDOWN_MS`), pour limiter le risque de blocage.

## Limite importante — pas d'API officielle

Google n'expose aucune API publique documentée pour Google Trends (l'ancienne
"Trends API" a été fermée il y a des années). Ce projet parle directement aux
endpoints internes `trends.google.com/trends/api/*` que le site utilise
lui-même (`lib/trendsClient.js`), avec des en-têtes de navigateur réalistes.
Conséquences concrètes :

- Pas de clé API à demander : ça fonctionne "tel quel", ou pas du tout.
- Google peut refuser (`403`) ou limiter (`429`) ces requêtes, surtout depuis
  une IP de datacenter. Le code n'échoue jamais silencieusement : chaque échec
  est stocké dans `entry.errors` et affiché dans le dashboard.
- Cette technique n'est pas couverte par les conditions d'utilisation
  officielles de Google. Usage perso, à petit volume, à tes risques.

## Lancer en local

```bash
npm install
npm run dev
```

Ouvre `http://localhost:3000` et clique sur **Actualiser**.

`npm run dev` se lance une fois et ne demande plus rien : il surveille la
branche courante, récupère les nouveaux commits dès qu'ils arrivent, redémarre
le serveur, et la page se recharge d'elle-même. Une seule fenêtre de terminal à
laisser ouverte, aucun `git pull` à taper.

Si des fichiers sont modifiés en local, la récupération automatique est mise en
pause plutôt que d'écraser le travail en cours — le message le dit dans le
terminal.

Autres commandes :

```bash
npm start            # serveur seul, sans surveillance git (utilisé en production)
npm run fetch:once   # une collecte unique, écrit dans data/
npm run diagnose     # ce que Google renvoie vraiment, étape par étape
```

### Pourquoi le local marche souvent mieux qu'un hébergeur

Google traite très différemment une IP résidentielle (ta box) et une IP de
datacenter (Render, Railway, Fly.io…). Les IPs d'hébergeurs sont connues et
agressivement limitées : c'est la cause typique des `403` et `429`. Si la
collecte échoue en ligne mais fonctionne sur ta machine, le code n'est pas en
cause — c'est l'IP d'origine.

## Diagnostiquer un échec

```bash
npm run diagnose
```

ou, serveur lancé, ouvrir `http://localhost:3000/api/diagnostics` (également
accessible via le lien « Voir le diagnostic brut » sous le bouton Actualiser).

| Statut | Signification |
|---|---|
| `200` + JSON | tout va bien |
| `400` | requête malformée — bug de code, pas un blocage |
| `403` | Google refuse cette IP (typiquement une IP de datacenter) |
| `429` | débit limité — attendre avant de réessayer |
| `200` + HTML | page de consentement ou de blocage anti-bot |

## Ajouter une star

Éditer `config/stars.json` :

```json
{
  "slug": "nom-slug",
  "name": "Nom Affiché",
  "keyword": "Terme recherché sur Google Trends",
  "epithet": "Sous-titre optionnel"
}
```

Redémarrer le serveur — la nouvelle colonne apparaît, vide jusqu'au prochain
clic sur Actualiser.

## Déployer sur Render

`render.yaml` décrit le service. Depuis le dashboard Render : *New* →
*Blueprint* → sélectionner ce dépôt. Render détecte le fichier, build et
déploie automatiquement à chaque commit sur la branche par défaut.

Le tier gratuit met le service en veille après 15 min d'inactivité (premier
chargement plus lent après une pause).

À savoir : depuis Render, Google renvoie fréquemment `403`/`429` — voir la
section sur les IPs de datacenter ci-dessus.

## Variables d'environnement

- `PORT` — port HTTP (défaut `3000`)
- `REFRESH_COOLDOWN_MS` — délai minimum entre deux actualisations (défaut
  `30000`, soit 30s)

## Structure

```
server.js            serveur Express + endpoints API
lib/trendsClient.js  client HTTP bas niveau vers les endpoints Google Trends
lib/fetchTrends.js   orchestration d'une collecte pour une star
lib/runFetchCycle.js boucle sur toutes les stars, persiste, logue
lib/store.js         lecture/écriture de data/
lib/diagnose.js      rapport brut par étape, pour déboguer un échec
public/              dashboard (HTML/CSS/JS, sans dépendance)
config/stars.json    liste des stars suivies
```
