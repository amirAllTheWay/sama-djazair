// Runs the exact same pipeline as a refresh, printing what each stage did, so
// a weak result set can be traced to the search, the fashion filter, or the
// page read.
//
//   npm run diagnose
//   npm run diagnose -- "Timothee Chalamet"

const { parseRelativeDate } = require('../lib/googleSearch');
const { activeSource, describeSetup } = require('../lib/searchSource');
const { enrichArticle, takeBrowserError } = require('../lib/articlePage');
const { closeBrowser } = require('../lib/browserResolver');
const { isFashionQuery } = require('../lib/fashionVocabulary');
const { looksFor } = require('../lib/articleLooks');
const { isExcluded, isKnownPress } = require('../lib/publishers');
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

  const source = activeSource();
  if (!source) {
    console.log(`${describeSetup()}\n`);
    return;
  }
  const caveat = source.deployable ? '' : ' — non déployable en ligne';
  console.log(`Source : ${source.label}${caveat}\n`);
  const searchWeb = source.searchWeb;

  const collected = new Map();
  let totalResults = 0;
  let totalExcluded = 0;
  const excludedHosts = new Map();

  for (const query of queries) {
    process.stdout.write(`« ${query} » … `);
    try {
      const results = (await searchWeb(query, { recency })) || [];
      totalResults += results.length;

      let kept = 0;
      let dropped = 0;
      for (const item of results) {
        if (isExcluded(item.link)) {
          dropped += 1;
          totalExcluded += 1;
          const host = (item.link.match(/\/\/([^/]+)/) || [, item.link])[1];
          excludedHosts.set(host, (excludedHosts.get(host) || 0) + 1);
          continue;
        }
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
      console.log(
        `${results.length} résultats, ${dropped} hors presse écarté(s), ${kept} sur la mode`
      );
    } catch (err) {
      console.log(`échec — ${err.message}`);
    }
  }

  const candidates = [...collected.values()].sort((a, b) => a.bestRank - b.bestRank);
  console.log(
    `\n${totalResults} résultats au total, ${candidates.length} retenus après filtrage et dédoublonnage.`
  );
  if (totalExcluded) {
    const listed = [...excludedHosts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([host, n]) => `${host} (${n})`)
      .join(', ');
    console.log(`${totalExcluded} écarté(s) car hors presse : ${listed}`);
  }
  console.log('');
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
    const outlet = truncate(enriched.domain || enriched.url, 46);
    console.log(`   ${outlet}${isKnownPress(item.link) ? '   ✓ presse mode connue' : ''}`);
    const when = item.publishedAt
      ? new Date(item.publishedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
      : item.published || 'date inconnue';
    console.log(`   publié  : ${when}`);
    console.log(
      `   photo   : ${enriched.image ? (item.feedImage ? '✓ (fournie par l\'API)' : '✓ (page lue)') : '✗ aucune'}   (${seconds}s)`
    );
    console.log(
      `   lien    : ${enriched.dead ? '✗ MORT (404) — retiré du dashboard' : '✓ ouvrable'}`
    );
    console.log(`   url     : ${enriched.url}`);
    const strip = await looksFor({ ...enriched, url: enriched.url });
    console.log(
      `   bande   : ${strip.looks.length ? `${strip.looks.length} photo(s)` : `✗ vide — ${strip.reason}`}`
    );
    strip.looks.slice(0, 3).forEach((look) => {
      console.log(`      · ${(look.label || 'sans libellé').slice(0, 52)}`);
    });
    if (item.queries > 1) console.log(`   trouvé par ${item.queries} requêtes différentes`);
    console.log('');
  }

  const browserError = takeBrowserError();
  if (browserError) console.log(`Erreur navigateur : ${browserError}\n`);

  console.log(`→ ${withPhoto} article(s) illustré(s) sur ${Math.min(candidates.length, 5)}.\n`);
  await closeBrowser();
})();
