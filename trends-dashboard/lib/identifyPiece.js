// Answers, for one photo in one article: what is he actually wearing, and
// what is the closest thing that costs less. The article's own caption is the
// primary evidence — publishers name the house, rarely the reference — so the
// model is asked to read the piece out of the text rather than to guess from
// the image, which it never sees.

const aiProvider = require('./aiProvider');
const { linkForQuery, configuredProviders } = require('./affiliate');
const { garmentTerms } = require('./fashionVocabulary');
const { loadPhoto } = require('./photoInput');

// A full outfit rarely has more than this, and each entry costs two affiliate
// lookups.
const MAX_PIECES = 6;

function buildPrompt({ article, look, hasPhoto }) {
  const visual = hasPhoto
    ? `L'IMAGE JOINTE EST LA PHOTO À ANALYSER. Elle fait autorité sur ce qui est porté.
Décris d'abord ce que tu vois réellement, puis identifie LA PIÈCE LA PLUS MARQUANTE de cette tenue.`
    : `AUCUNE IMAGE n'a pu être chargée : appuie-toi uniquement sur la légende ci-dessous.
Si la légende ne décrit pas de vêtement précis, réponds avec "confidence": "faible".`;

  return `Tu es un rédacteur mode qui décrit des VÊTEMENTS sur une photo de presse.

Il ne s'agit pas de reconnaître ni de nommer la personne — son identité est déjà
connue et n'a aucun intérêt ici. La tâche porte uniquement sur les habits :
coupes, matières, couleurs. C'est une description de mode, comme en publie
n'importe quel magazine.

${visual}

LÉGENDE DE CETTE PHOTO
${look.caption || '(aucune légende)'}
Marques repérées dans cette légende : ${(look.brands || []).join(', ') || '(aucune)'}

CONTEXTE DE L'ARTICLE (attention : décrit l'article entier, pas forcément cette photo)
Titre : ${article.title}
Média : ${article.source || article.domain || 'inconnu'}
Résumé : ${article.summary || '(aucun)'}
Marques citées quelque part dans l'article : ${(article.brands || []).join(', ') || '(aucune)'}
Pièces citées quelque part dans l'article : ${(article.garments || []).join(', ') || '(aucune)'}

Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, sans balises de code, à ce format exact :
{
  "visible": "ce que tu vois sur la photo, en une phrase française",
  "pieces": [
    {
      "piece": "nom court en français, ex: Pantalon à pinces beige",
      "brand": "la maison, ou null",
      "model": "le nom du modèle, ou null",
      "confidence": "élevée | moyenne | faible",
      "reasoning": "une phrase : sur quoi tu t'appuies",
      "searchQuery": "requête d'achat en anglais pour cette pièce",
      "alternative": {
        "description": "une pièce très proche mais nettement moins chère, en français",
        "searchQuery": "requête d'achat en anglais pour cette alternative abordable"
      }
    }
  ]
}

RÈGLES IMPÉRATIVES
- Liste TOUTES les pièces d'habillement visibles sur la photo, de la plus
  marquante à la moins marquante : haut, bas, chaussures, veste, accessoires
  (lunettes, montre, sac, ceinture). Entre 2 et 6 entrées.
- Chaque "piece" doit être RÉELLEMENT VISIBLE sur l'image. Ne liste jamais une
  pièce citée dans l'article mais absente de la photo : si l'article parle d'un
  sac et que la photo montre une chemise et un pantalon, tu listes la chemise
  et le pantalon, pas le sac.
- Décris chaque pièce précisément : type, couleur, matière, coupe. « Pantalon à
  pinces beige à jambe large » et non « pantalon ».
- "brand" n'est renseigné que si la marque est nommée dans la LÉGENDE de cette
  photo, ou si le logo est lisible sur l'image. Une marque citée ailleurs dans
  l'article ne prouve pas qu'elle est portée ici : mets null.
- "model" n'est renseigné que si le texte le donne explicitement, sinon null.
- "confidence" : "élevée" seulement si la pièce est nettement visible ET que sa
  marque est nommée dans la légende. "moyenne" si la pièce est visible sans
  marque certaine. "faible" dans tous les autres cas.
- L'alternative doit viser une enseigne accessible (Uniqlo, COS, Zara, Arket,
  Mango, Massimo Dutti…) et ne jamais être la même marque que l'originale.
- Les "searchQuery" décrivent le VÊTEMENT (type, couleur, matière, coupe),
  jamais la célébrité.`;
}

