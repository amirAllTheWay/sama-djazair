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

// Families that are not chat models at all: image, video, music and speech
// generators, embeddings, moderation. Several of them declare an image input —
// Lyria takes one to condition a piece of music — and would otherwise look
// like perfectly good candidates right up to the 400.
const NOT_CHAT =
  /(lyria|imagen|dall-?e|stable-?diffusion|flux|midjourney|veo|sora|runway|music|audio|tts|whisper|speech|voice|embed|moderation|rerank|guard)/i;

// Two conditions, not one: the model has to accept an image *and* answer in
// text. Checking only the input is what selected a music generator.
function takesImages(model) {
  if (NOT_CHAT.test(model.id || '')) return false;

  const input = model.architecture?.input_modalities || [];
  const output = model.architecture?.output_modalities || [];

  const readsImages =
    input.includes('image') || /vision|vl\b|multimodal/i.test(model.architecture?.modality || '');
  // An unspecified output is assumed to be text, which is the norm for chat.
  const writesText = output.length === 0 || output.includes('text');

  return readsImages && writesText;
}

const isFree = (model) =>
  model.id?.endsWith(':free') ||
  (Number(model.pricing?.prompt) === 0 && Number(model.pricing?.completion) === 0);

// Free models first, since nothing here should require a card; among those,
// the largest context wins as a rough proxy for capability.
function visionCandidates(models) {
  const capable = models.filter(takesImages);
  const byContext = (a, b) => (b.context_length || 0) - (a.context_length || 0);
  const free = capable.filter(isFree).sort(byContext);
  const paid = capable.filter((model) => !isFree(model)).sort(byContext);
  return [...free, ...paid].map((model) => model.id);
}

const pickVisionModel = (models) => visionCandidates(models)[0] || null;

// Several are kept, not one: a free model can be temporarily unavailable or
// reject a request its catalogue entry says it accepts, and one bad pick
// should not take the whole feature down with it.
const MODELS_TO_TRY = 3;

async function candidatesFor(apiKey) {
  if (process.env.OPENROUTER_MODEL) return [process.env.OPENROUTER_MODEL];
  if (resolvedVisionModel) return [resolvedVisionModel];

  const candidates = visionCandidates(await listModels(apiKey));
  if (!candidates.length) throw new Error("OpenRouter ne propose aucun modèle acceptant les images.");
  return candidates.slice(0, MODELS_TO_TRY);
}

const send = (apiKey, payload) =>
  request({ path: '/api/v1/chat/completions', method: 'POST', apiKey, payload });

// "Provider returned error" is OpenRouter's own wrapper; what the upstream
// provider actually said sits in error.metadata, and that is the part worth
// reading.
function describeError(parsed, body) {
  const error = parsed?.error;
  if (!error) return body.slice(0, 220) || '(corps vide)';

  const meta = error.metadata || {};
  const raw = typeof meta.raw === 'string' ? meta.raw : meta.raw ? JSON.stringify(meta.raw) : null;
  const provider = meta.provider_name ? `${meta.provider_name} : ` : '';

  return `${provider}${raw || error.message || '(sans détail)'}`.slice(0, 260);
}

async function complete(prompt, { photo = null, json = false } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY n'est pas renseigné.");

  const content = photo
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:${photo.mimeType};base64,${photo.base64}` } },
      ]
    : prompt;

  const candidates = await candidatesFor(apiKey);
  const failures = [];

  for (const model of candidates) {
    try {
      const text = await tryModel({ apiKey, model, content, json });
      // Remember what worked so the next click goes straight there.
      resolvedVisionModel = model;
      return text;
    } catch (err) {
      // A rejected key is not the model's fault and will fail identically on
      // every candidate — stop rather than burn the list.
      if (err.fatal) throw err;
      // tryModel already names the model in its message.
      failures.push(err.message);
    }
  }

  throw new Error(failures.join(' | '));
}

async function tryModel({ apiKey, model, content, json }) {
  const base = { model, messages: [{ role: 'user', content }] };

  // Asking in the prompt is not enough for small free models, so the format is
  // constrained at the API level — but not every model behind OpenRouter
  // accepts response_format, and those reject the whole request. It is tried
  // first and dropped on a 400, which beats losing the call entirely.
  let { statusCode, body } = await send(apiKey, json ? { ...base, response_format: { type: 'json_object' } } : base);
  let droppedJsonMode = false;

  if (statusCode === 400 && json) {
    droppedJsonMode = true;
    ({ statusCode, body } = await send(apiKey, base));
  }

  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    /* handled below */
  }

  if (statusCode === 401) {
    const err = new Error('Clé OpenRouter refusée — vérifie OPENROUTER_API_KEY.');
    err.fatal = true;
    throw err;
  }
  if (statusCode === 402) {
    throw new Error(`Crédits insuffisants pour ${model} — choisis un modèle « :free » via OPENROUTER_MODEL.`);
  }
  if (statusCode === 429) throw new Error(`Limite atteinte sur ${model} — réessaie dans un instant.`);
  if (statusCode >= 400) {
    throw new Error(
      `${model} a échoué (HTTP ${statusCode}) : ${describeError(parsed, body)}` +
        (droppedJsonMode ? ' — même sans contrainte JSON' : '')
    );
  }

  const text = parsed?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${model} a renvoyé une réponse vide.`);
  return text;
}

module.exports = {
  complete,
  isConfigured,
  modelName,
  listModels,
  pickVisionModel,
  visionCandidates,
  takesImages,
};
