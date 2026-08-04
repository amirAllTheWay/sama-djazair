function initials(name) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatUpdatedAt(iso) {
  if (!iso) return 'Jamais mis à jour';
  const date = new Date(iso);
  const diffMin = Math.round((Date.now() - date.getTime()) / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  return `il y a ${Math.round(diffH / 24)} j`;
}

function formatArticleDate(value) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return '';
  const days = Math.floor((Date.now() - time) / 86400000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 7) return `il y a ${days} jours`;
  if (days < 30) return `il y a ${Math.floor(days / 7)} sem.`;
  return new Date(time).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

// Google News hands back the headline again as the description, sometimes with
// the outlet appended. Repeating it under the title adds a line and says
// nothing, so those summaries are dropped rather than displayed.
function echoesTitle(summary, title) {
  const normalise = (text) =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const cleanSummary = normalise(summary);
  const cleanTitle = normalise(title);
  return cleanSummary.startsWith(cleanTitle) || cleanTitle.startsWith(cleanSummary);
}

function articleCard(article) {
  const card = document.createElement('a');
  card.className = 'article-card';
  card.href = article.url;
  card.target = '_blank';
  card.rel = 'noopener';

  if (article.image) {
    const figure = document.createElement('div');
    figure.className = 'article-image';
    const img = document.createElement('img');
    img.src = article.image;
    img.alt = '';
    img.loading = 'lazy';
    // A dead publisher image would otherwise leave a broken-icon gap.
    img.addEventListener('error', () => figure.remove());
    figure.appendChild(img);
    card.appendChild(figure);
  }

  const content = document.createElement('div');
  content.className = 'article-content';

  const meta = document.createElement('div');
  meta.className = 'article-meta';
  const source = document.createElement('span');
  source.className = 'article-source';
  source.textContent = article.source || article.domain || 'Source inconnue';
  meta.appendChild(source);
  const date = document.createElement('span');
  date.textContent = formatArticleDate(article.publishedAt);
  meta.appendChild(date);
  if (article.outletCount > 1) {
    const pickup = document.createElement('span');
    pickup.className = 'article-pickup';
    pickup.textContent = `repris ×${article.outletCount}`;
    meta.appendChild(pickup);
  }
  content.appendChild(meta);

  const title = document.createElement('p');
  title.className = 'article-title';
  title.textContent = article.title;
  content.appendChild(title);

  const look = [];
  if (article.garments?.length) look.push({ label: 'Le look', value: article.garments.join(' · ') });
  if (article.brands?.length) look.push({ label: 'Marque', value: article.brands.join(' · ') });
  if (article.occasions?.length) look.push({ label: 'Où', value: article.occasions.join(' · ') });

  if (look.length) {
    const spec = document.createElement('dl');
    spec.className = 'look-spec';
    look.forEach(({ label, value }) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      spec.append(dt, dd);
    });
    content.appendChild(spec);
  }

  if (article.summary && !echoesTitle(article.summary, article.title)) {
    const summary = document.createElement('p');
    summary.className = 'article-summary';
    summary.textContent = article.summary;
    content.appendChild(summary);
  }

  card.appendChild(content);
  return card;
}

function articleEntry(article, slug) {
  const wrap = document.createElement('div');
  wrap.className = 'article-entry';
  wrap.appendChild(articleCard(article));

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'draft-btn';
  action.textContent = 'Créer un article';
  action.addEventListener('click', () => requestDraft(slug, article, action));
  wrap.appendChild(action);

  return wrap;
}

