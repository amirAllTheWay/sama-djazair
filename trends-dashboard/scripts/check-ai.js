// Sends one tiny prompt to each configured AI provider and prints what came
// back. The dashboard only ever shows a one-line failure; this shows the whole
// answer, which is where Google says which quota was hit.
//
//   npm run check-ai

const { PROVIDERS, describeSetup } = require('../lib/aiProvider');
const groq = require('../lib/groq');
const openrouter = require('../lib/openrouter');

function mask(value) {
  if (!value) return '(vide)';
  return `${value.slice(0, 6)}…${value.slice(-4)} (${value.length} caractères)`;
}

const KEYS = {
  gemini: 'GEMINI_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

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

    // Which model can read a photo is the question that matters here, and it
    // is answered by the catalogue rather than by a name written in advance.
    if (provider.id === 'groq') {
      try {
        const models = await groq.listModels();
        const vision = groq.pickVisionModel(models);
        console.log(
          `          photos : ${vision ? `✓ via ${vision}` : '✗ aucun modèle multimodal sur ce compte'}`
        );
        if (!vision) console.log(`          catalogue : ${models.join(', ')}`);
      } catch (err) {
        console.log(`          catalogue indisponible : ${err.message}`);
      }
    }

    if (provider.id === 'openrouter') {
      try {
        const models = await openrouter.listModels();
        const capable = models.filter(openrouter.takesImages);
        const chosen = openrouter.pickVisionModel(models);
        console.log(`          photos : ${chosen ? `✓ via ${chosen}` : '✗ aucun modèle multimodal'}`);
        console.log(`          ${capable.length} modèle(s) acceptent les images`);
      } catch (err) {
        console.log(`          catalogue indisponible : ${err.message}`);
      }
    }
    console.log('');
  }

  const visionCapable = PROVIDERS.filter((p) => p.isConfigured() && p.vision !== false);
  console.log(
    visionCapable.length
      ? `Identification des photos : ${visionCapable.map((p) => p.id).join(', ')}`
      : "Identification des photos : aucun fournisseur ne peut lire une image.\nAjoute OPENROUTER_API_KEY (gratuit, openrouter.ai/keys)."
  );

  console.log(
    anyWorks
      ? "Au moins un fournisseur répond : le bouton « Retrouver la pièce » utilisera celui-là.\n"
      : "Aucun fournisseur ne répond. Le bouton continue de fonctionner, mais sans IA :\nla marque est alors lue dans la légende de la photo.\n"
  );
})().catch((err) => console.error(`Échec : ${err.message}\n`));
