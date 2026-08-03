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
  v.textContent = rising ? `+${item.formattedValue}` : item.formattedValue;
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

document.getElementById('refresh-btn').addEventListener('click', handleRefreshClick);

render();
