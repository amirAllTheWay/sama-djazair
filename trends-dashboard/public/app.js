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

// The card holds buttons now, so it cannot be an <a>: a click anywhere inside
// one would navigate away instead of firing the button. The image and the
// title carry the link instead.
function articleCard(article) {
  const card = document.createElement('div');
  card.className = 'article-card';

  if (article.image) {
    const figure = document.createElement('a');
    figure.className = 'article-image';
    figure.href = article.url;
    figure.target = '_blank';
    figure.rel = 'noopener';
    const img = document.createElement('img');
    img.src = proxied(article.image);
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
  // Google's own position is the relevance signal behind the ordering, so the
  // top few say why they are at the top rather than leaving it implicit.
  if (article.bestRank && article.bestRank <= 3) {
    const rank = document.createElement('span');
    rank.className = 'article-pickup';
    rank.textContent = `top ${article.bestRank} Google`;
    meta.appendChild(rank);
  }
  content.appendChild(meta);

  const title = document.createElement('a');
  title.className = 'article-title';
  title.href = article.url;
  title.target = '_blank';
  title.rel = 'noopener';
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

// Publisher CDNs refuse an <img> served from another origin; the server
// fetches the bytes instead.
function proxied(url) {
  return `/api/image?url=${encodeURIComponent(url)}`;
}

// One panel for a look: the photo full size, and underneath it the button that
// sends that photo to the model plus whatever it answers. Identification used
// to live in a second panel that replaced this one, which meant losing sight
// of the photo exactly when the answer needed checking against it.
function openPhotoPanel(look, article, slug, { identifyNow = false } = {}) {
  document.getElementById('draft-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'draft-panel';
  panel.className = 'draft-panel photo-panel';

  const inner = document.createElement('div');
  inner.className = 'photo-inner';

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'draft-close photo-close';
  close.setAttribute('aria-label', 'Fermer');
  close.textContent = '×';
  close.addEventListener('click', () => panel.remove());
  inner.appendChild(close);

  const img = document.createElement('img');
  img.className = 'photo-full';
  img.src = proxied(look.image);
  img.alt = look.caption || '';
  inner.appendChild(img);

  if (look.caption) {
    const caption = document.createElement('p');
    caption.className = 'photo-caption';
    caption.textContent = look.caption;
    inner.appendChild(caption);
  }

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'refresh-btn photo-identify';
  action.textContent = 'Retrouver la pièce';
  inner.appendChild(action);

  const results = document.createElement('div');
  results.className = 'photo-results';
  inner.appendChild(results);

  async function identify() {
    action.disabled = true;
    action.textContent = 'Analyse de la photo…';
    results.replaceChildren();

    try {
      const res = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, url: article.url, image: look.image }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "Échec de l'identification.");
      renderIdentification(results, body);
      action.textContent = 'Relancer l’analyse';
    } catch (err) {
      const box = document.createElement('p');
      box.className = 'error-box';
      box.textContent = err.message;
      results.appendChild(box);
      action.textContent = 'Réessayer';
    } finally {
      action.disabled = false;
    }
  }

  action.addEventListener('click', identify);
  if (identifyNow) identify();

  panel.appendChild(inner);
  panel.addEventListener('click', (event) => {
    if (event.target === panel) panel.remove();
  });
  document.addEventListener('keydown', function onEscape(event) {
    if (event.key !== 'Escape') return;
    panel.remove();
    document.removeEventListener('keydown', onEscape);
  });
  document.body.appendChild(panel);
}

// What the model answered, rendered into the photo panel.
function renderIdentification(container, payload) {
  const meta = document.createElement('p');
  meta.className = 'draft-meta';
  const count = payload.pieces?.length || 0;
  meta.textContent = `Identifié par ${payload.identifiedBy} · ${count} pièce${count > 1 ? 's' : ''}`;
  container.appendChild(meta);

  if (payload.visible) {
    const seen = document.createElement('p');
    seen.className = 'piece-visible';
    seen.textContent = `Sur la photo : ${payload.visible}`;
    container.appendChild(seen);
  }

  if (payload.warning) {
    const warn = document.createElement('p');
    warn.className = 'error-box';
    warn.textContent = payload.warning;
    container.appendChild(warn);
  }

  if (!count) {
    const none = document.createElement('p');
    none.className = 'block-empty';
    none.textContent = 'Aucune pièce identifiée sur cette photo.';
    container.appendChild(none);
    return;
  }

  payload.pieces.forEach((piece) => container.appendChild(pieceBlock(piece)));
}

// The photos found inside the article, laid out as a horizontal strip. Each
// one carries the piece named in its caption and a button that asks the model
// to pin down the exact garment.
function lookStrip(article, slug) {
  // An absent strip used to be indistinguishable from a broken one. Say which.
  if (!article.looks?.length) {
    if (!article.looksReason) return null;
    const note = document.createElement('p');
    note.className = 'look-note';
    note.textContent = `Photos non extraites — ${article.looksReason}`;
    return note;
  }

  const strip = document.createElement('div');
  strip.className = 'look-strip';

  article.looks.forEach((look) => {
    const item = document.createElement('div');
    item.className = 'look-item';

    // A button, not a link: clicking a look opens the photo full size rather
    // than navigating to the article, which the title already does.
    const frame = document.createElement('button');
    frame.type = 'button';
    frame.className = 'look-photo';
    frame.setAttribute('aria-label', 'Agrandir la photo');
    const img = document.createElement('img');
    img.src = proxied(look.image);
    img.alt = look.caption || '';
    img.loading = 'lazy';
    // Never silently blank: a frame that stays empty with no explanation is
    // what made the last failure impossible to diagnose.
    img.addEventListener('error', () => {
      frame.classList.add('look-photo-failed');
      frame.textContent = 'photo indisponible';
      frame.disabled = true;
    });
    frame.addEventListener('click', () => openPhotoPanel(look, article, slug));
    frame.appendChild(img);
    item.appendChild(frame);

    const label = document.createElement('p');
    label.className = 'look-label';
    label.textContent = look.label || 'Pièce non nommée';
    if (look.caption) label.title = look.caption;
    item.appendChild(label);

    // Same panel as clicking the photo, with the analysis already under way —
    // the answer has to be read next to the image it describes.
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'identify-btn';
    btn.textContent = 'Retrouver la pièce';
    btn.addEventListener('click', () => openPhotoPanel(look, article, slug, { identifyNow: true }));
    item.appendChild(btn);

    strip.appendChild(item);
  });

  return strip;
}


// One purchasable product: its photo, name, price and merchant. The whole
// card is the link, so the price is part of the decision rather than
// something to go and find.
function productCard(product) {
  const card = document.createElement('a');
  card.className = 'product-card';
  card.href = product.url;
  card.target = '_blank';
  card.rel = 'noopener';

  if (product.image) {
    const thumb = document.createElement('img');
    thumb.className = 'product-thumb';
    thumb.src = product.image;
    thumb.alt = '';
    thumb.loading = 'lazy';
    thumb.addEventListener('error', () => thumb.remove());
    card.appendChild(thumb);
  }

  const body = document.createElement('div');
  body.className = 'product-body';

  const title = document.createElement('p');
  title.className = 'product-title';
  title.textContent = product.title;
  body.appendChild(title);

  const meta = document.createElement('p');
  meta.className = 'product-meta';
  const price = document.createElement('strong');
  price.textContent = product.price || 'prix non indiqué';
  meta.appendChild(price);
  if (product.merchant) meta.append(` · ${product.merchant}`);
  body.appendChild(meta);

  // On its own line: at 130 px wide, appending it to the price truncated both.
  if (!product.affiliate) {
    const note = document.createElement('p');
    note.className = 'shop-note';
    note.textContent = 'lien non affilié';
    body.appendChild(note);
  }

  card.appendChild(body);
  return card;
}

// A shelf of real products for one query, or the reason there is none.
function shopRow(heading, entry) {
  const row = document.createElement('div');
  row.className = 'shop-row';

  const label = document.createElement('p');
  label.className = 'shop-label';
  label.textContent = heading;
  row.appendChild(label);

  if (entry.description) {
    const text = document.createElement('p');
    text.className = 'shop-text';
    text.textContent = entry.description;
    row.appendChild(text);
  }

  if (!entry.products?.length) {
    const empty = document.createElement('p');
    empty.className = 'shop-empty';
    empty.textContent = entry.error
      ? `Aucun produit — ${entry.error}`
      : 'Aucun produit trouvé pour cette pièce.';
    row.appendChild(empty);
    return row;
  }

  const shelf = document.createElement('div');
  shelf.className = 'product-shelf';
  entry.products.forEach((product) => shelf.appendChild(productCard(product)));
  row.appendChild(shelf);

  return row;
}

// One garment from the photo: what it is, and the two ways to buy it.
function pieceBlock(piece) {
  const block = document.createElement('div');
  block.className = 'piece-block';

  const head = document.createElement('div');
  head.className = 'piece-head';

  const name = document.createElement('p');
  name.className = 'piece-name';
  name.textContent = [piece.brand, piece.model, piece.piece].filter(Boolean).join(' · ');
  head.appendChild(name);

  const badge = document.createElement('span');
  badge.className = `piece-confidence confidence-${piece.confidence || 'faible'}`;
  badge.textContent = piece.confidence || 'faible';
  head.appendChild(badge);
  block.appendChild(head);

  if (piece.reasoning) {
    const why = document.createElement('p');
    why.className = 'piece-why';
    why.textContent = piece.reasoning;
    block.appendChild(why);
  }

  block.appendChild(shopRow("La pièce d'origine", piece.original));
  block.appendChild(shopRow('Une alternative moins chère', piece.alternative));

  return block;
}


function articleEntry(article, slug) {
  const wrap = document.createElement('div');
  wrap.className = 'article-entry';
  wrap.appendChild(articleCard(article));

  const strip = lookStrip(article, slug);
  if (strip) wrap.appendChild(strip);

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
