const trendsClient = require('./trendsClient');
const { loadStars } = require('./store');
const { TIMESERIES_RANGE, RELATED_QUERIES_RANGE } = require('./fetchTrends');

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
      "C'est l'IP de la machine qui exécute ce code que Google évalue — celle de l'hébergeur en ligne, la tienne en local.",
    steps: [],
  };

  // The session cookies are the thing under test as much as the requests are:
  // no NID in this list means Google never opened a session, and a 429 on the
  // very first call is the expected consequence.
  await trendsClient.warmUp();
  report.sessionCookies = trendsClient.cookieNames();

  // Each widget is probed at the range the app actually requests it at —
  // related queries come back empty on a short window regardless of status.
  const probes = [
    { widgetId: 'TIMESERIES', time: TIMESERIES_RANGE, path: '/trends/api/widgetdata/multiline' },
    {
      widgetId: 'RELATED_QUERIES',
      time: RELATED_QUERIES_RANGE,
      path: '/trends/api/widgetdata/relatedsearches',
    },
  ];

  for (const probe of probes) {
    const qs = trendsClient.buildExploreQuery({
      keyword: star.keyword,
      geo: '',
      hl: 'fr',
      time: probe.time,
    });

    let exploreRes;
    try {
      exploreRes = await trendsClient.rawGet('/trends/api/explore', qs);
    } catch (err) {
      report.steps.push({ step: `explore (${probe.time})`, networkError: err.message || String(err) });
      continue;
    }

    report.steps.push({
      step: `explore (${probe.time})`,
      statusCode: exploreRes.statusCode,
      interpretation: classify(exploreRes.statusCode, exploreRes.body),
      contentType: exploreRes.headers['content-type'] || null,
      setCookie: Boolean(exploreRes.headers['set-cookie']),
      location: exploreRes.headers.location || null,
      bodyLength: (exploreRes.body || '').length,
      bodyPreview: (exploreRes.body || '').slice(0, BODY_PREVIEW_CHARS),
    });

    if (exploreRes.statusCode !== 200) continue;

    let widgets;
    try {
      const parsed = JSON.parse(exploreRes.body.slice(exploreRes.body.indexOf('{')));
      widgets = parsed.widgets || [];
    } catch (err) {
      report.steps.push({ step: `parse-explore (${probe.time})`, parseError: err.message });
      continue;
    }

    const widget = widgets.find((w) => (w.id || '').indexOf(probe.widgetId) > -1);
    if (!widget) {
      report.steps.push({
        step: probe.widgetId,
        missing: true,
        note: 'Widget absent de la réponse explore.',
      });
      continue;
    }

    try {
      const res = await trendsClient.rawGet(probe.path, {
        hl: 'fr',
        tz: 0,
        req: JSON.stringify(widget.request),
        token: widget.token,
      });
      report.steps.push({
        step: `${probe.widgetId} (${probe.time})`,
        statusCode: res.statusCode,
        interpretation: classify(res.statusCode, res.body),
        contentType: res.headers['content-type'] || null,
        bodyLength: (res.body || '').length,
        bodyPreview: (res.body || '').slice(0, BODY_PREVIEW_CHARS),
      });
    } catch (err) {
      report.steps.push({ step: probe.widgetId, networkError: err.message || String(err) });
    }
  }

  return report;
}

module.exports = { diagnose };
