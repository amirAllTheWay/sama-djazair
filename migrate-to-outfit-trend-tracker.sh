#!/usr/bin/env bash
#
# Migre trends-dashboard/ de sama-djazair vers un dépôt dédié
# amirAllTheWay/outfitTrendTracker, avec le projet à la racine.
#
# Prérequis : le dépôt outfitTrendTracker doit exister sur GitHub,
# vide (sans README ni .gitignore auto-générés).
#
# Usage :  bash migrate-to-outfit-trend-tracker.sh
#
set -euo pipefail

NEW_REPO="git@github.com:amirAllTheWay/outfitTrendTracker.git"
# Variante HTTPS si tu n'utilises pas de clé SSH :
# NEW_REPO="https://github.com/amirAllTheWay/outfitTrendTracker.git"

WORKDIR="$(mktemp -d)"
echo "→ Dossier de travail : $WORKDIR"

echo "→ Clone de sama-djazair…"
git clone --quiet https://github.com/amirAllTheWay/sama-djazair.git "$WORKDIR/source"

echo "→ Extraction de trends-dashboard/ vers la racine…"
mkdir -p "$WORKDIR/target"
cp -R "$WORKDIR/source/trends-dashboard/." "$WORKDIR/target/"
cp "$WORKDIR/source/render.yaml" "$WORKDIR/target/render.yaml"

cd "$WORKDIR/target"

echo "→ Adaptation de render.yaml (plus de sous-dossier)…"
cat > render.yaml <<'YAML'
services:
  - type: web
    name: outfit-trend-tracker
    runtime: node
    plan: free
    buildCommand: npm install
    startCommand: npm start
    autoDeployTrigger: commit
    envVars:
      - key: REFRESH_COOLDOWN_MS
        value: "30000"
YAML

echo "→ Renommage du projet dans package.json…"
sed -i.bak 's/"name": "trends-dashboard"/"name": "outfit-trend-tracker"/' package.json
rm -f package.json.bak

echo "→ Nettoyage des artefacts locaux…"
rm -rf node_modules data/latest.json data/history/*.jsonl

echo "→ Initialisation du nouveau dépôt…"
git init --quiet
git add .
git commit --quiet -m "Import outfit trend tracker from sama-djazair

Project moved to its own repository, restructured with the app at the
repo root instead of nested under trends-dashboard/."

git branch -M main
git remote add origin "$NEW_REPO"

echo "→ Push vers outfitTrendTracker…"
git push -u origin main

echo
echo "✓ Terminé. Le code est sur https://github.com/amirAllTheWay/outfitTrendTracker"
echo
echo "Pour lancer en local :"
echo "  cd $WORKDIR/target"
echo "  npm install && npm run diagnose"
