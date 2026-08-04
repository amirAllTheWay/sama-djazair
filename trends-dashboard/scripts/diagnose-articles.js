// Shows what each source actually returns, so a missing photo can be traced to
// the feed, the link resolution, or the publisher blocking us.
//
//   npm run diagnose

const {
  PUBLISHER_FEEDS,
  fetchUrl,
  searchNews,
  searchBingNews,
  enrichArticle,
} = require('../lib/newsClient');
const { loadStars } = require('../lib/store');

const name = process.argv[2] || loadStars()[0]?.name || 'Jacob Elordi';

function truncate(value, length = 70) {
  if (!value) return '—';
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

(async () => {
  console.log(`\nDiagnostic articles — « ${name} »\n`);

  console.log('1. Flux des éditeurs');
  let withImages = 0;
  for (const feed of PUBLISHER_FEEDS) {
    process.stdout.write(`   ${feed.name.padEnd(18)}`);
    try {
      const { statusCode, body } = await fetchUrl(feed.url, { maxBytes: 900_000 });
      if (statusCode !== 200) {
        console.log(`HTTP ${statusCode}`);
        continue;
      }
      const items = body.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
      const mentions = items.filter((i) => i.toLowerCase().includes(name.toLowerCase()));
      const illustrated = mentions.filter((i) => /media:content|media:thumbnail|enclosure|<img/i.test(i));
      withImages += illustrated.length;
      console.log(
        `${String(items.length).padStart(3)} articles, ${mentions.length} sur la star, ${illustrated.length} avec photo`
      );
    } catch (err) {
      console.log(`échec — ${err.message}`);
    }
  }
  console.log(`   → ${withImages} article(s) illustré(s) trouvé(s) dans les flux directs\n`);

  console.log('2. Bing News (liens directs vers les éditeurs)');
  try {
    const items = await searchBingNews(`${name} outfit`);
    console.log(`   ${items.length} résultats\n`);

    for (const item of items.slice(0, 3)) {
      console.log(`   « ${truncate(item.title)} »`);
      console.log(`     lien      : ${truncate(item.link, 60)}`);
      const enriched = await enrichArticle(item);
      console.log(`     photo     : ${enriched.image ? '✓ ' + truncate(enriched.image, 55) : '✗ aucune'}`);
      console.log(`     résumé    : ${enriched.summary ? '✓ ' + truncate(enriched.summary, 55) : '✗ aucun'}\n`);
    }
  } catch (err) {
    console.log(`   échec — ${err.message}\n`);
  }

  console.log('3. Google News + résolution du lien');
  try {
    const items = await searchNews(`${name} outfit`, {});
    console.log(`   ${items.length} résultats`);

    for (const item of items.slice(0, 3)) {
      console.log(`\n   « ${truncate(item.title)} »`);
      console.log(`     lien brut : ${truncate(item.link, 60)}`);
      const enriched = await enrichArticle(item);
      console.log(`     résolu    : ${truncate(enriched.url, 60)}`);
      console.log(`     photo     : ${enriched.image ? '✓ ' + truncate(enriched.image, 55) : '✗ aucune'}`);
      console.log(`     résumé    : ${enriched.summary ? '✓ ' + truncate(enriched.summary, 55) : '✗ aucun'}`);
    }
  } catch (err) {
    console.log(`   échec — ${err.message}`);
  }

  console.log('Lecture : la section 2 est celle qui compte. Si Bing renvoie des');
  console.log('résultats avec « photo ✓ », les cartes seront illustrées. Si Bing');
  console.log('échoue ou que les photos manquent, colle cette sortie.\n');
})();
