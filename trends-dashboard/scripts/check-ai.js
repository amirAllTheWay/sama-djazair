// Sends one tiny prompt to each configured AI provider and prints what came
// back. The dashboard only ever shows a one-line failure; this shows the whole
// answer, which is where Google says which quota was hit.
//
//   npm run check-ai

const { PROVIDERS, describeSetup } = require('../lib/aiProvider');
const groq = require('../lib/groq');

function mask(value) {
  if (!value) return '(vide)';
  return `${value.slice(0, 6)}…${value.slice(-4)} (${value.length} caractères)`;
}

const KEYS = { gemini: 'GEMINI_API_KEY', groq: 'GROQ_API_KEY' };

(async () => {
  console.log('\nVérification des fournisseurs IA\n');

  const configured = PROVIDERS.filter((provider) => provider.isConfigured());
  if (!configured.length) {
    console.log(`${describeSetup()}\n`);
    return;
  }

  let anyWorks = false;

  for (const provider of PROVIDERS) {
    const envName = KEYS[provider.id];
    if (!provider.isConfigured()) {
      console.log(`${provider.id.padEnd(7)} : non configuré (${envName} vide)\n`);
      continue;
    }

    console.log(`${provider.id.padEnd(7)} : ${mask(process.env[envName])}`);
    console.log(`          modèle ${provider.label()}`);

    const started = Date.now();
    try {
      const text = await provider.complete('Réponds exactement : OK');
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`          ✓ répond en ${seconds}s — « ${text.trim().slice(0, 60)} »`);
      anyWorks = true;
    } catch (err) {
      console.log(`          ✗ ${err.message}`);
    }

    // Model names change; printing the catalogue removes the guesswork about
    // which one can actually look at a photo.
    if (provider.id === 'groq') {
      try {
        const models = await groq.listModels();
        const vision = groq.pickVisionModel(models);
        console.log(`          modèle de vision retenu : ${vision || 'aucun trouvé'}`);
        console.log(`          catalogue : ${models.join(', ')}`);
      } catch (err) {
        console.log(`          catalogue indisponible : ${err.message}`);
      }
    }
    console.log('');
  }

  console.log(
    anyWorks
      ? "Au moins un fournisseur répond : le bouton « Retrouver la pièce » utilisera celui-là.\n"
      : "Aucun fournisseur ne répond. Le bouton continue de fonctionner, mais sans IA :\nla marque est alors lue dans la légende de la photo.\n"
  );
})().catch((err) => console.error(`Échec : ${err.message}\n`));