// Small free models answer in prose about as often as they obey a format
// instruction, and a vision model shown a photograph of a person sometimes
// declines outright. Both come back here, so the error carries what was
// actually said — hiding it left nothing to act on.
function parseJson(text) {
  const cleaned = String(text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');

  if (start === -1 || end === -1 || end < start) {
    const said = cleaned.slice(0, 200) || '(réponse vide)';
    if (/(cannot|can't|unable|sorry|not able|I'm not|désolé|je ne peux)/i.test(cleaned)) {
      throw new Error(`le modèle a refusé d'analyser la photo : « ${said} »`);
    }
    throw new Error(`le modèle n'a pas répondu en JSON : « ${said} »`);
  }

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (err) {
    throw new Error(`JSON illisible (${err.message}) : « ${cleaned.slice(start, start + 200)} »`);
  }
}

// Without a key, the caption has usually already yielded a brand and a
// garment; that is a weaker answer than the model's but a real one, and it
// keeps the button working rather than greying it out.
function withoutAi({ article, look }) {
  const brand = look.brands?.[0] || look.garments?.length ? look.brands?.[0] : article.brands?.[0];
  const garments = look.garments?.length ? look.garments : article.garments || [];

  // The labels are French for display; the queries have to use the English
  // terms the caption actually contained, since the merchants are American.
  const terms = garmentTerms(`${look.caption || ''} ${article.title}`);

  const pieces = (garments.length ? garments : [look.caption || article.title]).map(
    (garment, index) => {
      const term = terms[index] || terms[0] || garment;
      return {
        piece: garment,
        brand: brand || null,
        model: null,
        confidence: brand && garments.length ? 'moyenne' : 'faible',
        reasoning: 'Lu dans la légende de la photo, sans IA — la photo elle-même n’a pas été analysée.',
        searchQuery: [brand, term].filter(Boolean).join(' ') || garment,
        alternative: {
          description: `${garment} similaire en enseigne accessible`,
          searchQuery: `affordable ${term || garment}`,
        },
      };
    }
  );

  return { visible: look.caption || null, pieces };
}

async function identifyPiece({ article, look }) {
  let identification;
  let identifiedBy = 'légende de la photo (sans IA)';
  let warning;

  if (!aiProvider.isConfigured()) {
    identification = withoutAi({ article, look });
  } else {
    // The photo is the evidence; the text alone produced confident answers
    // about garments that were not in the frame.
    let photo = null;
    let photoNote = null;
    try {
      photo = await loadPhoto(look.image);
    } catch (err) {
      photoNote = `Photo non analysée (${err.message}) — identification d'après le texte seul.`;
    }

    const prompt = buildPrompt({ article, look, hasPhoto: Boolean(photo) });

    // Small free models answer in prose often enough that one firm reminder is
    // worth a second call before falling back to the caption.
    const attempts = [
      prompt,
      `${prompt}\n\nRAPPEL : ta réponse doit commencer par { et finir par }. Aucun texte avant ou après, aucune balise de code.`,
    ];

    for (const [index, attemptPrompt] of attempts.entries()) {
      try {
        const { text, provider } = await aiProvider.complete(attemptPrompt, { photo, json: true });
        identification = parseJson(text);
        identifiedBy = photo ? `${provider}, d'après la photo` : `${provider}, texte seul`;
        if (photoNote) warning = photoNote;
        break;
      } catch (err) {
        if (index === attempts.length - 1) {
          identification = withoutAi({ article, look });
          warning = `Identification IA échouée — ${err.message}`;
        }
      }
    }
  }

  // Each garment gets both a link to the real thing and one to an affordable
  // stand-in, so every line of the list is directly shoppable.
  const listed = (identification.pieces || []).filter((entry) => entry?.piece).slice(0, MAX_PIECES);

  const pieces = await Promise.all(
    listed.map(async (entry) => {
      const [original, alternative] = await Promise.all([
        linkForQuery(entry.searchQuery || entry.piece),
        linkForQuery(entry.alternative?.searchQuery || `affordable ${entry.piece}`),
      ]);
      return {
        piece: entry.piece,
        brand: entry.brand || null,
        model: entry.model || null,
        confidence: entry.confidence || 'faible',
        reasoning: entry.reasoning || null,
        original,
        alternative: { ...alternative, description: entry.alternative?.description || null },
      };
    })
  );

  return {
    identifiedBy,
    warning,
    affiliateProviders: configuredProviders(),
    // What the model says it saw, so a wrong answer is visibly wrong rather
    // than merely surprising.
    visible: identification.visible || null,
    pieces,
  };
}

module.exports = { identifyPiece, buildPrompt, parseJson, withoutAi };
