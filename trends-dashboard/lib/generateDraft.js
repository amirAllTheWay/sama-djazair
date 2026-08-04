const { affiliateLinksFor, configuredProviders } = require('./affiliate');

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

function formatLinks(links) {
  return links
    .map(({ query, url, provider, affiliate }) => {
      const tag = affiliate ? provider : `${provider} — lien non affilié`;
      return `- [${query}](${url})  *(${tag})*`;
    })
    .join('\n');
}

// Written without a model: everything here is already known from the article,
// so a draft is always produced even with no API key configured.
function templateDraft(article, links) {
  const look = article.garments?.length ? article.garments.join(', ') : 'à préciser';
  const brands = article.brands?.length ? article.brands.join(', ') : 'à préciser';
  const occasion = article.occasions?.length ? article.occasions.join(', ') : 'à préciser';

  return `# ${article.title}

**Le look :** ${look}
**Marque :** ${brands}
**Où :** ${occasion}
**Source :** [${article.source || 'article original'}](${article.url})

## Ce qu'il portait

${article.summary || 'À rédiger à partir de la photo et de la source.'}

## Pourquoi ça marche

À développer : la silhouette, les proportions, ce qui rend la tenue copiable.

## Où trouver des pièces similaires

${links.length ? formatLinks(links) : 'Aucune pièce identifiée automatiquement.'}

## Accroche TikTok

À écrire : une phrase d'ouverture qui donne envie de rester sur la vidéo.

---
*Brouillon généré sans IA — aucune clé GEMINI_API_KEY configurée.*
`;
}

function buildPrompt(article, links) {
  return `Tu es rédacteur mode pour un média francophone qui couvre le style des célébrités.

À partir des informations ci-dessous, rédige un article court en français (250 à 350 mots).

INFORMATIONS
Titre de la source : ${article.title}
Média : ${article.source || 'inconnu'}
Résumé de la source : ${article.summary || 'aucun'}
Pièces identifiées : ${article.garments?.join(', ') || 'non identifiées'}
Marques : ${article.brands?.join(', ') || 'non identifiées'}
Occasion : ${article.occasions?.join(', ') || 'non identifiée'}
Lien vers l'article original : ${article.url}

LIENS D'ACHAT À INTÉGRER (place-les naturellement dans la section shopping, en gardant le format markdown exact) :
${links.length ? formatLinks(links) : 'aucun'}

CONSIGNES
- Écris en français, ton éditorial mode, précis sans jargon.
- Structure en markdown : un titre H1 accrocheur, puis des sections H2.
- Décris la tenue concrètement : pièces, coupes, couleurs, proportions.
- Explique pourquoi ce look fonctionne et comment le porter.
- Inclus une section "Où trouver des pièces similaires" avec les liens fournis.
- Termine par une section "Accroche TikTok" : trois propositions d'accroche de 15 mots maximum.
- Cite le média source avec le lien vers l'article original.
- N'invente aucun prix, aucune référence produit, aucune déclaration de la star.`;
}

async function callGemini(prompt, apiKey) {
  const https = require('https');
  const payload = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${GEMINI_MODEL}:generateContent`,
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
        res.on('end', () => {
          if (res.statusCode >= 400) {
            return reject(new Error(`Gemini a répondu HTTP ${res.statusCode} : ${body.slice(0, 200)}`));
          }
          try {
            const parsed = JSON.parse(body);
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) return reject(new Error('Gemini a renvoyé une réponse vide.'));
            resolve(text);
          } catch (err) {
            reject(new Error(`Réponse Gemini illisible : ${err.message}`));
          }
        });
      }
    );
    req.setTimeout(45_000, () => req.destroy(new Error('Délai dépassé')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function generateDraft(article) {
  const links = await affiliateLinksFor(article);
  const apiKey = process.env.GEMINI_API_KEY;

  const meta = {
    affiliateProviders: configuredProviders(),
    affiliateLinks: links,
    generatedBy: apiKey ? `Gemini (${GEMINI_MODEL})` : 'modèle local (sans IA)',
  };

  if (!apiKey) {
    return { ...meta, markdown: templateDraft(article, links) };
  }

  try {
    const markdown = await callGemini(buildPrompt(article, links), apiKey);
    return { ...meta, markdown };
  } catch (err) {
    // A failed generation should still hand back something usable.
    return {
      ...meta,
      generatedBy: 'modèle local (sans IA)',
      warning: `Génération IA échouée — ${err.message}`,
      markdown: templateDraft(article, links),
    };
  }
}

module.exports = { generateDraft, templateDraft, buildPrompt };
