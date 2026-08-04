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
  return `il y a ${diffH} h`;
}

function drawSparkline(canvas, points) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (!points.length) return;

  const values = points.map((p) => p.value ?? 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = rect.width / Math.max(points.length - 1, 1);

  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim() || '#8C5A34';
  const accentTint = styles.getPropertyValue('--accent-tint').trim() || 'rgba(140,90,52,0.14)';

  ctx.beginPath();
  points.forEach((p, i) => {
    const x = i * stepX;
    const y = rect.height - ((p.value - min) / range) * (rect.height - 6) - 3;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.lineTo(rect.width, rect.height);
  ctx.lineTo(0, rect.height);
  ctx.closePath();
  ctx.fillStyle = accentTint;
  ctx.fill();

  const last = points[points.length - 1];
  const lastX = (points.length - 1) * stepX;
  const lastY = rect.height - ((last.value - min) / range) * (rect.height - 6) - 3;
  ctx.beginPath();
  ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
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

function tagList(labels, variant) {
  const wrap = document.createElement('div');
  wrap.className = 'tag-row';
  labels.forEach((label) => {
    const tag = document.createElement('span');
    tag.className = `tag tag-${variant}`;
    tag.textContent = label;
    wrap.appendChild(tag);
  });
  return wrap;
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
  if (article.brands.length) look.push({ label: 'Marque', value: article.brands.join(' · ') });
  if (article.occasions.length) look.push({ label: 'Où', value: article.occasions.join(' · ') });

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

  if (article.summary) {
    const summary = document.createElement('p');
    summary.className = 'article-summary';
    summary.textContent = article.summary;
    content.appendChild(summary);
  }

  card.appendChild(content);
  return card;
}

function querySection(label, items, rising) {
  const section = document.createElement('div');
  section.className = 'query-section';

  const heading = document.createElement('p');
  heading.className = 'section-label';
  heading.textContent = label;
  section.appendChild(heading);

  const list = document.createElement('div');
  list.className = 'query-list';
  if (!items.length) {
    const none = document.createElement('p');
    none.className = 'block-empty';
    none.textContent = 'Rien à afficher.';
    list.appendChild(none);
  } else {
    items.slice(0, 8).forEach((item) => list.appendChild(queryRow(item, rising)));
  }
  section.appendChild(list);
  return section;
}

function queryRow(item, rising) {
  const row = document.createElement('div');
  row.className = 'query-row' + (rising ? ' rising' : '');
  const q = document.createElement('span');
  q.className = 'q';
  q.textContent = item.query;
  const v = document.createElement('span');
  v.className = 'v';
  // Google already formats rising values ("+900%", "Breakout") — prefixing a
  // second plus produced "++900%".
  v.textContent = item.formattedValue;
  row.append(q, v);
  return row;
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
    empty.className = 'error-box';
    empty.textContent = "Pas encore de données — clique sur Actualiser en haut de page.";
    body.appendChild(empty);
  } else {
    if (entry.interestOverTime && entry.interestOverTime.length) {
      const sparkWrap = document.createElement('div');
      sparkWrap.className = 'sparkline-wrap';
      const canvas = document.createElement('canvas');
      sparkWrap.appendChild(canvas);
      const caption = document.createElement('div');
      caption.className = 'sparkline-caption';
      caption.textContent = `Intérêt de recherche — 7 derniers jours (${entry.interestOverTime.length} points)`;
      sparkWrap.appendChild(caption);
      body.appendChild(sparkWrap);
      requestAnimationFrame(() => drawSparkline(canvas, entry.interestOverTime));
    }

    const fashion = entry.fashionQueries || { top: [], rising: [] };
    const hasFashion = fashion.rising.length || fashion.top.length;

    const fashionBlock = document.createElement('div');
    fashionBlock.className = 'fashion-block';

    const fashionHeading = document.createElement('p');
    fashionHeading.className = 'block-heading';
    fashionHeading.textContent = 'Ce que les gens cherchent sur son style';
    fashionBlock.appendChild(fashionHeading);

    if (!hasFashion) {
      const none = document.createElement('p');
      none.className = 'block-empty';
      none.textContent =
        "Aucune recherche mode remontée pour l'instant — Google n'a pas assez de volume sur ces termes.";
      fashionBlock.appendChild(none);
    } else {
      fashionBlock.appendChild(querySection('En forte hausse', fashion.rising, true));
      fashionBlock.appendChild(querySection('Les plus fréquentes', fashion.top, false));
    }
    body.appendChild(fashionBlock);

    const articles = entry.articles || [];
    const articleBlock = document.createElement('div');
    articleBlock.className = 'article-block';

    const articleHeading = document.createElement('p');
    articleHeading.className = 'block-heading';
    articleHeading.textContent = 'Ses tenues dans la presse';
    articleBlock.appendChild(articleHeading);

    if (!articles.length) {
      const none = document.createElement('p');
      none.className = 'block-empty';
      none.textContent = "Aucun article mode trouvé pour l'instant.";
      articleBlock.appendChild(none);
    } else {
      const note = document.createElement('p');
      note.className = 'block-note';
      note.textContent =
        'Classé par reprise médiatique et récence. Les compteurs de partages ne sont plus publics — « repris ×N » indique le nombre de médias ayant couvert le même sujet.';
      articleBlock.appendChild(note);

      const list = document.createElement('div');
      list.className = 'article-list';
      articles.forEach((article) => list.appendChild(articleCard(article)));
      articleBlock.appendChild(list);
    }
    body.appendChild(articleBlock);

    const broad = entry.relatedQueries || { top: [], rising: [] };
    if (broad.rising.length || broad.top.length) {
      const details = document.createElement('details');
      details.className = 'broad-details';
      const summary = document.createElement('summary');
      summary.textContent = 'Toutes recherches confondues (pas seulement la mode)';
      details.appendChild(summary);
      details.appendChild(querySection('En forte hausse', broad.rising, true));
      details.appendChild(querySection('Les plus fréquentes', broad.top, false));
      body.appendChild(details);
    }

    if (entry.errors && Object.keys(entry.errors).length) {
      const err = document.createElement('div');
      err.className = 'error-box';
      err.textContent = `Dernière collecte partiellement échouée : ${Object.values(entry.errors).join(' · ')}`;
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
    const [starsRes, trendsRes] = await Promise.all([
      fetch('/api/stars').then((r) => r.json()),
      fetch('/api/trends').then((r) => r.json()),
    ]);

    board.innerHTML = '';
    starsRes.forEach((star) => {
      const entry = trendsRes.stars?.[star.slug];
      board.appendChild(buildColumn(star, entry));
    });
    board.appendChild(buildGhostColumn());

    updatedAtEl.textContent = trendsRes.updatedAt
      ? `Dernière collecte : ${formatUpdatedAt(trendsRes.updatedAt)}`
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
      setRefreshMessage(body.message || 'Échec de l\'actualisation.', 'error');
    } else {
      const anyErrors = body.results?.some((r) => !r.ok);
      setRefreshMessage(
        anyErrors ? '⚠ Actualisé avec des erreurs (voir le détail dans les colonnes ci-dessous).' : '✓ Actualisé avec succès.',
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
