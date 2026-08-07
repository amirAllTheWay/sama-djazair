// Groq, as an alternative to Gemini for the same reason Serper stands beside
// the Custom Search API: a free Google quota that refuses to materialise is
// not something this project can fix from the outside.
//
// A key from console.groq.com works immediately, with no Cloud project and no
// billing profile, and the free allowance is generous enough for a dashboard
// that calls a model on a button press.

const https = require('https');

// Chosen for being free, fast and good enough at "read this caption and name
// the garment", which is not a hard task.
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

// The text model is blind, and answering "what is he wearing" without seeing
// the photo is how a shirt-and-trousers shot gets called a handbag. A separate
// model is used whenever an image is sent.
//
// Hard-coding one identifier proved brittle: Groq retires and renames models,
// and a stale name fails with a 404 that says nothing useful. The catalogue is
// asked for instead, and matched against these patterns in order of
// preference. The constant survives only as a first guess worth trying before
// spending a round trip.
const DEFAULT_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

const VISION_PATTERNS = [/llama-4/i, /vision/i, /llava/i, /pixtral/i, /qwen.*vl/i, /gemma-3/i];

const isConfigured = () => Boolean(process.env.GROQ_API_KEY);

// Resolved from the catalogue on first use, so the 404 is paid once at most.
let resolvedVisionModel = null;

// The resolved name comes first: it is only ever set after the configured one
// returned a 404, so preferring it stops a stale .env value from costing a
// failed round trip on every single call.
const modelName = (withPhoto = false) =>
  withPhoto
    ? resolvedVisionModel || process.env.GROQ_VISION_MODEL || DEFAULT_VISION_MODEL
    : process.env.GROQ_MODEL || DEFAULT_MODEL;

function get(path, apiKey) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host: 'api.groq.com', path, method: 'GET', headers: { Authorization: `Bearer ${apiKey}` } },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      }
    );
    req.setTimeout(20_000, () => req.destroy(new Error('Délai dépassé')));
    req.on('error', reject);
    req.end();
  });
}

async function listModels(apiKey = process.env.GROQ_API_KEY) {
  const { statusCode, body } = await get('/openai/v1/models', apiKey);
  if (statusCode !== 200) throw new Error(`Liste des modèles indisponible (HTTP ${statusCode}).`);
  const parsed = JSON.parse(body);
  return (parsed.data || []).map((entry) => entry.id).filter(Boolean);
}

// Preference order, not alphabetical: the first pattern that matches anything
// in the catalogue wins.
function pickVisionModel(models) {
  for (const pattern of VISION_PATTERNS) {
    const match = models.find((id) => pattern.test(id));
    if (match) return match;
  }
  return null;
}

function post(prompt, apiKey, model, photo, json) {
  // Groq follows the OpenAI shape: the content becomes a list of parts as soon
  // as an image is attached.
  const content = photo
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${photo.mimeType};base64,${photo.base64}` } },
      ]
    : prompt;

  const body = { model, messages: [{ role: 'user', content }], temperature: 0.7 };
  // Asking in the prompt is not enough for smaller models.
  if (json) body.response_format = { type: 'json_object' };
  const payload = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Authorization: `Bearer ${apiKey}`,
        },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      }
    );
    req.setTimeout(45_000, () => req.destroy(new Error('Délai dépassé')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function attempt(prompt, apiKey, model, photo, json) {
  const { statusCode, body } = await post(prompt, apiKey, model, photo, json);

  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    /* handled by the caller */
  }

  return { statusCode, body, parsed };
}

async function complete(prompt, { photo = null, json = false } = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY n'est pas renseigné.");

  const wantsVision = Boolean(photo);
  let model = modelName(wantsVision);
  let { statusCode, body, parsed } = await attempt(prompt, apiKey, model, photo, json);

  // A retired or renamed model is the one failure worth recovering from
  // without the user editing .env: ask Groq what it actually serves today.
  if (statusCode === 404) {
    let catalogue = [];
    try {
      catalogue = await listModels(apiKey);
    } catch {
      throw new Error(`Modèle « ${model} » inconnu chez Groq, et la liste des modèles est illisible.`);
    }

    const replacement = wantsVision ? pickVisionModel(catalogue) : catalogue[0];
    if (!replacement) {
      // Which models a Groq account is offered is not something the user can
      // change from here, so point at the provider that does have them rather
      // than at a variable there is nothing valid to put in.
      throw new Error(
        "ce compte Groq ne propose aucun modèle capable de lire une image " +
          `(${catalogue.length} modèles, tous texte, audio ou sécurité). ` +
          'Ajoute OPENROUTER_API_KEY — clé gratuite sur openrouter.ai/keys.'
      );
    }

    if (wantsVision) resolvedVisionModel = replacement;
    model = replacement;
    ({ statusCode, body, parsed } = await attempt(prompt, apiKey, model, photo, json));
  }

  if (statusCode === 401) throw new Error('Clé Groq refusée — vérifie GROQ_API_KEY sur console.groq.com.');
  if (statusCode === 429) throw new Error('Limite Groq atteinte — réessaie dans un instant.');
  if (statusCode === 404) throw new Error(`Modèle « ${model} » inconnu chez Groq — corrige GROQ_VISION_MODEL.`);
  if (statusCode >= 400) {
    throw new Error(`Groq a répondu HTTP ${statusCode} : ${parsed?.error?.message || body.slice(0, 300)}`);
  }

  const text = parsed?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq a renvoyé une réponse vide.');
  return text;
}

module.exports = { complete, isConfigured, modelName, listModels, pickVisionModel };
