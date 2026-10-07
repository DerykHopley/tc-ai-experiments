import { THEME_CSS } from './page-theme.ts';

export type Map3dLayout = {
  perplexity: number;
  positions2d: number[][]; // [person][x, y]
  positions3d: number[][]; // [person][x, y, z]
  kept2d: number; // share of true closest neighbours that are also nearest on the map
  kept3d: number;
};

export type Map3dModel = {
  model: string;
  neighbours: number[][]; // [person] -> indexes of their k true closest people
  layouts: Map3dLayout[];
};

export type Map3dPageData = {
  people: { name: string; field: string; gender: string }[];
  k: number;
  models: Map3dModel[];
  skipped: { model: string; reason: string }[];
};

// A self-contained HTML page with a rotatable 3D t-SNE map, drawn in SVG
export function renderMap3dHtml(page: Map3dPageData): string {
  // Escape "<" so the data can't close the <script> tag early
  const data = JSON.stringify(page).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Embedding maps in 3D</title>
<style>
${THEME_CSS}
  body { margin: 0; }
  .viz-root {
    min-height: 100vh;
    background: var(--page);
    color: var(--text-primary);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 2rem 1.5rem;
    box-sizing: border-box;
  }
  main { max-width: 1100px; margin: 0 auto; }
  .card {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1.25rem 1.5rem 1.5rem;
    margin-bottom: 1.25rem;
    position: relative;
  }
  h1 { font-size: 1.15rem; font-weight: 600; margin: 0 0 0.3rem; }
  h2 { font-size: 1rem; font-weight: 600; margin: 0 0 0.25rem; }
  a { color: var(--text-primary); text-underline-offset: 2px; }
  .subtitle, .explain { color: var(--text-secondary); font-size: 0.85rem; margin: 0; max-width: 50rem; line-height: 1.45; }
  .explain { margin-bottom: 0.9rem; }
  .meta { color: var(--text-muted); font-size: 0.78rem; margin: 0.6rem 0 0; }

  table { border-collapse: collapse; font-size: 0.85rem; }
  th, td { padding: 0.4rem 1.25rem 0.4rem 0; border-bottom: 1px solid var(--hairline); text-align: right; }
  th:first-child, td:first-child { text-align: left; }
  th { color: var(--text-secondary); font-weight: 600; font-size: 0.78rem; }
  td { font-variant-numeric: tabular-nums; }
  td .diff { color: var(--text-muted); font-size: 0.78rem; margin-left: 0.3rem; }

  .controls { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.75rem 1.5rem; margin-bottom: 0.5rem; }
  .switcher { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
  .switcher-label { color: var(--text-muted); font-size: 0.78rem; margin-right: 0.15rem; }
  button, select {
    font: inherit; font-size: 0.8rem; color: var(--text-secondary);
    background: var(--surface-1); border: 1px solid var(--border); border-radius: 6px;
    padding: 0.35rem 0.7rem; cursor: pointer; white-space: nowrap;
  }
  button:hover, select:hover { color: var(--text-primary); }
  button[aria-pressed="true"] { color: var(--text-primary); border-color: var(--text-secondary); font-weight: 600; }

  .split { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 1.5rem; align-items: start; }
  @media (max-width: 860px) { .split { grid-template-columns: 1fr; } }
  svg.map { display: block; width: 100%; height: auto; touch-action: none; cursor: grab; outline: none; border-radius: 6px; }
  svg.map:focus-visible { box-shadow: 0 0 0 2px var(--text-secondary); }
  svg.map.dragging { cursor: grabbing; }
  .point { fill: var(--series-1); stroke: var(--surface-1); stroke-width: 1.5; }
  .point.active { stroke: var(--text-primary); stroke-width: 2; }
  .point.neighbor { stroke: var(--text-secondary); stroke-width: 2; }
  .edge { stroke: var(--hairline); stroke-width: 1; }
  .link { stroke: var(--text-secondary); stroke-width: 1.5; }
  .label { fill: var(--text-secondary); font-size: 11px; pointer-events: none; paint-order: stroke; stroke: var(--surface-1); stroke-width: 3px; }
  .label.callout { fill: var(--text-primary); font-weight: 600; }

  .person h3 { font-size: 1rem; margin: 0; }
  .person .sub { color: var(--text-muted); font-size: 0.78rem; margin: 0.15rem 0 0.8rem; }
  .person h4 { font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); margin: 0.8rem 0 0.3rem; }
  .person h4 .score { color: var(--text-muted); font-weight: 400; }
  .person ol { margin: 0; padding-left: 1.1rem; font-size: 0.82rem; line-height: 1.5; }
  .person li.miss { color: var(--text-muted); }
  .person li.hit { color: var(--text-primary); }
  .key { color: var(--text-muted); font-size: 0.75rem; margin-top: 0.8rem; }

  .tooltip {
    position: absolute; pointer-events: none; display: none;
    background: var(--surface-1); color: var(--text-primary);
    border: 1px solid var(--border); border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    padding: 0.55rem 0.7rem; font-size: 0.8rem; min-width: 12rem; z-index: 3;
  }
  .tooltip strong { display: block; font-size: 0.9rem; margin-bottom: 0.2rem; }
  .tooltip .caption { color: var(--text-muted); font-size: 0.72rem; }
</style>
</head>
<body>
<div class="viz-root">
<main>
  <section class="card">
    <h1>Embedding maps in 3D (experiment)</h1>
    <p class="subtitle">The <a href="model-comparison.html">model comparison page</a> lays each model's embeddings out in 2D with t-SNE. This page lays them out in 3D as well, to see whether the extra dimension gives a more faithful picture of who is close to whom.</p>
    <p class="meta" id="meta"></p>
  </section>

  <section class="card">
    <h2>Does the third dimension help?</h2>
    <p class="explain" id="kept-explain"></p>
    <table id="kept"></table>
    <p class="meta">Each cell is one t-SNE run (seed 42). In a check with text-embedding-3-small, other seeds moved these numbers by 1–3 points, so treat smaller differences as noise.</p>
  </section>

  <section class="card" id="map-card">
    <h2>Explore the 3D map</h2>
    <p class="explain">Drag to rotate, or select the map and use the arrow keys. Points further away are smaller and fainter. Grey lines link each person to their 3 true closest people, taken from the full embeddings, not from the map; the selected person's lines are darker.</p>
    <div class="controls">
      <div class="switcher" id="model-switcher" role="group" aria-label="Model"></div>
      <div class="switcher" id="perplexity-switcher" role="group" aria-label="Perplexity"></div>
    </div>
    <div class="controls">
      <div class="switcher">
        <label class="switcher-label" for="person-select">Person</label>
        <select id="person-select"></select>
      </div>
      <div class="switcher">
        <button id="spin" aria-pressed="false">Spin</button>
        <button id="reset">Reset view</button>
      </div>
    </div>
    <div class="split">
      <svg class="map" id="map" viewBox="0 0 640 560" tabindex="0" role="img"></svg>
      <div class="person" id="person" aria-live="polite"></div>
    </div>
    <div class="tooltip" id="tooltip" role="status"></div>
  </section>
</main>
</div>
<script id="data" type="application/json">${data}</script>
<script>
  const page = JSON.parse(document.getElementById('data').textContent);
  const { people, k } = page;
  const n = people.length;
  const short = (model) => model.split('/').pop();
  const pct = (x) => Math.round(x * 100) + '%';
  const html = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // ---- Header ----
  const skipped = page.skipped.map((s) => short(s.model) + ': ' + s.reason).join('; ');
  document.getElementById('meta').textContent =
    'Models: ' + page.models.map((m) => short(m.model)).join(' · ') + (skipped ? '. Skipped: ' + skipped : '');

  // ---- Table: how much of the true neighbourhood each map keeps ----
  document.getElementById('kept-explain').textContent =
    'For each person, the share of their ' + k + ' closest people (from the full embeddings) who are also among their ' + k +
    ' nearest points on the map, averaged over everyone. Higher means the map is a more faithful picture. ' +
    'Placing people at random would keep about ' + pct(k / (n - 1)) + '.';
  const table = document.getElementById('kept');
  const head = table.createTHead();
  const groupRow = head.insertRow();
  groupRow.append(html('th', '', ''));
  page.models[0].layouts.forEach((l) => {
    const th = html('th', '', 'Perplexity ' + l.perplexity);
    th.colSpan = 2;
    groupRow.append(th);
  });
  const sub = head.insertRow();
  sub.append(html('th', '', 'Model'));
  page.models[0].layouts.forEach(() => sub.append(html('th', '', '2D'), html('th', '', '3D')));
  const body = table.createTBody();
  page.models.forEach((m) => {
    const row = body.insertRow();
    row.insertCell().textContent = short(m.model);
    m.layouts.forEach((l) => {
      row.insertCell().textContent = pct(l.kept2d);
      const cell = row.insertCell();
      cell.textContent = pct(l.kept3d);
      const diff = Math.round(l.kept3d * 100) - Math.round(l.kept2d * 100);
      cell.append(html('span', 'diff', '(' + (diff > 0 ? '+' : '') + diff + ')'));
    });
  });

  // ---- 3D map ----
  const W = 640, H = 560, SCALE = 200, CAMERA = 4, HIT = 18, START = { yaw: 0.6, pitch: -0.35 };
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('map');
  const tooltip = document.getElementById('tooltip');
  const mapCard = document.getElementById('map-card');
  const personEl = document.getElementById('person');
  const spinButton = document.getElementById('spin');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let modelIndex = 0, layoutIndex = 0;
  let selected = Math.max(0, people.findIndex((p) => p.name === 'Marie Curie'));
  let hovered = null;
  let yaw = START.yaw, pitch = START.pitch;
  let spinning = false;
  let points = [], projected = [], edges = [];

  const el = (tag, attrs, parent) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, v] of Object.entries(attrs)) node.setAttribute(key, v);
    parent.appendChild(node);
    return node;
  };
  const edgeLayer = el('g', {}, svg), linkLayer = el('g', {}, svg), dotLayer = el('g', {}, svg), labelLayer = el('g', {}, svg);
  const dots = people.map((p, i) => el('circle', { class: 'point' }, dotLayer));
  const links = Array.from({ length: k }, () => el('line', { class: 'link' }, linkLayer));

  const model = () => page.models[modelIndex];
  const layout = () => model().layouts[layoutIndex];

  // Centre the layout and scale it to fit inside a unit sphere, so it fits the frame at any angle
  function normalise(positions) {
    const mean = [0, 1, 2].map((d) => positions.reduce((s, p) => s + p[d], 0) / positions.length);
    const centred = positions.map((p) => p.map((v, d) => v - mean[d]));
    const extent = Math.max(...centred.map((p) => Math.hypot(...p))) || 1;
    return centred.map((p) => p.map((v) => v / extent));
  }

  // Rotate by yaw (around the vertical axis) and pitch (around the horizontal), then add perspective.
  // depth runs from -1 (nearest the viewer) to 1 (furthest away).
  function project([x, y, z]) {
    const x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
    const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
    const y2 = y * Math.cos(pitch) - z1 * Math.sin(pitch);
    const z2 = y * Math.sin(pitch) + z1 * Math.cos(pitch);
    const perspective = CAMERA / (CAMERA + z2);
    return { x: W / 2 + x1 * SCALE * perspective, y: H / 2 + y2 * SCALE * perspective, depth: z2 };
  }

  function draw() {
    projected = points.map(project);
    const close = model().neighbours[selected];
    edges.forEach(({ i, j, line }) => {
      const a = projected[i], b = projected[j];
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
      // Fade lines further back, like the points
      line.style.opacity = 0.35 + 0.65 * (1 - (a.depth + b.depth) / 2) / 2;
    });
    // Draw the furthest points first so nearer ones cover them
    projected.map((p, i) => i).sort((a, b) => projected[b].depth - projected[a].depth).forEach((i) => {
      const p = projected[i];
      const near = (1 - p.depth) / 2; // 0 far .. 1 near
      const dot = dots[i];
      const highlight = i === selected || close.includes(i);
      dot.setAttribute('cx', p.x);
      dot.setAttribute('cy', p.y);
      dot.setAttribute('r', (i === selected ? 2 : 0) + 2.5 + 3.5 * near);
      dot.style.opacity = highlight ? 1 : 0.25 + 0.75 * near;
      dot.setAttribute('class', 'point' + (i === selected ? ' active' : close.includes(i) ? ' neighbor' : ''));
      dotLayer.appendChild(dot);
    });
    dotLayer.appendChild(dots[selected]);
    close.forEach((j, n) => {
      const a = projected[selected], b = projected[j];
      links[n].setAttribute('x1', a.x); links[n].setAttribute('y1', a.y);
      links[n].setAttribute('x2', b.x); links[n].setAttribute('y2', b.y);
    });
    labelLayer.replaceChildren();
    const labelled = [selected, ...close];
    if (hovered !== null && !labelled.includes(hovered)) labelled.push(hovered);
    // Try the right, left, top and bottom of each point until the label overlaps no earlier label
    const placed = [];
    const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    labelled.forEach((i) => {
      const p = projected[i];
      const text = el('text', { class: 'label' + (i === selected || i === hovered ? ' callout' : '') }, labelLayer);
      text.textContent = people[i].name;
      const { width, height } = text.getBBox();
      const options = [
        [p.x + 9, p.y + 4],
        [p.x - 9 - width, p.y + 4],
        [p.x - width / 2, p.y - 10],
        [p.x - width / 2, p.y + 8 + height],
      ];
      const box = ([x, y]) => ({ x0: x - 2, y0: y - height * 0.8, x1: x + width + 2, y1: y + height * 0.25 });
      const spot = options.find((o) => !placed.some((b) => overlaps(box(o), b))) || options[0];
      placed.push(box(spot));
      text.setAttribute('x', spot[0]);
      text.setAttribute('y', spot[1]);
    });
  }

  // Nearest k people to person i in a list of positions (any number of dimensions)
  function nearestOn(positions, i) {
    return positions.map((q, j) => ({ j, d: Math.hypot(...q.map((v, d) => v - positions[i][d])) }))
      .filter(({ j }) => j !== i).sort((a, b) => a.d - b.d).slice(0, k).map(({ j }) => j);
  }

  function renderPerson() {
    const p = people[selected];
    const close = model().neighbours[selected];
    personEl.replaceChildren(html('h3', '', p.name), html('p', 'sub', p.field + ' · ' + p.gender));
    const list = (title, indexes, mark) => {
      const hits = indexes.filter((j) => close.includes(j)).length;
      const h4 = html('h4', '', title + ' ');
      if (mark) h4.append(html('span', 'score', hits + ' of ' + k + ' true'));
      const ol = html('ol');
      indexes.forEach((j) => ol.append(html('li', !mark || close.includes(j) ? 'hit' : 'miss', people[j].name + (mark && close.includes(j) ? ' ✓' : ''))));
      personEl.append(h4, ol);
    };
    list('True closest (full embeddings)', close, false);
    list('Nearest on the 2D map', nearestOn(layout().positions2d, selected), true);
    list('Nearest on the 3D map', nearestOn(layout().positions3d, selected), true);
    personEl.append(html('p', 'key', '✓ = also one of the true closest. ' + short(model().model) + ', perplexity ' + layout().perplexity + '.'));
  }

  function build() {
    points = normalise(layout().positions3d);
    // Grey lines between every person and their true closest, each pair drawn once, as on the 2D map
    const seen = new Set();
    edges = [];
    edgeLayer.replaceChildren();
    model().neighbours.forEach((close, i) => close.forEach((j) => {
      const key = Math.min(i, j) + '|' + Math.max(i, j);
      if (seen.has(key)) return;
      seen.add(key);
      edges.push({ i, j, line: el('line', { class: 'edge' }, edgeLayer) });
    }));
    svg.setAttribute('aria-label', '3D map for ' + short(model().model) + ' at perplexity ' + layout().perplexity + '. Selected: ' + people[selected].name);
    renderPerson();
    draw();
  }

  function select(i) {
    selected = i;
    personSelect.value = String(i);
    build();
  }

  // ---- Controls ----
  function makeSwitcher(id, label, options, pick) {
    const container = document.getElementById(id);
    if (label) container.append(html('span', 'switcher-label', label));
    options.forEach((text, i) => {
      const b = html('button', '', text);
      b.setAttribute('aria-pressed', String(i === 0));
      b.addEventListener('click', () => {
        pick(i);
        container.querySelectorAll('button').forEach((x, j) => x.setAttribute('aria-pressed', String(j === i)));
        build();
      });
      container.append(b);
    });
  }
  makeSwitcher('model-switcher', '', page.models.map((m) => short(m.model)), (i) => (modelIndex = i));
  makeSwitcher('perplexity-switcher', 'Perplexity', page.models[0].layouts.map((l) => String(l.perplexity)), (i) => (layoutIndex = i));

  const personSelect = document.getElementById('person-select');
  people.map((p, i) => ({ name: p.name, i })).sort((a, b) => a.name.localeCompare(b.name)).forEach(({ name, i }) => {
    const option = html('option', '', name);
    option.value = String(i);
    personSelect.append(option);
  });
  personSelect.addEventListener('change', () => select(Number(personSelect.value)));

  function setSpinning(on) {
    spinning = on;
    spinButton.setAttribute('aria-pressed', String(on));
  }
  spinButton.addEventListener('click', () => setSpinning(!spinning));
  document.getElementById('reset').addEventListener('click', () => {
    yaw = START.yaw;
    pitch = START.pitch;
    draw();
  });
  const tick = () => {
    if (spinning) {
      yaw += 0.004;
      draw();
    }
    requestAnimationFrame(tick);
  };

  // ---- Pointer: drag to rotate, hover for details, click to select ----
  const toSvg = (event) => {
    const box = svg.getBoundingClientRect();
    const s = box.width / W;
    return { x: (event.clientX - box.left) / s, y: (event.clientY - box.top) / s, s };
  };
  function pointAt(event) {
    const { x, y, s } = toSvg(event);
    let best = null, bestDist = Infinity;
    projected.forEach((p, i) => {
      // Prefer nearer points when two overlap on screen
      const d = Math.hypot(p.x - x, p.y - y) + p.depth * 4;
      if (d < bestDist) { best = i; bestDist = d; }
    });
    return bestDist * s <= HIT ? best : null;
  }
  function showTooltip(i, event) {
    hovered = i;
    if (i === null) { tooltip.style.display = 'none'; return; }
    const p = people[i];
    tooltip.replaceChildren(
      html('strong', '', p.name),
      html('div', 'caption', 'True closest: ' + model().neighbours[i].map((j) => people[j].name).join(', ')),
      html('div', 'caption', 'Click to select'),
    );
    const cardBox = mapCard.getBoundingClientRect();
    tooltip.style.display = 'block';
    let left = event.clientX - cardBox.left + 14;
    if (left + tooltip.offsetWidth > cardBox.width - 8) left -= tooltip.offsetWidth + 28;
    tooltip.style.left = left + 'px';
    tooltip.style.top = event.clientY - cardBox.top + 12 + 'px';
  }

  let drag = null;
  svg.addEventListener('pointerdown', (event) => {
    drag = { x: event.clientX, y: event.clientY, moved: false };
    svg.setPointerCapture(event.pointerId);
  });
  svg.addEventListener('pointermove', (event) => {
    if (drag) {
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      if (!drag.moved) { drag.moved = true; svg.classList.add('dragging'); setSpinning(false); showTooltip(null); }
      yaw += dx * 0.01;
      pitch = Math.max(-1.5, Math.min(1.5, pitch - dy * 0.01));
      drag.x = event.clientX;
      drag.y = event.clientY;
      draw();
      return;
    }
    const i = pointAt(event);
    if (i !== hovered) { showTooltip(i, event); draw(); }
    else if (i !== null) showTooltip(i, event);
  });
  svg.addEventListener('pointerup', (event) => {
    if (drag && !drag.moved) {
      const i = pointAt(event);
      if (i !== null) select(i);
    }
    drag = null;
    svg.classList.remove('dragging');
  });
  svg.addEventListener('pointerleave', () => {
    if (drag) return;
    showTooltip(null);
    draw();
  });
  svg.addEventListener('keydown', (event) => {
    const turn = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] }[event.key];
    if (!turn) return;
    event.preventDefault();
    setSpinning(false);
    yaw += turn[0];
    pitch = Math.max(-1.5, Math.min(1.5, pitch + turn[1]));
    draw();
  });

  personSelect.value = String(selected);
  build();
  // Spinning helps the eye read depth, but not for people who prefer less motion
  setSpinning(!reduceMotion);
  tick();
</script>
</body>
</html>
`;
}
