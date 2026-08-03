// Probes Google Trends categories to find which one narrows a star's related
// searches down to clothes. Run once, read the output, then set the winning id
// as `category` in config/stars.json.
//
//   npm run find-category
//   npm run find-category -- "Timothee Chalamet"

const trendsClient = require('../lib/trendsClient');
const { isFashionQuery } = require('../lib/fashionVocabulary');
const { loadStars } = require('../lib/store');

const DELAY_MS = 2500;
const TIME_RANGE = 'today 12-m';
const GEO = 'US';
const HL = 'en-US';

// Google publishes no machine-readable category list, and the ids are not
// guessable, so the plausible fashion-adjacent branches are all tried and the
// results decide. 0 is the unfiltered baseline to compare against.
const CANDIDATES = [
  { id: 0, label: 'Toutes catégories (référence)' },
  { id: 3, label: 'Arts & Entertainment' },
  { id: 18, label: 'Shopping' },
  { id: 44, label: 'Beauty & Fitness' },
  { id: 68, label: 'Apparel' },
  { id: 185, label: 'Fashion & Style' },
  { id: 697, label: 'Fashion Designers & Collections' },
  { id: 986, label: 'Fashion Modelling' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(keyword, category) {
  const widgets = await trendsClient.explore({
    keyword,
    geo: GEO,
    hl: HL,
    time: TIME_RANGE,
    category: category.id,
  });
  const data = await trendsClient.fetchWidget('RELATED_QUERIES', widgets, { hl: HL });
  const { top, rising } = trendsClient.toRelatedQueries(data);
  const all = [...top, ...rising];
  return {
    total: all.length,
    fashion: all.filter((item) => isFashionQuery(item.query)),
    sample: top.slice(0, 5).map((item) => item.query),
  };
}

(async () => {
  const keyword = process.argv[2] || loadStars()[0]?.keyword;
  if (!keyword) {
    console.error('Aucun mot-clé : passe-en un en argument ou configure une star.');
    process.exit(1);
  }

  console.log(`\nRecherche de la meilleure catégorie pour « ${keyword} »`);
  console.log(`Fenêtre : ${TIME_RANGE} — environ ${Math.round((CANDIDATES.length * DELAY_MS) / 1000)}s\n`);

  const scored = [];

  for (const category of CANDIDATES) {
    process.stdout.write(`[${String(category.id).padStart(3)}] ${category.label.padEnd(34)}`);
    try {
      const result = await probe(keyword, category);
      scored.push({ category, ...result });

      if (result.total === 0) {
        console.log('aucun résultat');
      } else {
        console.log(`${result.total} résultats, dont ${result.fashion.length} liés à la mode`);
        console.log(`      exemples : ${result.sample.join(' · ')}`);
      }
    } catch (err) {
      console.log(`échec — ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  const usable = scored.filter((s) => s.total > 0);
  if (!usable.length) {
    console.log('\nAucune catégorie n\'a renvoyé de données. Réessaie dans quelques minutes.\n');
    return;
  }

  // A category is useful here for the share of its results that are about
  // clothes, not the raw count — a big unfiltered list is what we started with.
  usable.sort((a, b) => {
    const ratio = (s) => s.fashion.length / s.total;
    return ratio(b) - ratio(a) || b.fashion.length - a.fashion.length;
  });

  const best = usable[0];
  console.log('\n─────────────────────────────────────────────');
  console.log(`Meilleure catégorie : [${best.category.id}] ${best.category.label}`);
  console.log(`${best.fashion.length}/${best.total} résultats liés à la mode`);
  if (best.fashion.length) {
    console.log('\nRecherches mode remontées :');
    best.fashion.slice(0, 12).forEach((item) => {
      console.log(`  ${item.query}  (${item.formattedValue})`);
    });
  }
  console.log(`\nPour l'utiliser, ajoute dans config/stars.json :  "category": ${best.category.id}`);
  console.log('─────────────────────────────────────────────\n');
})();
