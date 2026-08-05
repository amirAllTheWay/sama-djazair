// Runs the exact same pipeline as a refresh, printing what each stage did, so
// a weak result set can be traced to the search, the fashion filter, or the
// page read.
//
//   npm run diagnose
//   npm run diagnose -- "Timothee Chalamet"

const { searchWeb: searchViaApi, isConfigured: apiConfigured } = require('../lib/googleCse');
const { searchWeb: searchViaBrowser, parseRelativeDate } = require('../lib/googleSearch');
const { enrichArticle, takeBrowserError } = require('../lib/articlePage');
const { isAvailable, closeBrowser } = require('../lib/browserResolver');
const { isFashionQuery } = require('../lib/fashionVocabulary');
const { defaultArticleQueries } = require('../lib/fetchArticles');
const { loadStars } = require('../lib/store');

const star = loadStars()[0] || {};
const name = process.argv[2] || star.name || 'Jacob Elordi';
const queries = process.argv[2] ? defaultArticleQueries(name) : star.articleQueries || defaultArticleQueries(name);
const recency = star.recency || 'month';

function truncate(value, length = 66) {
  if (!value) return '—';
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

(async () => {
  console.log(`\nDiagnostic — « ${name} », fenêtre : ${recency}\n`);

  const useApi = apiConfigured();
  if (useApi) {
    console.log("Source : API Google Custom Search (déployable, sans navigateur).\n");
  } else if (isAvailable()) {
    console.log('Source : recherche par navigateur (repli local).');
    console.log('  Pour un déploiement, renseigne GOOGLE_API_KEY et GOOGLE_CSE_ID — voir le README.\n');
  } else {
    console.log('✗ Aucune source configurée.');
    console.log('  Renseigne GOOGLE_API_KEY et GOOGLE_CSE_ID dans .env (voir le README),');
    console.log('  ou installe Playwright : npm install && npx playwright install chromium\n');
    return;
  }

  const searchWeb = useApi ? searchViaApi : searchViaBrowser;

  const collected = new Map();
  let totalResults = 0;

  for (const query of queries) {
    process.stdout.write(`« ${query} » … `);
    try {
      const results = (await searchWeb(query, { recency })) || [];
      totalResults += results.length;

      let kept = 0;
      for (const item of results) {
        if (!isFashionQuery(`${item.title} ${item.snippet || ''}`)) continue;
        kept += 1;
        item.publishedAt = item.publishedAt ?? parseRelativeDate(item.published);
        const key = item.title.toLowerCase().slice(0, 60);
        const existing = collected.get(key);
        if (existing) {
          existing.bestRank = Math.min(existing.bestRank, item.rank);
          existing.queries += 1;
        } else {
          collected.set(key, { ...item, bestRank: item.rank, queries: 1 });
        }
      }
      console.log(`${results.length} résultats, ${kept} sur la mode`);
    } catch (err) {
      console.log(`échec — ${err.message}`);
    }
  }

  const candidates = [...collected.values()].sort((a, b) => a.bestRank - b.bestRank);
  console.log(
    `\n${totalResults} résultats au total, ${candidates.length} retenus après filtrage et dédoublonnage.\n`
  );
  if (!candidates.length) {
    console.log('Aucun article ne passe le filtre mode — élargis `articleQueries` ou `recency`.\n');
    return;
  }

  console.log('Lecture des pages, du mieux classé au moins bien :\n');
  let withPhoto = 0;

  for (const item of candidates.slice(0, 5)) {
    const started = Date.now();
    const enriched = await enrichArticle(item);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (enriched.image) withPhoto += 1;

    console.log(`[rang ${item.bestRank}] ${truncate(item.title)}`);
    console.log(`   ${truncate(enriched.domain || enriched.url, 58)}`);
    const when = item.publishedAt
      ? new Date(item.publishedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
      : item.published || 'date inconnue';
    console.log(`   publié  : ${when}`);
    console.log(
      `   photo   : ${enriched.image ? (item.feedImage ? '✓ (fournie par l\'API)' : '✓ (page lue)') : '✗ aucune'}   (${seconds}s)`
    );
    if (item.queries > 1) console.log(`   trouvé par ${item.queries} requêtes différentes`);
    console.log('');
  }

  const browserError = takeBrowserError();
  if (browserError) console.log(`Erreur navigateur : ${browserError}\n`);

  console.log(`→ ${withPhoto} article(s) illustré(s) sur ${Math.min(candidates.length, 5)}.\n`);
  await closeBrowser();
})();
