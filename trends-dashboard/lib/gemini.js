// Gemini, with its errors read properly. A 429 from Google carries the quota
// that was hit and how long to wait, in an error.details array — truncating
// the body to a couple of hundred characters threw away exactly the part that
// says whether to wait a minute or to stop trying today.

const https = require('https');

const DEFAULT_MODEL = 'gemini-2.0-flash';
const MAX_RETRIES = 2;

const isConfigured = () => Boolean(process.env.GEMINI_API_KEY);
const modelName = () => process.env.GEMINI_MODEL || DEFAULT_MODEL;

function post(prompt, apiKey, model) {
  const payload = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${model}:generateContent`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-goog-api-key': apiKey,
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

// Google puts the useful part in error.details: which quota was exhausted, and
// a RetryInfo saying how long to wait.
function readQuotaFailure(error) {
  const details = error?.details || [];
  const quota = details.find((d) => /QuotaFailure/.test(d['@type'] || ''));
  const retry = details.find((d) => /RetryInfo/.test(d['@type'] || ''));

  const violation = quota?.violations?.[0] || {};
  const metric = violation.quotaMetric || violation.quotaId || '';
  const seconds = retry?.retryDelay ? parseInt(retry.retryDelay, 10) : null;

  // The period lives in quotaId ("…PerMinutePerProjectPerModel"), not in
  // quotaMetric, which is only the metric's URL — both have to be searched.
  const identity = `${violation.quotaMetric || ''} ${violation.quotaId || ''}`;

  return {
    metric,
    seconds: Number.isFinite(seconds) ? seconds : null,
    // A per-minute cap clears on its own; a per-day one does not.
    perDay: /per.?day/i.test(identity),
    perMinute: /per.?minute/i.test(identity),
  };
}

function describeQuotaError(error, model) {
  const { metric, seconds, perDay, perMinute } = readQuotaFailure(error);

  if (perMinute) {
    return `Limite par minute atteinte sur ${model}${seconds ? ` — réessaie dans ${seconds}s` : ''}.`;
  }
  if (perDay) {
    return `Quota gratuit du jour épuisé sur ${model}. Il se réinitialise sous 24 h — ou configure GROQ_API_KEY pour continuer tout de suite.`;
  }
  // No quota at all on this model: the usual cause is a key whose Cloud
  // project has no free-tier allowance, which no amount of waiting fixes.
  return (
    `Aucun quota disponible sur ${model}${metric ? ` (${metric})` : ''}. ` +
    'Le projet lié à la clé n’a pas de quota gratuit pour ce modèle : essaie une clé créée ' +
    'dans un nouveau projet sur aistudio.google.com, un autre GEMINI_MODEL, ou GROQ_API_KEY.'
  );
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function complete(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY n'est pas renseigné.");
  const model = modelName();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const { statusCode, body } = await post(prompt, apiKey, model);

    let parsed = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      /* handled below */
    }

    if (statusCode === 429) {
      const info = readQuotaFailure(parsed?.error);
      // Only a short, self-clearing wait is worth sitting through; a daily
      // cap or a missing allowance would just burn the same error again.
      const waitable = info.perMinute && info.seconds !== null && info.seconds <= 60;
      if (waitable && attempt < MAX_RETRIES) {
        await sleep((info.seconds + 1) * 1000);
        continue;
      }
      throw new Error(describeQuotaError(parsed?.error, model));
    }

    if (statusCode === 400 && /API key not valid/i.test(body)) {
      throw new Error('Clé Gemini invalide — vérifie GEMINI_API_KEY dans .env.');
    }
    if (statusCode === 404) {
      throw new Error(`Modèle « ${model} » inconnu — corrige GEMINI_MODEL dans .env.`);
    }
    if (statusCode >= 400) {
      const message = parsed?.error?.message || body.slice(0, 300);
      throw new Error(`Gemini a répondu HTTP ${statusCode} : ${message}`);
    }

    const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini a renvoyé une réponse vide.');
    return text;
  }

  throw new Error('Gemini : quota toujours saturé après plusieurs tentatives.');
}

module.exports = { complete, isConfigured, modelName, describeQuotaError, readQuotaFailure };
