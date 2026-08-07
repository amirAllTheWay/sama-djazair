// OpenRouter, for the photo identification specifically.
//
// It exists here because the two other providers cannot do the job: Gemini's
// free vision quota runs out within a day, and a Groq account may simply not
// be offered any multimodal model at all — the catalogue is per-account, and
// one that lists only text, audio and safety models leaves no way forward.
//
// The decisive advantage is that OpenRouter's catalogue *declares* each
// model's input modalities and its price. Which model can look at an image is
// read from the API rather than guessed from its name, so a renamed or retired
// model cannot silently break this again.

const https = require('https');

const HOST = 'openrouter.ai';
const isConfigured = () => Boolean(process.env.OPENROUTER_API_KEY);

// Resolved from the catalogue, then reused for the life of the process.
let resolvedVisionModel = null;
const modelName = () =>
  resolvedVisionModel || process.env.OPENROUTER_MODEL || 'modèle choisi au catalogue';

function request({ path, method, apiKey, payload }) {
  const body = payload ? JSON.stringify(payload) : null;
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: HOST,
        path,
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(body
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
            : {}),
          // OpenRouter attributes usage to an app when these are present.
          'HTTP-Referer': 'https://github.com/amirAllTheWay/sama-djazair',
          'X-Title': 'Star Style Tracker',
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
      }
    );
    req.setTimeout(60_000, () => req.destroy(new Error('Délai dépassé')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function listModels(apiKey = process.env.OPENROUTER_API_KEY) {
  const { statusCode, body } = await request({ path: '/api/v1/models', method: 'GET', apiKey });
  if (statusCode !== 200) throw new Error(`Catalogue OpenRouter indisponible (HTTP ${statusCode}).`);
  return JSON.parse(body).data || [];
}

const takesImages = (model) =>
  (model.architecture?.input_modalities || []).includes('image') ||
  /vision|vl\b|multimodal/i.test(model.architecture?.modality || '');

const isFree = (model) =>
  model.id?.endsWith(':free') ||
  (Number(model.pricing?.prompt) === 0 && Number(model.pricing?.completion) === 0);

// Free models first, since nothing here should require a card; among those,
// the largest context wins as a rough proxy for capability.
function pickVisionModel(models) {
  const capable = models.filter(takesImages);
  if (!capable.length) return null;

  const free = capable.filter(isFree);
  const pool = free.length ? free : capable;
  return pool.sort((a, b) => (b.context_length || 0) - (a.context_length || 0))[0].id;
}

async function visionModel(apiKey) {
  if (process.env.OPENROUTER_MODEL) return process.env.OPENROUTER_MODEL;
  if (resolvedVisionModel) return resolvedVisionModel;

  const chosen = pickVisionModel(await listModels(apiKey));
  if (!chosen) throw new Error("OpenRouter ne propose aucun modèle acceptant les images.");
  resolvedVisionModel = chosen;
  return chosen;
}

async function complete(prompt, { photo = null } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY n'est pas renseigné.");

  const model = await visionModel(apiKey);
  const content = photo
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${photo.mimeType};base64,${photo.base64}` } },
      ]
    : prompt;

  const { statusCode, body } = await request({
    path: '/api/v1/chat/completions',
    method: 'POST',
    apiKey,
    payload: { model, messages: [{ role: 'user', content }] },
  });

  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    /* handled below */
  }

  if (statusCode === 401) throw new Error('Clé OpenRouter refusée — vérifie OPENROUTER_API_KEY.');
  if (statusCode === 402) {
    throw new Error(`Crédits insuffisants pour ${model} — choisis un modèle « :free » via OPENROUTER_MODEL.`);
  }
  if (statusCode === 429) throw new Error(`Limite atteinte sur ${model} — réessaie dans un instant.`);
  if (statusCode >= 400) {
    throw new Error(`OpenRouter a répondu HTTP ${statusCode} : ${parsed?.error?.message || body.slice(0, 200)}`);
  }

  const text = parsed?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenRouter a renvoyé une réponse vide.');
  return text;
}

module.exports = { complete, isConfigured, modelName, listModels, pickVisionModel, takesImages };
