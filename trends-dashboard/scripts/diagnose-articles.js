// Walks the collection for one star and reports, article by article, whether
// its relay link resolved and whether a photo came back — so a missing image
// can be traced to the browser, the resolution, or the publisher.
//
//   npm run diagnose
//   npm run diagnose -- "Timothee Chalamet"

const { searchNews, enrichArticle, takeBrowserError } = require('../lib/newsClient');
const { searchWeb } = require('../lib/googleSearch');
const { isAvailable, closeBrowser } = require('../lib/browserResolver');
const { isFashionQuery } = require('../lib/fashionVocabulary');
const { loadStars } = require('../lib/store');

const name = process.argv[2] || loadStars()[0]?.name || 'Jacob Elordi';

function truncate(value, length = 70) {
  if (!value) return '—';
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

(async () => {
  console.log(`\nDiagnostic articles — « ${name} »\n`);

  console.log(
    isAvailable()
      ? '✓ Playwright disponible — les liens Google peuvent être résolus.'
      : "✗ Playwright absent — aucun lien Google ne pourra donner de photo.\n" +
          '  Installe-le : npm install && npx playwright install chromium'
  );

  const query = `${name} style`;
  let items = [];

  if (isAvailable()) {
    console.log(`\n— Recherche Google (web), « ${query} », dernier mois`);
    try {
      const web = (await searchWeb(query, { recency: 'month' })) || [];
      console.log(`  ${web.length} résultats`);
      for (const item of web.slice(0, 5)) {
        console.log(`   · ${truncate(item.title, 58)}`);
        console.log(`     ${truncate(item.link, 62)}  [${item.published || 'date inconnue'}]`);
      }
      items = items.concat(web);
    } catch (err) {
      console.log(`  échec — ${err.message}`);
    }
  }

  console.log('\n— Google News (RSS)');
  try {
    const news = await searchNews(query, {});
    console.log(`  ${news.length} résultats`);
    items = items.concat(news);
  } catch (err) {
    console.log(`  échec — ${err.message}`);
  }

  const relevant = items.filter((item) => isFashionQuery(`${item.title} ${item.snippet || ''}`));
  console.log(`\n${items.length} résultats au total, dont ${relevant.length} sur la mode.\n`);
  if (!relevant.length) return;

  let withPhoto = 0;
  for (const item of relevant.slice(0, 4)) {
    console.log(`« ${truncate(item.title)} »`);
    const started = Date.now();
    const enriched = await enrichArticle(item);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    const resolved = !/news\.google\.com/.test(enriched.url);
    console.log(`  résolu  : ${resolved ? '✓ ' + truncate(enriched.url, 58) : '✗ toujours sur Google'}`);
    console.log(`  photo   : ${enriched.image ? '✓ ' + truncate(enriched.image, 52) : '✗ aucune'}`);
    console.log(`  durée   : ${seconds}s\n`);
    if (enriched.image) withPhoto += 1;
  }

  const browserError = takeBrowserError();
  if (browserError) console.log(`Erreur navigateur : ${browserError}\n`);

  console.log(`→ ${withPhoto} article(s) illustré(s) sur ${Math.min(relevant.length, 4)} testé(s).`);
  if (!withPhoto && isAvailable()) {
    console.log("  Chromium est-il installé ? « npx playwright install chromium »");
  }
  console.log('');

  await closeBrowser();
})();
