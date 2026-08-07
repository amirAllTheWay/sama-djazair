const { fetchStarArticles, DEFAULT_GEO, DEFAULT_HL } = require('./fetchArticles');
const { loadStars, saveLatest } = require('./store');
const { takeBrowserError } = require('./articlePage');
const { closeBrowser } = require('./browserResolver');
const { activeSource, describeSetup } = require('./searchSource');

async function runFetchCycle() {
  const stars = loadStars();
  const results = [];

  const source = activeSource();
  if (!source) {
    console.warn(`[articles] ${describeSetup()}`);
  } else {
    console.log(`[articles] Source : ${source.label}`);
  }

  for (const star of stars) {
    const entry = {
      slug: star.slug,
      name: star.name,
      epithet: star.epithet,
      fetchedAt: new Date().toISOString(),
      articles: [],
      errors: {},
    };

    try {
      const news = await fetchStarArticles(star, {
        geo: star.geo ?? DEFAULT_GEO,
        hl: star.hl ?? DEFAULT_HL,
      });
      entry.articles = news.articles;
      entry.excluded = news.excluded;
      entry.dead = news.dead;
      entry.windows = news.windows;
      Object.assign(entry.errors, news.errors);
    } catch (err) {
      entry.errors.articles = err.message || String(err);
    }

    saveLatest(star.slug, entry);

    const hasErrors = Object.keys(entry.errors).length > 0;
    results.push({ slug: star.slug, ok: !hasErrors && entry.articles.length > 0 });

    const illustrated = entry.articles.filter((a) => a.image).length;
    const relayed = entry.articles.filter((a) => /news\.google\.com/.test(a.url)).length;
    console.log(
      `[articles] ${star.slug} — ${entry.articles.length} article(s), ${illustrated} avec photo` +
        (entry.excluded ? `, ${entry.excluded} hors presse écarté(s)` : '') +
        (entry.dead ? `, ${entry.dead} lien(s) mort(s) retiré(s)` : '') +
        (relayed ? `, ${relayed} lien(s) Google non résolu(s)` : '') +
        (entry.windows?.length > 1 ? `  [fenêtre élargie : ${entry.windows.join(' → ')}]` : '')
    );
    for (const article of entry.articles) {
      const look = article.garments.length ? article.garments.join(' · ') : 'look non identifié';
      const strip = article.looks?.length ? `${article.looks.length} photo(s)` : 'bande vide';
      console.log(
        `[articles]   ${article.image ? '📷' : '——'} ${article.source || '?'} — ${look} — ${strip}`
      );
      if (!article.image) console.log(`[articles]      (pas de photo) ${article.url}`);
      if (!article.looks?.length && article.looksReason) {
        console.log(`[articles]      bande vide : ${article.looksReason}`);
      }
    }
    const browserError = takeBrowserError();
    if (browserError) {
      entry.errors.navigateur = browserError;
      console.warn(`[articles]   ✗ navigateur: ${browserError}`);
    }
    for (const [step, message] of Object.entries(entry.errors)) {
      if (step === 'navigateur') continue;
      console.warn(`[articles]   ✗ ${step}: ${message}`);
    }
  }

  // The shared browser is only worth keeping alive during a cycle.
  await closeBrowser();
  return results;
}

module.exports = { runFetchCycle };
