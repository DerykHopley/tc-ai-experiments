// A self-contained HTML page: the chunk embeddings on a 2D t-SNE map, with
// the queries and what each one retrieves. All data is embedded as JSON.
import { THEME_CSS } from './page-theme.ts';

export type MapPoint = {
  artist: string;
  country: string;
  kind: 'profile' | 'discography';
  genres: string[];
  preview: string;
  x: number;
  y: number;
};

export type MapQuery = {
  text: string;
  x: number;
  y: number;
  // Indexes into `points`, closest first
  results: { index: number; distance: number }[];
};

export type EmbeddingMapData = {
  points: MapPoint[];
  queries: MapQuery[];
  genres: string[];
  neighbourStats: {
    kind: string;
    chunks: number;
    sameArtist: number;
    sameKind: number;
  }[];
  k: number;
};

export function renderEmbeddingMapHtml(page: EmbeddingMapData): string {
  // Escape "<" so the data can't close the <script> tag early
  const data = JSON.stringify(page).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Music Embedding Map</title>
<style>
${THEME_CSS}  body { margin: 0; background: #f9f9f7; }
  @media (prefers-color-scheme: dark) { body { background: #0d0d0d; } }
  .viz-root {
    min-height: 100vh;
    background: var(--page);
    color: var(--text-primary);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 2rem 16px;
    box-sizing: border-box;
  }
  main { max-width: 1040px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  h2 { font-size: 1.05rem; margin: 0 0 0.75rem; }
  p { color: var(--text-secondary); line-height: 1.5; margin: 0 0 0.75rem; }
  .card {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.25rem;
    margin-top: 1.25rem;
  }
  .controls { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; margin-bottom: 0.75rem; }
  label { font-size: 0.85rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 0.25rem; }
  select {
    font: inherit; font-size: 0.9rem; color: var(--text-primary);
    background: var(--page); border: 1px solid var(--border);
    border-radius: 8px; padding: 0.35rem 0.5rem; max-width: 100%;
  }
  .legend { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem; }
  .legend span { display: inline-flex; align-items: center; gap: 0.4rem; }
  .plot { position: relative; }
  #map { display: block; width: 100%; height: auto; touch-action: manipulation; }
  .legend svg { flex: none; }
  .tooltip {
    position: absolute; pointer-events: none; display: none;
    max-width: 280px; padding: 0.5rem 0.65rem;
    background: var(--surface-1); color: var(--text-primary);
    border: 1px solid var(--border); border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    font-size: 0.8rem; line-height: 1.4;
  }
  .tooltip .meta { color: var(--text-secondary); }
  .tooltip pre { white-space: pre-wrap; font: inherit; color: var(--text-muted); margin: 0.35rem 0 0; }
  table { border-collapse: collapse; width: 100%; font-size: 0.875rem; }
  th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--hairline); }
  th { color: var(--text-secondary); font-weight: 600; }
  td.num { font-variant-numeric: tabular-nums; }
  .table-wrap { overflow-x: auto; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; }
  .stat { border: 1px solid var(--hairline); border-radius: 8px; padding: 0.75rem; }
  .stat b { font-size: 1.4rem; display: block; }
  .stat span { font-size: 0.85rem; color: var(--text-secondary); }
</style>
</head>
<body>
<div class="viz-root">
<main>
  <h1>Music embedding map</h1>
  <p>Each dot is one chunk from the Chroma collection, laid out in 2D with t-SNE from its 1,536-number embedding. Chunks the model sees as similar sit close together. Distances between clusters are distorted, so read the map for who sits with whom, not for how far apart groups are.</p>

  <section class="card">
    <div class="controls">
      <label><span>Query (top <span id="k"></span> retrieved)</span>
        <select id="query"></select>
      </label>
      <label><span>Highlight genre</span>
        <select id="genre"><option value="">None</option></select>
      </label>
      <label><span>Highlight artist</span>
        <select id="artist"><option value="">None</option></select>
      </label>
    </div>
    <div class="legend" aria-label="Legend">
      <span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="var(--text-secondary)"/></svg>Profile chunk (name, tags, first releases)</span>
      <span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill="none" stroke="var(--text-secondary)" stroke-width="2"/></svg>Discography chunk (release list)</span>
      <span><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="var(--series-1)"/></svg>Highlighted genre</span>
      <span><svg width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="var(--series-3)" stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="var(--series-3)"/></svg>Highlighted artist</span>
      <span><svg width="14" height="14" aria-hidden="true"><path d="M7 1l1.8 3.9 4.2.5-3.1 2.9.8 4.2L7 10.4 3.3 12.5l.8-4.2L1 5.4l4.2-.5z" fill="var(--series-2)"/></svg>Query and its retrieved chunks</span>
    </div>
    <div class="plot">
      <svg id="map" viewBox="0 0 1000 640" role="img" aria-label="t-SNE map of chunk embeddings"></svg>
      <div class="tooltip" id="tooltip"></div>
    </div>
    <p>The query star tends to sit at the edge of the cloud, away from what it retrieved. A short question is less similar to any chunk (the best cosine distance is often around 0.5–0.6) than chunks of the same artist are to each other, so t-SNE has no close neighbours to place it among. The lines show what was retrieved; the table below gives the true distances.</p>
  </section>

  <section class="card">
    <h2 id="results-title">Retrieved chunks</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>#</th><th>Artist</th><th>Chunk</th><th>Cosine distance</th></tr></thead>
      <tbody id="results"></tbody>
    </table></div>
  </section>

  <section class="card">
    <h2>Nearest neighbours in the full 1,536 dimensions</h2>
    <p>Checked on the original vectors, not the 2D map, so t-SNE can't distort it. For each chunk: is the single most similar other chunk from the same artist, and of the same kind?</p>
    <div class="stats" id="stats"></div>
  </section>
</main>
</div>

<script id="data" type="application/json">${data}</script>
<script>
(() => {
  const page = JSON.parse(document.getElementById('data').textContent);
  const { points, queries, genres, neighbourStats, k } = page;
  const NS = 'http://www.w3.org/2000/svg';
  const W = 1000, H = 640, PAD = 24;
  const svg = document.getElementById('map');
  const tooltip = document.getElementById('tooltip');
  const querySelect = document.getElementById('query');
  const genreSelect = document.getElementById('genre');
  const artistSelect = document.getElementById('artist');
  document.getElementById('k').textContent = k;

  // Scale t-SNE coordinates (queries included) to the SVG box
  const all = [...points, ...queries];
  const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min((W - 2 * PAD) / (maxX - minX), (H - 2 * PAD) / (maxY - minY));
  const offX = (W - (maxX - minX) * scale) / 2, offY = (H - (maxY - minY) * scale) / 2;
  const sx = (x) => offX + (x - minX) * scale;
  const sy = (y) => offY + (y - minY) * scale;

  function el(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    for (const key in attrs) node.setAttribute(key, attrs[key]);
    (parent || svg).appendChild(node);
    return node;
  }

  // Fill the controls
  queries.forEach((q, i) => querySelect.add(new Option(q.text, String(i))));
  for (const genre of genres) {
    const count = new Set(points.filter((p) => p.genres.includes(genre)).map((p) => p.artist)).size;
    genreSelect.add(new Option(genre + ' (' + count + ' artists)', genre));
  }
  [...new Set(points.map((p) => p.artist))].sort((a, b) => a.localeCompare(b))
    .forEach((name) => artistSelect.add(new Option(name, name)));

  const linkLayer = el('g', {});
  const pointLayer = el('g', {});
  const queryLayer = el('g', {});
  const labelLayer = el('g', {});

  function draw() {
    const query = queries[Number(querySelect.value)];
    const genre = genreSelect.value;
    const artist = artistSelect.value;
    const retrieved = new Set(query.results.map((r) => r.index));
    const isArtist = (p) => artist && p.artist === artist;
    const inGenre = (p) => genre && p.genres.includes(genre);

    linkLayer.replaceChildren();
    pointLayer.replaceChildren();
    queryLayer.replaceChildren();
    labelLayer.replaceChildren();

    // Draw muted points first, then genre, artist and retrieved on top
    const order = points.map((p, i) => i).sort((a, b) => {
      const rank = (i) => (retrieved.has(i) ? 3 : isArtist(points[i]) ? 2 : inGenre(points[i]) ? 1 : 0);
      return rank(a) - rank(b);
    });
    for (const i of order) {
      const p = points[i];
      const color = isArtist(p) ? 'var(--series-3)' : inGenre(p) ? 'var(--series-1)' : 'var(--muted-mark)';
      const cx = sx(p.x), cy = sy(p.y);
      // The artist's outer ring sits outside the orange "retrieved" ring
      if (isArtist(p)) {
        el('circle', { cx, cy, r: 11, fill: 'none', stroke: 'var(--series-3)', 'stroke-width': 2 }, pointLayer);
      }
      if (retrieved.has(i)) {
        el('circle', { cx, cy, r: 8, fill: 'none', stroke: 'var(--series-2)', 'stroke-width': 2 }, pointLayer);
      }
      if (p.kind === 'profile') {
        el('circle', { cx, cy, r: 4.5, fill: color, stroke: 'var(--surface-1)', 'stroke-width': 2, 'paint-order': 'stroke' }, pointLayer);
      } else {
        el('circle', { cx, cy, r: 4, fill: 'var(--surface-1)', stroke: color, 'stroke-width': 2 }, pointLayer);
      }
    }

    // Name the highlighted artist above its highest chunk
    const artistPoints = points.filter(isArtist);
    if (artistPoints.length) {
      const topmost = artistPoints.reduce((a, b) => (b.y < a.y ? b : a));
      const label = el('text', {
        x: sx(topmost.x), y: sy(topmost.y) - 17, 'text-anchor': 'middle',
        fill: 'var(--text-primary)', stroke: 'var(--surface-1)', 'stroke-width': 4, 'paint-order': 'stroke',
        'font-size': 14, 'font-weight': 600,
      }, labelLayer);
      label.textContent = artist + ' (' + artistPoints.length + ' chunks)';
    }

    // The query: a star, with a line to each retrieved chunk
    const qx = sx(query.x), qy = sy(query.y);
    for (const r of query.results) {
      const p = points[r.index];
      el('line', { x1: qx, y1: qy, x2: sx(p.x), y2: sy(p.y), stroke: 'var(--series-2)', 'stroke-width': 1.5, 'stroke-opacity': 0.7 }, linkLayer);
    }
    const star = 'M0 -9 L2.6 -3.4 L8.6 -2.8 L4.1 1.3 L5.3 7.3 L0 4.3 L-5.3 7.3 L-4.1 1.3 L-8.6 -2.8 L-2.6 -3.4 Z';
    el('path', { d: star, transform: 'translate(' + qx + ' ' + qy + ') scale(1.2)', fill: 'var(--series-2)', stroke: 'var(--surface-1)', 'stroke-width': 1.5 }, queryLayer);

    // The table view of the same retrieval
    document.getElementById('results-title').textContent = 'Retrieved for "' + query.text + '"';
    const body = document.getElementById('results');
    body.replaceChildren();
    query.results.forEach((r, rank) => {
      const p = points[r.index];
      const row = body.insertRow();
      [String(rank + 1), p.artist, p.kind, r.distance.toFixed(3)].forEach((value, c) => {
        const cell = row.insertCell();
        cell.textContent = value;
        if (c === 0 || c === 3) cell.className = 'num';
      });
    });
  }

  // Hover: find the nearest point within reach (a bigger target than the dot)
  function svgPoint(event) {
    const rect = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H,
      rect,
    };
  }
  function nearest(event) {
    const { x, y } = svgPoint(event);
    let best = -1, bestDist = 14 * 14;
    points.forEach((p, i) => {
      const d = (sx(p.x) - x) ** 2 + (sy(p.y) - y) ** 2;
      if (d < bestDist) { best = i; bestDist = d; }
    });
    return best;
  }
  svg.addEventListener('mousemove', (event) => {
    const i = nearest(event);
    if (i < 0) { tooltip.style.display = 'none'; return; }
    const p = points[i];
    tooltip.replaceChildren();
    const title = document.createElement('b');
    title.textContent = p.artist;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = p.kind + ' chunk · ' + p.country + (p.genres.length ? ' · ' + p.genres.join(', ') : '');
    const text = document.createElement('pre');
    text.textContent = p.preview + '…';
    tooltip.append(title, meta, text);
    const { rect } = svgPoint(event);
    const left = Math.min(event.clientX - rect.left + 14, rect.width - 290);
    tooltip.style.left = Math.max(0, left) + 'px';
    tooltip.style.top = (event.clientY - rect.top + 14) + 'px';
    tooltip.style.display = 'block';
  });
  svg.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
  // Click a dot to highlight all chunks of that artist
  svg.addEventListener('click', (event) => {
    const i = nearest(event);
    artistSelect.value = i < 0 ? '' : points[i].artist;
    draw();
  });

  [querySelect, genreSelect, artistSelect].forEach((s) => s.addEventListener('change', draw));

  const stats = document.getElementById('stats');
  for (const s of neighbourStats) {
    for (const [value, label] of [
      [s.sameArtist, 'of ' + s.chunks + ' ' + s.kind + ' chunks have a nearest neighbour from the same artist'],
      [s.sameKind, 'of ' + s.chunks + ' ' + s.kind + ' chunks have a nearest neighbour that is also a ' + s.kind + ' chunk'],
    ]) {
      const box = document.createElement('div');
      box.className = 'stat';
      const big = document.createElement('b');
      big.textContent = Math.round((100 * value) / s.chunks) + '%';
      const small = document.createElement('span');
      small.textContent = value + ' ' + label;
      box.append(big, small);
      stats.append(box);
    }
  }

  draw();
})();
</script>
</body>
</html>
`;
}
