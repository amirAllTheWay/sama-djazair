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

const isConfigured = () => Boolean(process.env.GROQ_API_KEY);
const modelName = () => process.env.GROQ_MODEL || DEFAULT_MODEL;

function post(prompt, apiKey, model) {
  const payload = JSON.stringify({
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
  });

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

async function complete(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY n'est pas renseigné.");
  const model = modelName();

  const { statusCode, body } = await post(prompt, apiKey, model);

  let parsed = null;
  try {
    parsed = JSON.parse(body);
  } catch {
    /* handled below */
  }

  if (statusCode === 401) throw new Error('Clé Groq refusée — vérifie GROQ_API_KEY sur console.groq.com.');
  if (statusCode === 429) throw new Error('Limite Groq atteinte — réessaie dans un instant.');
  if (statusCode === 404) throw new Error(`Modèle « ${model} » inconnu chez Groq — corrige GROQ_MODEL.`);
  if (statusCode >= 400) {
    throw new Error(`Groq a répondu HTTP ${statusCode} : ${parsed?.error?.message || body.slice(0, 300)}`);
  }

  const text = parsed?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Groq a renvoyé une réponse vide.');
  return text;
}

module.exports = { complete, isConfigured, modelName };
