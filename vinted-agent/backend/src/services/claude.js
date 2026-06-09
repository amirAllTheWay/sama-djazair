const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const STYLE_INSTRUCTIONS = {
  friendly: "Sois chaleureux, sympathique et humain. Utilise un ton convivial sans être trop familier.",
  firm:     "Sois professionnel et direct. Tiens tes positions avec politesse mais fermeté.",
  playful:  "Sois décontracté, léger et sympa. Un peu d'humour bienvenu sans être déplacé.",
  formal:   "Sois courtois et formel. Phrases complètes, vouvoiement, ton élégant.",
};

const LANGUAGE_NAMES = {
  fr: "français",
  en: "English",
  es: "español",
  de: "Deutsch",
  nl: "Nederlands",
};

/**
 * Generate a negotiation reply for a Vinted conversation.
 *
 * @param {object} params
 * @param {Array<{role: string, text: string}>} params.messages
 * @param {{title: string, listedPrice: number|null}} params.item
 * @param {{minPriceRatio: number, style: string, language: string}} params.sellerSettings
 * @returns {Promise<{reply: string, reasoning: string, offerAnalysis: string, autoApproved: boolean}>}
 */
async function generateNegotiationReply({ messages, item, sellerSettings }) {
  const { minPriceRatio = 0.8, style = "friendly", language = "fr" } = sellerSettings;

  const listedPrice = item?.listedPrice;
  const minAcceptable = listedPrice ? (listedPrice * minPriceRatio).toFixed(2) : null;
  const styleInstruction = STYLE_INSTRUCTIONS[style] || STYLE_INSTRUCTIONS.friendly;
  const langName = LANGUAGE_NAMES[language] || "français";

  const systemPrompt = `Tu es un agent de négociation expert qui représente un vendeur sur Vinted.
Ton rôle est de répondre aux messages des acheteurs potentiels en défendant les intérêts du vendeur.

ARTICLE EN VENTE :
- Titre : ${item?.title || "Article Vinted"}
- Prix affiché : ${listedPrice ? `${listedPrice} €` : "non précisé"}
${minAcceptable ? `- Prix minimum acceptable (confidentiel) : ${minAcceptable} €` : ""}

RÈGLES DE NÉGOCIATION :
1. Si l'acheteur propose un prix >= au prix minimum acceptable → tu peux accepter avec enthousiasme.
2. Si l'acheteur propose un prix < au minimum mais > (minimum - 5%) → propose une contre-offre au prix minimum.
3. Si l'acheteur propose un prix vraiment trop bas (< minimum - 10%) → décline poliment, rappelle la valeur de l'article et propose soit le prix affiché soit un léger geste si c'est tactiquement judicieux.
4. Si l'acheteur pose des questions (état, livraison, etc.) → réponds clairement et favorise la confiance.
5. Ne révèle JAMAIS le prix minimum au vendeur.
6. Reste toujours dans le personnage du vendeur – réponds à la première personne.

STYLE DE RÉPONSE : ${styleInstruction}
LANGUE : Réponds UNIQUEMENT en ${langName}.

FORMAT DE SORTIE :
Réponds avec un JSON valide (sans markdown, juste le JSON brut) :
{
  "reply": "<le message à envoyer à l'acheteur>",
  "reasoning": "<explication courte de ta stratégie, visible seulement pour le vendeur>",
  "offerAnalysis": "<analyse courte de l'offre reçue, ex: 'Offre à 75% du prix affiché – sous le seuil minimum'>",
  "autoApproved": <true si réponse purement factuelle ou confirmative, false si négociation>
}`;

  const conversationText = messages
    .map((m) => `[${m.role === "seller" ? "Vendeur" : "Acheteur"}]: ${m.text}`)
    .join("\n");

  const userPrompt = `Voici la conversation jusqu'ici :\n\n${conversationText}\n\nGénère la prochaine réponse du vendeur.`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = response.content[0].text.trim();

  // Strip markdown code fences if present
  const jsonText = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    // Fallback: return raw text as reply
    parsed = {
      reply: raw,
      reasoning: "",
      offerAnalysis: "",
      autoApproved: false,
    };
  }

  return parsed;
}

module.exports = { generateNegotiationReply };
