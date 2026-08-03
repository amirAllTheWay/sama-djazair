# Star Style Tracker — dashboard autonome

Serveur Node.js qui interroge lui-même Google Trends (aucune requête ne passe
par Claude) et affiche les résultats sur un dashboard en colonnes, une colonne
par star. La collecte se déclenche à la demande, via le bouton **Actualiser**
sur la page — pas de cron, pas d'appel automatique en arrière-plan.

## Ce qu'il fait

- Le bouton "Actualiser" du dashboard appelle `POST /api/refresh`, qui
  récupère pour chaque star listée dans `config/stars.json` :
  - la courbe d'intérêt de recherche des 7 derniers jours (`interestOverTime`)
  - les recherches associées les plus fréquentes et celles en forte hausse
    (`relatedQueries`)
- Les résultats sont stockés dans `data/latest.json` (dernier snapshot) et
  `data/history/<slug>.jsonl` (historique append-only, un point par clic).
- Un garde-fou anti-spam empêche de relancer une actualisation moins de 30s
  après la précédente (`REFRESH_COOLDOWN_MS`), pour limiter le risque de se
  faire bloquer par Google.

## Limite importante — pas d'API officielle

Google n'expose aucune API publique documentée pour Google Trends (l'ancienne
"Trends API" a été fermée il y a des années). Ce projet utilise la librairie
non-officielle [`google-trends-api`](https://www.npmjs.com/package/google-trends-api),
qui reproduit les mêmes appels que fait le site trends.google.com dans un
navigateur. Conséquences concrètes :

- Pas de clé API à demander : ça fonctionne "tel quel", ou pas du tout.
- Google peut bloquer/limiter ces requêtes (403/429) s'il détecte un usage
  automatisé. Un clic occasionnel reste raisonnable, mais rien n'est garanti
  dans la durée — le code logge les échecs (`entry.errors`) sans planter le
  serveur, et les affiche dans le dashboard au lieu de rester silencieux.
- Cette technique n'est pas couverte par les conditions d'utilisation
  officielles de Google (c'est du scraping des mêmes endpoints que le site
  utilise). Usage perso/à petit volume, à tes risques.
- Je n'ai pas pu tester la requête Trends en conditions réelles depuis
  l'environnement où ce code a été écrit (accès réseau sortant bloqué en
  dehors d'une liste blanche). À tester en local sur ta machine.

## Lancer en local

```bash
cd trends-dashboard
npm install
npm start          # démarre le serveur sur http://localhost:3000
# ou, pour tester une seule collecte en ligne de commande, sans passer par le bouton :
npm run fetch:once
```

Ouvre `http://localhost:3000` et clique sur **Actualiser**.

### Pourquoi le local marche souvent mieux qu'un hébergeur

Google traite très différemment une IP résidentielle (ta box) et une IP de
datacenter (Render, Railway, Fly.io…). Les IPs d'hébergeurs sont connues et
agressivement limitées : c'est la cause typique des `403` (requête refusée) et
`429` (débit limité). Si la collecte échoue en ligne mais fonctionne sur ta
machine, le code n'est pas en cause — c'est l'IP d'origine.

## Diagnostiquer un échec

Deux façons de voir ce que Google renvoie réellement, sans deviner :

```bash
npm run diagnose   # affiche, étape par étape, statut HTTP + début du corps de réponse
```

ou, serveur lancé, ouvrir `http://localhost:3000/api/diagnostics` (également
accessible via le lien « Voir le diagnostic brut » sous le bouton Actualiser).

Lecture des statuts :

| Statut | Signification |
|---|---|
| `200` + JSON | tout va bien |
| `400` | requête malformée — bug de code, pas un blocage |
| `403` | Google refuse cette IP (typiquement une IP de datacenter) |
| `429` | débit limité — attendre avant de réessayer |
| `200` + HTML | page de consentement ou de blocage anti-bot |

## Déployer en un clic sur Render

Un fichier `render.yaml` à la racine du repo décrit le service (build +
démarrage depuis `trends-dashboard/`). Pour obtenir une URL publique sans
taper de commande :

1. Va sur `https://render.com/deploy?repo=https://github.com/amirAllTheWay/sama-djazair`
2. Connecte ton compte GitHub à Render (gratuit, pas de carte requise)
3. Render détecte `render.yaml`, build et déploie automatiquement
4. Récupère l'URL fournie par Render (`https://star-style-tracker-xxxx.onrender.com`)

Le tier gratuit de Render met le service en veille après 15 min d'inactivité
(premier chargement un peu plus lent après une pause) — suffisant pour un
usage perso occasionnel.

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

## Variables d'environnement

- `PORT` — port HTTP (défaut `3000`)
- `REFRESH_COOLDOWN_MS` — délai minimum entre deux actualisations (défaut
  `30000`, soit 30s)
