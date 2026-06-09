# VintBot – Agent Négociateur pour Vendeurs Vinted

## Ce que c'est

Extension navigateur (Chrome + Firefox) couplée à un backend SaaS.
L'agent IA lit les conversations Vinted du vendeur, analyse les offres des acheteurs et génère des réponses de négociation optimisées — que le vendeur peut envoyer en un clic (ou automatiquement).

---

## Architecture

```
extension/          Chrome/Firefox Manifest V3
  manifest.json     Permissions, host_permissions Vinted
  content.js        Injecté dans Vinted — lit les messages, affiche l'UI
  content.css       Styles de l'overlay et du bouton flottant
  background.js     Service worker — appelle le backend, gère les settings
  popup/            Interface de configuration de l'extension

backend/            Node.js + Express + PostgreSQL
  src/index.js      Serveur Express
  src/routes/
    negotiate.js    POST /api/negotiate  — génère la réponse via Claude
    license.js      POST /api/license/validate, POST /create (admin)
    stats.js        GET /api/stats  — dashboard du vendeur
  src/services/
    claude.js       Appel au modèle claude-haiku-4-5 (rapide + pas cher)
    db.js           Pool PostgreSQL
  src/middleware/
    auth.js         Validation de la clé de licence + quota
  db/schema.sql     Tables licenses + negotiations
```

---

## Flux utilisateur

1. Vendeur achète une licence sur ton site → reçoit une clé `VINTB-XXXX-XXXX-XXXX`
2. Installe l'extension dans Chrome
3. Entre sa clé dans le popup + configure son prix minimum et son style
4. Ouvre une conversation Vinted avec un acheteur
5. Clique sur le bouton 🤖 VintBot (ou l'agent répond automatiquement)
6. L'overlay affiche la réponse suggérée avec l'analyse de l'offre
7. Envoie en un clic — ou modifie avant d'envoyer

---

## Configuration vendeur

| Paramètre | Description |
|-----------|-------------|
| Prix minimum | % du prix affiché en dessous duquel refuser (ex: 80%) |
| Style | Amical / Ferme / Décontracté / Formel |
| Langue | FR / EN / ES / DE / NL |
| Envoi auto | Envoie sans confirmation (mode expert) |
| Agent actif | Active/désactive globalement |

---

## Monétisation

| Plan | Prix suggéré | Requêtes/mois |
|------|-------------|----------------|
| Starter | 9 €/mois | 200 |
| Pro | 19 €/mois | 1 000 |
| Agency | 49 €/mois | 5 000 |

Gestion des licences via `POST /api/license/create` (admin).

---

## Déploiement backend

### Render / Railway / Fly.io (recommandé)

```bash
# Variables d'environnement à configurer
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=sk-ant-...
ADMIN_SECRET=ton-secret-admin
PORT=3000
NODE_ENV=production
```

```bash
cd backend
npm install
node db/migrate.js   # crée les tables
npm start
```

### Créer une première licence

```bash
curl -X POST https://ton-api.com/api/license/create \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: ton-secret-admin" \
  -d '{"email": "client@example.com", "plan": "pro"}'
```

---

## Installer l'extension en local (test)

1. Va dans `chrome://extensions`
2. Active "Mode développeur"
3. "Charger l'extension non empaquetée" → sélectionne le dossier `extension/`
4. Configure ta clé dans le popup

## Publier sur le Chrome Web Store

1. Zip le dossier `extension/`
2. Crée un compte Google Developer (5 USD one-time)
3. Soumets le zip + screenshots + description

---

## Sécurité

- Toutes les requêtes backend validées par la clé de licence
- Quota mensuel par plan pour contrôler les coûts IA
- Rate limiting global (60 req/min)
- L'extension ne stocke que les settings dans `chrome.storage.sync` (pas de données Vinted côté backend sauf les métadonnées de négociation)
- Le prix minimum n'est JAMAIS révélé à l'acheteur par le prompt