async function requestDraft(slug, article, button) {
  button.disabled = true;
  button.textContent = 'Rédaction…';

  try {
    const res = await fetch('/api/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, url: article.url }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || 'Échec de la génération.');
    openDraftPanel(body);
  } catch (err) {
    openDraftPanel({ error: err.message });
  } finally {
    button.disabled = false;
    button.textContent = 'Créer un article';
  }
}

function openDraftPanel(payload) {
  document.getElementById('draft-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'draft-panel';
  panel.className = 'draft-panel';

  const inner = document.createElement('div');
  inner.className = 'draft-inner';

  const head = document.createElement('div');
  head.className = 'draft-head';
  const heading = document.createElement('p');
  heading.className = 'draft-title';
  heading.textContent = payload.error ? 'Génération impossible' : 'Brouillon d’article';
  head.appendChild(heading);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'draft-close';
  close.setAttribute('aria-label', 'Fermer');
  close.textContent = '×';
  close.addEventListener('click', () => panel.remove());
  head.appendChild(close);
  inner.appendChild(head);

  if (payload.error) {
    const err = document.createElement('p');
    err.className = 'error-box';
    err.textContent = payload.error;
    inner.appendChild(err);
  } else {
    const meta = document.createElement('p');
    meta.className = 'draft-meta';
    const providers = payload.affiliateProviders?.length
      ? payload.affiliateProviders.join(' + ')
      : 'aucune plateforme configurée';
    meta.textContent = `Rédigé par ${payload.generatedBy} · affiliation : ${providers}`;
    inner.appendChild(meta);

    if (payload.warning) {
      const warn = document.createElement('p');
      warn.className = 'error-box';
      warn.textContent = payload.warning;
      inner.appendChild(warn);
    }

    const text = document.createElement('textarea');
    text.className = 'draft-text';
    text.readOnly = true;
    text.value = payload.markdown;
    inner.appendChild(text);

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'refresh-btn';
    copy.textContent = 'Copier le markdown';
    copy.addEventListener('click', async () => {
      await navigator.clipboard.writeText(payload.markdown);
      copy.textContent = 'Copié ✓';
      setTimeout(() => (copy.textContent = 'Copier le markdown'), 1500);
    });
    inner.appendChild(copy);
  }

  panel.appendChild(inner);
  panel.addEventListener('click', (event) => {
    if (event.target === panel) panel.remove();
  });
  document.body.appendChild(panel);
}

function buildColumn(star, entry) {
  const col = document.createElement('section');
  col.className = 'column';

  const header = document.createElement('div');
  header.className = 'col-header';
  header.innerHTML = `
    <div class="avatar">${initials(star.name)}</div>
    <div class="col-title">
      <div class="col-name">${star.name}</div>
      <div class="col-epithet">${star.epithet ?? ''}</div>
    </div>
  `;
  col.appendChild(header);

  const body = document.createElement('div');
  body.className = 'col-body';

  if (!entry) {
    const empty = document.createElement('p');
    empty.className = 'block-empty';
    empty.textContent = 'Pas encore de données — clique sur Actualiser en haut de page.';
    body.appendChild(empty);
  } else {
    const articles = entry.articles || [];

    if (!articles.length) {
      const none = document.createElement('p');
      none.className = 'block-empty';
      none.textContent = "Aucun article mode trouvé pour l'instant.";
      body.appendChild(none);
    } else {
      if (entry.stale && entry.articlesAt) {
        const staleNote = document.createElement('p');
        staleNote.className = 'stale-note';
        staleNote.textContent = `Dernière collecte sans résultat — articles affichés collectés ${formatUpdatedAt(entry.articlesAt)}.`;
        body.appendChild(staleNote);
      }

      const list = document.createElement('div');
      list.className = 'article-list';
      articles.forEach((article) => list.appendChild(articleEntry(article, star.slug)));
      body.appendChild(list);
    }

    if (entry.errors && Object.keys(entry.errors).length) {
      const messages = [...new Set(Object.values(entry.errors))];
      const err = document.createElement('div');
      err.className = 'error-box';
      err.textContent = `Collecte partiellement échouée : ${messages.join(' · ')}`;
      body.appendChild(err);
    }
  }

  col.appendChild(body);

  const footer = document.createElement('div');
  footer.className = 'col-footer';
  footer.textContent = entry ? `Mis à jour ${formatUpdatedAt(entry.fetchedAt)}` : '';
  col.appendChild(footer);

  return col;
}

function buildGhostColumn() {
  const col = document.createElement('section');
  col.className = 'column ghost';
  col.innerHTML = `
    <div class="ghost-inner">
      <div class="ghost-plus">+</div>
      <div class="ghost-title">Prochaine colonne</div>
      <div class="ghost-sub">Ajoute une star dans <code>config/stars.json</code> puis redémarre le serveur.</div>
    </div>
  `;
  return col;
}

async function render() {
  const board = document.getElementById('board');
  const updatedAtEl = document.getElementById('updated-at');

  try {
    const [stars, latest] = await Promise.all([
      fetch('/api/stars').then((r) => r.json()),
      fetch('/api/articles').then((r) => r.json()),
    ]);

    board.innerHTML = '';
    stars.forEach((star) => board.appendChild(buildColumn(star, latest.stars?.[star.slug])));
    board.appendChild(buildGhostColumn());

    updatedAtEl.textContent = latest.updatedAt
      ? `Dernière collecte : ${formatUpdatedAt(latest.updatedAt)}`
      : 'Aucune donnée — clique sur Actualiser';
  } catch (err) {
    board.innerHTML = `<p class="error-box">Impossible de charger les données : ${err.message}</p>`;
  }
}

function setRefreshMessage(text, kind) {
  const meta = document.getElementById('meta');
  let msgEl = document.getElementById('refresh-message');
  if (!text) {
    msgEl?.remove();
    return;
  }
  if (!msgEl) {
    msgEl = document.createElement('span');
    msgEl.id = 'refresh-message';
    msgEl.className = 'refresh-message';
    meta.appendChild(msgEl);
  }
  msgEl.textContent = text;
  msgEl.classList.toggle('error', kind === 'error');
  msgEl.classList.toggle('success', kind === 'success');
}

async function handleRefreshClick() {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.textContent = 'Actualisation…';
  setRefreshMessage('');

  try {
    const res = await fetch('/api/refresh', { method: 'POST' });
    const body = await res.json();

    if (!res.ok) {
      setRefreshMessage(body.message || "Échec de l'actualisation.", 'error');
    } else {
      const anyErrors = body.results?.some((r) => !r.ok);
      setRefreshMessage(
        anyErrors ? '⚠ Actualisé, mais certains articles manquent.' : '✓ Actualisé avec succès.',
        anyErrors ? 'error' : 'success'
      );
    }
    await render();
  } catch (err) {
    setRefreshMessage(`✗ Impossible de joindre le serveur : ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Actualiser';
  }
}

// Locally the server restarts on every pulled commit; without this the page
// keeps showing the markup it was served before the restart. Confined to
// localhost so a deployed instance never polls.
function watchForServerRestart() {
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  if (!isLocal) return;

  let knownBootId = null;
  setInterval(async () => {
    try {
      const { bootId } = await fetch('/api/version').then((r) => r.json());
      if (knownBootId === null) knownBootId = bootId;
      else if (bootId !== knownBootId) location.reload();
    } catch {
      // Server mid-restart: the next tick will find it again.
    }
  }, 2000);
}

document.getElementById('refresh-btn').addEventListener('click', handleRefreshClick);

render();
watchForServerRestart();
