// Answers, for one photo in one article: what is he actually wearing, and
// what is the closest thing that costs less. The article's own caption is the
// primary evidence — publishers name the house, rarely the reference — so the
// model is asked to read the piece out of the text rather than to guess from
// the image, which it never sees.

const aiProvider = require('./aiProvider');
const { linkForQuery, configuredProviders } = require('./affiliate');
const { garmentTerms } = require('./fashionVocabulary');

function buildPrompt({ article, look }) {
  return `Tu es un rédacteur mode chargé d'identifier précisément une pièce portée par une célébrité.

ARTICLE
Titre : ${article.title}
Média : ${article.source || article.domain || 'inconnu'}
Résumé : ${article.summary || '(aucun)'}
Marques citées dans l'article : ${(article.brands || []).join(', ') || '(aucune)'}
Pièces citées dans l'article : ${(article.garments || []).join(', ') || '(aucune)'}

PHOTO À IDENTIFIER
Légende : ${look.caption || '(aucune légende)'}
Marques repérées dans la légende : ${(look.brands || []).join(', ') || '(aucune)'}
Pièces repérées dans la légende : ${(look.garments || []).join(', ') || '(aucune)'}

Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, sans balises de code, à ce format exact :
{
  "piece": "nom court de la pièce en français, ex: Blouson en cuir noir",
  "brand": "la maison, ou null si l'article ne la nomme pas",
  "model": "le nom du modèle si l'article le donne, sinon null",
  "confidence": "élevée | moyenne | faible",
  "reasoning": "une phrase expliquant sur quoi tu t'appuies",
  "searchQuery": "requête d'achat en anglais pour trouver la pièce d'origine",
  "alternative": {
    "description": "une pièce très proche mais nettement moins chère, en français",
    "searchQuery": "requête d'achat en anglais pour cette alternative abordable"
  }
}

Règles :
- N'invente jamais une marque ni un modèle absents de l'article : mets null.
- "confidence" vaut "faible" si la marque n'est pas nommée dans l'article.
- L'alternative doit viser une enseigne accessible (Uniqlo, COS, Zara, Arket, Mango, Massimo Dutti…) et ne jamais être la même marque que l'originale.`;
}

// The model is asked for bare JSON, but wrapping it in a code fence is the
// most common way it disobeys.
function parseJson(text) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Réponse sans objet JSON.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

// Without a key, the caption has usually already yielded a brand and a
// garment; that is a weaker answer than the model's but a real one, and it
// keeps the button working rather than greying it out.
function withoutAi({ article, look }) {
  const brand = look.brands?.[0] || article.brands?.[0] || null;
  const garment = look.garments?.[0] || article.garments?.[0] || null;
  const piece = [brand, garment].filter(Boolean).join(' ') || look.caption || article.title;

  // The label is French for display; the query has to be the English term the
  // caption actually used, since the merchants are American.
  const term = garmentTerms(`${look.caption || ''} ${article.title}`)[0] || garment;

  return {
    piece: garment || piece,
    brand,
    model: null,
    confidence: brand && garment ? 'moyenne' : 'faible',
    reasoning: "Lu directement dans la légende de la photo, sans IA (aucune clé GEMINI_API_KEY configurée).",
    searchQuery: [brand, term].filter(Boolean).join(' ') || piece,
    alternative: {
      description: garment ? `${garment} similaire en enseigne accessible` : 'Pièce similaire abordable',
      searchQuery: term ? `affordable ${term}` : `affordable ${piece}`,
    },
  };
}

async function identifyPiece({ article, look }) {
  let identification;
  let identifiedBy = 'légende de la photo (sans IA)';
  let warning;

  if (!aiProvider.isConfigured()) {
    identification = withoutAi({ article, look });
  } else {
    try {
      const { text, provider } = await aiProvider.complete(buildPrompt({ article, look }));
      identification = parseJson(text);
      identifiedBy = provider;
    } catch (err) {
      identification = withoutAi({ article, look });
      warning = `Identification IA échouée — ${err.message}`;
    }
  }

  // Both the original and the cheaper stand-in get a shoppable link, so the
  // card answers "where do I buy this" either way.
  const [original, alternative] = await Promise.all([
    linkForQuery(identification.searchQuery || identification.piece || article.title),
    linkForQuery(identification.alternative?.searchQuery || `affordable ${identification.piece || ''}`),
  ]);

  return {
    identifiedBy,
    warning,
    affiliateProviders: configuredProviders(),
    piece: identification.piece || null,
    brand: identification.brand || null,
    model: identification.model || null,
    confidence: identification.confidence || 'faible',
    reasoning: identification.reasoning || null,
    original,
    alternative: { ...alternative, description: identification.alternative?.description || null },
  };
}

module.exports = { identifyPiece, buildPrompt, parseJson, withoutAi };
