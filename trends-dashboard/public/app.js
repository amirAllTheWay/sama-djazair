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
    empty.textContent = "En attente de la première collecte (le prochain cycle horaire va la déclencher).";
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

    if (entry.relatedQueries?.rising?.length) {
      const section = document.createElement('div');
      const label = document.createElement('p');
      label.className = 'section-label';
      label.textContent = 'Recherches en forte hausse';
      section.appendChild(label);
      const list = document.createElement('div');
      list.className = 'query-list';
      entry.relatedQueries.rising.slice(0, 6).forEach((item) => list.appendChild(queryRow(item, true)));
      section.appendChild(list);
      body.appendChild(section);
    }

    if (entry.relatedQueries?.top?.length) {
      const section = document.createElement('div');
      const label = document.createElement('p');
      label.className = 'section-label';
      label.textContent = 'Recherches associées les plus fréquentes';
      section.appendChild(label);
      const list = document.createElement('div');
      list.className = 'query-list';
      entry.relatedQueries.top.slice(0, 6).forEach((item) => list.appendChild(queryRow(item, false)));
      section.appendChild(list);
      body.appendChild(section);
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
      : 'Première collecte en attente';
  } catch (err) {
    board.innerHTML = `<p class="error-box">Impossible de charger les données : ${err.message}</p>`;
  }
}

render();
setInterval(render, 5 * 60 * 1000);
