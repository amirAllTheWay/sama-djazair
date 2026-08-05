// Sends one minimal request to the Custom Search API and prints Google's raw
// answer. The search pipeline reports only error.message, which collapses
// several distinct causes into similar wording — the full payload carries the
// reason code that tells them apart.
//
//   npm run check-key

const https = require('https');

const key = process.env.GOOGLE_API_KEY;
const cx = process.env.GOOGLE_CSE_ID;

function mask(value) {
  if (!value) return '(vide)';
  return `${value.slice(0, 6)}…${value.slice(-4)} (${value.length} caractères)`;
}

function request(url) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    https
      .request(
        { host: target.hostname, path: target.pathname + target.search, method: 'GET' },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode, body }));
        }
      )
      .on('error', reject)
      .end();
  });
}

(async () => {
  console.log('\nVérification des identifiants de recherche\n');

  // Serper first: it is the option that needs no console, and a working key
  // here means Custom Search is never called, so its state stops mattering.
  console.log(`SERPER_API_KEY : ${mask(process.env.SERPER_API_KEY)}`);
  let serperWorks = false;
  if (process.env.SERPER_API_KEY) {
    const { searchWeb } = require('../lib/serper');
    try {
      const results = await searchWeb('test', {});
      console.log(`✓ Serper fonctionne — ${results.length} résultats.\n`);
      serperWorks = true;
    } catch (err) {
      console.log(`✗ Serper : ${err.message}\n`);
    }
  } else {
    console.log('  (une clé sur serper.dev suffit à faire tourner la recherche)\n');
  }

  if (serperWorks) {
    console.log('C\'est la source utilisée : la recherche est opérationnelle.');
    console.log('Rien d\'autre n\'est requis — tu peux supprimer GOOGLE_API_KEY et');
    console.log('GOOGLE_CSE_ID de .env, Custom Search n\'est plus appelé.\n');
    return;
  }

  console.log(`GOOGLE_API_KEY : ${mask(key)}`);
  console.log(`GOOGLE_CSE_ID  : ${mask(cx)}\n`);

  if (!key || !cx) {
    console.log('Les deux valeurs doivent être renseignées pour tester Custom Search.\n');
    return;
  }

  if (/\s/.test(key) || /\s/.test(cx)) {
    console.log('⚠ Une des valeurs contient un espace ou un retour à la ligne —');
    console.log('  vérifie qu\'aucun guillemet ni espace ne traîne dans .env.\n');
  }

  const params = new URLSearchParams({ key, cx, q: 'test' });
  const { statusCode, body } = await request(
    `https://www.googleapis.com/customsearch/v1?${params}`
  );

  console.log(`Statut HTTP : ${statusCode}\n`);

  let json;
  try {
    json = JSON.parse(body);
  } catch {
    console.log(body.slice(0, 600));
    return;
  }

  if (json.error) {
    console.log('Réponse d\'erreur complète :\n');
    console.log(JSON.stringify(json.error, null, 2).slice(0, 1800));
    console.log('');

    // The reason code is what actually distinguishes the causes.
    const reasons = (json.error.errors || []).map((e) => e.reason).filter(Boolean);
    if (reasons.length) console.log(`Codes : ${reasons.join(', ')}\n`);
    return;
  }

  console.log(`✓ La clé fonctionne — ${json.searchInformation?.totalResults ?? '?'} résultats pour « test ».`);
  console.log(`  Premier résultat : ${json.items?.[0]?.title ?? '(aucun)'}\n`);
})().catch((err) => console.error(`Échec réseau : ${err.message}\n`));
