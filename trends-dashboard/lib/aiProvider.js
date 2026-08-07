// Picks which model writes the text, on the same principle as searchSource:
// two independent providers, so one refusing a quota does not stop the
// feature. Gemini goes first when both are configured — the drafts are in
// French and it handles that best — with Groq behind it.

const gemini = require('./gemini');
const groq = require('./groq');
const openrouter = require('./openrouter');

const PROVIDERS = [
  {
    id: 'gemini',
    label: () => `Gemini (${gemini.modelName()})`,
    isConfigured: gemini.isConfigured,
    complete: gemini.complete,
    // Kept for writing drafts, kept away from photographs: its free vision
    // quota is exhausted within a day of normal use, so every identification
    // began by burning a round trip on a provider that was going to refuse.
    vision: false,
  },
  {
    id: 'groq',
    label: (withPhoto) => `Groq (${groq.modelName(withPhoto)})`,
    isConfigured: groq.isConfigured,
    complete: groq.complete,
    // Whether a Groq account is offered any multimodal model at all depends on
    // the account; when it is not, this falls through to OpenRouter.
    vision: true,
  },
  {
    id: 'openrouter',
    label: () => `OpenRouter (${openrouter.modelName()})`,
    isConfigured: openrouter.isConfigured,
    complete: openrouter.complete,
    vision: true,
  },
];

const configured = () => PROVIDERS.filter((provider) => provider.isConfigured());

// A photo narrows the field to providers that can actually look at one.
const usable = (withPhoto) =>
  configured().filter((provider) => (withPhoto ? provider.vision !== false : true));

const isConfigured = () => configured().length > 0;

// Falls through to the next provider on failure, so a Gemini quota wall is
// survivable when a Groq key is present. The last error is the one reported,
// with every attempt named so the panel does not just say "it failed".
async function complete(prompt, { photo = null } = {}) {
  const available = usable(Boolean(photo));
  if (!available.length) {
    throw new Error(
      photo
        ? 'Aucun fournisseur capable de lire une image. Ajoute OPENROUTER_API_KEY (clé gratuite sur openrouter.ai/keys).'
        : 'Aucun fournisseur IA configuré.'
    );
  }

  const failures = [];
  for (const provider of available) {
    try {
      const text = await provider.complete(prompt, { photo });
      return { text, provider: provider.label(Boolean(photo)) };
    } catch (err) {
      failures.push(`${provider.id} — ${err.message || String(err)}`);
    }
  }

  throw new Error(failures.join(' | '));
}

function describeSetup() {
  return [
    'Aucune clé IA configurée. Au choix, dans .env :',
    '  · OPENROUTER_API_KEY — https://openrouter.ai/keys — le seul qui garantit',
    '    un modèle capable de lire les photos, indispensable à l’identification.',
    '  · GROQ_API_KEY — https://console.groq.com/keys — rapide, mais les modèles',
    '    multimodaux ne sont pas proposés à tous les comptes.',
    '  · GEMINI_API_KEY — https://aistudio.google.com/apikey — rédaction des',
    '    brouillons uniquement ; son quota de vision gratuit s’épuise en un jour.',
  ].join('\n');
}

module.exports = { complete, isConfigured, configured, usable, describeSetup, PROVIDERS };
