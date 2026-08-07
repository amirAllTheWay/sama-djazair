// Picks which model writes the text, on the same principle as searchSource:
// two independent providers, so one refusing a quota does not stop the
// feature. Gemini goes first when both are configured — the drafts are in
// French and it handles that best — with Groq behind it.

const gemini = require('./gemini');
const groq = require('./groq');

const PROVIDERS = [
  {
    id: 'gemini',
    label: () => `Gemini (${gemini.modelName()})`,
    isConfigured: gemini.isConfigured,
    complete: gemini.complete,
  },
  {
    id: 'groq',
    label: () => `Groq (${groq.modelName()})`,
    isConfigured: groq.isConfigured,
    complete: groq.complete,
  },
];

const configured = () => PROVIDERS.filter((provider) => provider.isConfigured());

const isConfigured = () => configured().length > 0;

// Falls through to the next provider on failure, so a Gemini quota wall is
// survivable when a Groq key is present. The last error is the one reported,
// with every attempt named so the panel does not just say "it failed".
async function complete(prompt) {
  const available = configured();
  if (!available.length) throw new Error('Aucun fournisseur IA configuré.');

  const failures = [];
  for (const provider of available) {
    try {
      const text = await provider.complete(prompt);
      return { text, provider: provider.label() };
    } catch (err) {
      failures.push(`${provider.id} — ${err.message || String(err)}`);
    }
  }

  throw new Error(failures.join(' | '));
}

function describeSetup() {
  return [
    'Aucune clé IA configurée. Au choix, dans .env :',
    '  · GEMINI_API_KEY — gratuit sur https://aistudio.google.com/apikey',
    '  · GROQ_API_KEY — gratuit sur https://console.groq.com/keys,',
    '    sans projet Cloud ni facturation à configurer.',
  ].join('\n');
}

module.exports = { complete, isConfigured, configured, describeSetup, PROVIDERS };
