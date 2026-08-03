# Star Style Tracker — dashboard autonome

Serveur Node.js qui interroge lui-même Google Trends toutes les heures (aucune
requête ne passe par Claude) et affiche les résultats sur un dashboard en
colonnes, une colonne par star.

## Ce qu'il fait

- Un job cron interne (`node-cron`, `0 * * * *` par défaut) tourne dans le
  process du serveur et récupère, pour chaque star listée dans
  `config/stars.json` :
  - la courbe d'intérêt de recherche des 7 derniers jours (`interestOverTime`)
  - les recherches associées les plus fréquentes et celles en forte hausse
    (`relatedQueries`)
- Les résultats sont stockés dans `data/latest.json` (dernier snapshot) et
  `data/history/<slug>.jsonl` (historique append-only, un point par cycle).
- La page `/` lit ces données via `/api/trends` et se rafraîchit toute seule.

## Limite importante — pas d'API officielle

Google n'expose aucune API publique documentée pour Google Trends (l'ancienne
"Trends API" a été fermée il y a des années). Ce projet utilise la librairie
non-officielle [`google-trends-api`](https://www.npmjs.com/package/google-trends-api),
qui reproduit les mêmes appels que fait le site trends.google.com dans un
navigateur. Conséquences concrètes :

- Pas de clé API à demander : ça fonctionne "tel quel", ou pas du tout.
- Google peut bloquer/limiter ces requêtes (403/429) s'il détecte un usage
  automatisé trop fréquent. Un cycle par heure et par star reste raisonnable,
  mais rien n'est garanti dans la durée — le code logge les échecs
  (`entry.errors`) sans planter le serveur, et réessaie au cycle suivant.
- Cette technique n'est pas couverte par les conditions d'utilisation
  officielles de Google (c'est du scraping des mêmes endpoints que le site
  utilise). Usage perso/à petit volume, à tes risques.
- Je n'ai pas pu tester la requête Trends en conditions réelles depuis
  l'environnement où ce code a été écrit (accès réseau sortant bloqué en
  dehors d'une liste blanche). À tester en local ou après déploiement.

## Lancer en local

```bash
cd trends-dashboard
npm install
npm start          # démarre le serveur sur http://localhost:3000
# ou, pour tester une seule collecte sans lancer le serveur :
npm run fetch:once
```

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

Redémarrer le serveur — la nouvelle colonne apparaît et sera peuplée au
prochain cycle (ou immédiatement via `npm run fetch:once`).

## Déployer pour un vrai fonctionnement 24/7

Ce serveur doit tourner en continu pour que "toutes les heures" ait un sens.
Options simples :

- **Railway / Render / Fly.io** : déploiement direct depuis ce dossier
  (`npm install && npm start`), plan gratuit suffisant pour ce volume.
- **VPS + pm2** : `pm2 start server.js --name trends-dashboard`.
- **Docker** : construire une image Node standard exposant le `PORT`
  (variable d'env, défaut `3000`).

Variables d'environnement utiles :

- `PORT` — port HTTP (défaut `3000`)
- `TRENDS_CRON` — expression cron pour la fréquence (défaut `0 * * * *`,
  toutes les heures pile)
