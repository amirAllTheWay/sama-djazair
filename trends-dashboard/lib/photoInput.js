// Turns a published photo into bytes a vision model can read.
//
// This exists because identifying a garment from the article's text alone is
// unsound: an article naming Bottega Veneta and discussing handbags will lead
// a text-only model to answer "handbag" for a photo showing a shirt and
// trousers, and to call it high confidence because the brand really is cited.
// The fix is to let the model look.

const { fetchBinary } = require('./articlePage');

// Comfortably inside both providers' request limits once base64 inflates it
// by a third, and larger than any press photo served on the web.
const MAX_BYTES = 4_000_000;

const SUPPORTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

async function loadPhoto(url) {
  const { statusCode, buffer, contentType, tooLarge } = await fetchBinary(url, {
    maxBytes: MAX_BYTES,
  });

  if (tooLarge) throw new Error('Photo trop lourde pour être analysée.');
  if (statusCode !== 200 || !buffer?.length) {
    throw new Error(`La photo n'a pas pu être chargée (HTTP ${statusCode}).`);
  }

  const mimeType = contentType.split(';')[0].trim().toLowerCase();
  if (!SUPPORTED.includes(mimeType)) {
    throw new Error(`Format d'image non pris en charge (${mimeType || 'inconnu'}).`);
  }

  return { mimeType, base64: buffer.toString('base64'), bytes: buffer.length };
}

module.exports = { loadPhoto, MAX_BYTES, SUPPORTED };
