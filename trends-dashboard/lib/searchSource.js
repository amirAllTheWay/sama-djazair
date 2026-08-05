// Picks which search backend to use. Three exist because each fails in a
// different way, and having a second one configured is what keeps a console
// misconfiguration from stopping the project.

const serper = require('./serper');
const googleCse = require('./googleCse');
const browserSearch = require('./googleSearch');
const { isAvailable: browserAvailable } = require('./browserResolver');

const SOURCES = [
  {
    id: 'serper',
    label: 'Serper (résultats Google, une seule clé)',
    deployable: true,
    isConfigured: serper.isConfigured,
    searchWeb: serper.searchWeb,
  },
  {
    id: 'cse',
    label: 'API Google Custom Search',
    deployable: true,
    isConfigured: googleCse.isConfigured,
    searchWeb: googleCse.searchWeb,
  },
  {
    id: 'browser',
    // Not deployable: a server has no window to solve a challenge in, and its
    // IP attracts far more of them than a laptop does.
    label: 'Recherche par navigateur (local uniquement)',
    deployable: false,
    isConfigured: browserAvailable,
    searchWeb: browserSearch.searchWeb,
  },
];

function activeSource() {
  return SOURCES.find((source) => source.isConfigured()) || null;
}

function describeSetup() {
  return [
    'Aucune source de recherche configurée. Au choix, dans .env :',
    '  · SERPER_API_KEY — une clé sur serper.dev, 2500 recherches offertes,',
    '    aucun projet Cloud à configurer. Le plus rapide.',
    '  · GOOGLE_API_KEY + GOOGLE_CSE_ID — API Google Custom Search,',
    '    100 recherches/jour gratuites (voir le README pour les trois étapes).',
    '  · ou installe Playwright pour la recherche par navigateur, en local :',
    '    npm install && npx playwright install chromium',
  ].join('\n');
}

module.exports = { activeSource, describeSetup, SOURCES };
