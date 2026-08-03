const trendsClient = require('./trendsClient');
const { loadStars } = require('./store');

const BODY_PREVIEW_CHARS = 700;

function classify(statusCode, body) {
  const trimmed = (body || '').trim();
  if (statusCode === 429) return 'Google limite le débit depuis cette IP (429). Attendre, ou passer par un proxy / une API tierce.';
  if (statusCode === 403) return "Google refuse la requête depuis cette IP (403). Typique d'une IP de datacenter signalée.";
  if (statusCode === 400) return 'Requête malformée (400) — paramètre invalide côté code, pas un blocage.';
  if (statusCode !== 200) return `Statut inattendu (${statusCode}).`;
  if (trimmed.startsWith('<')) return "Réponse HTML alors qu'on attend du JSON — page de consentement ou de blocage.";
  return 'Réponse JSON reçue — cette étape fonctionne.';
}

async function diagnose() {
  const stars = loadStars();
  const star = stars[0];
  if (!star) return { error: 'Aucune star configurée dans config/stars.json.' };

  const report = {
    ranAt: new Date().toISOString(),
    keyword: star.keyword,
    outboundIpNote:
      "L'IP sortante est celle de l'hébergeur (Render), pas la tienne — c'est elle que Google évalue.",
    steps: [],
  };

  const qs = trendsClient.buildExploreQuery({ keyword: star.keyword, geo: '', hl: 'fr', time: 'now 7-d' });

  let exploreRes;
  try {
    exploreRes = await trendsClient.rawGet('/trends/api/explore', qs);
  } catch (err) {
    report.steps.push({ step: 'explore', networkError: err.message || String(err) });
    return report;
  }

  report.steps.push({
    step: 'explore',
    statusCode: exploreRes.statusCode,
    interpretation: classify(exploreRes.statusCode, exploreRes.body),
    contentType: exploreRes.headers['content-type'] || null,
    setCookie: Boolean(exploreRes.headers['set-cookie']),
    location: exploreRes.headers.location || null,
    bodyLength: (exploreRes.body || '').length,
    bodyPreview: (exploreRes.body || '').slice(0, BODY_PREVIEW_CHARS),
  });

  if (exploreRes.statusCode !== 200) return report;

  let widgets;
  try {
    const parsed = JSON.parse(exploreRes.body.slice(exploreRes.body.indexOf('{')));
    widgets = parsed.widgets || [];
  } catch (err) {
    report.steps.push({ step: 'parse-explore', parseError: err.message });
    return report;
  }

  report.availableWidgetIds = widgets.map((w) => w.id);

  for (const widgetId of ['TIMESERIES', 'RELATED_QUERIES']) {
    const widget = widgets.find((w) => (w.id || '').indexOf(widgetId) > -1);
    if (!widget) {
      report.steps.push({ step: widgetId, missing: true, note: 'Widget absent de la réponse explore.' });
      continue;
    }

    const path =
      widgetId === 'TIMESERIES'
        ? '/trends/api/widgetdata/multiline'
        : '/trends/api/widgetdata/relatedsearches';

    try {
      const res = await trendsClient.rawGet(path, {
        hl: 'fr',
        tz: 0,
        req: JSON.stringify(widget.request),
        token: widget.token,
      });
      report.steps.push({
        step: widgetId,
        statusCode: res.statusCode,
        interpretation: classify(res.statusCode, res.body),
        contentType: res.headers['content-type'] || null,
        bodyLength: (res.body || '').length,
        bodyPreview: (res.body || '').slice(0, BODY_PREVIEW_CHARS),
      });
    } catch (err) {
      report.steps.push({ step: widgetId, networkError: err.message || String(err) });
    }
  }

  return report;
}

module.exports = { diagnose };
