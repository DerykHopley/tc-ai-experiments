import type { Comparison, Tags } from './model-comparison.ts';
import type { ScatterPanel } from './tsne-scatter.ts';
import { THEME_CSS } from './page-theme.ts';

export type ComparisonPageData = {
  title: string;
  subtitle: string;
  panels: ScatterPanel[];
  comparison: Comparison;
  tags: Tags;
  dims: Record<string, number>; // embedding size per model
  skipped: { model: string; reason: string }[];
};

// A self-contained HTML page comparing how embedding models relate the same people
export function renderComparisonHtml(page: ComparisonPageData): string {
  // Escape "<" so the data can't close the <script> tag early
  const data = JSON.stringify(page).replace(/</g, '\\u003c');
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escape(page.title)}</title>
<style>
${THEME_CSS}  body { margin: 0; }
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
  .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
  h1 { font-size: 1.15rem; font-weight: 600; margin: 0 0 0.3rem; }
  h2 { font-size: 1rem; font-weight: 600; margin: 0 0 0.25rem; }
  .subtitle, .explain { color: var(--text-secondary); font-size: 0.85rem; margin: 0; max-width: 50rem; line-height: 1.45; }
  .explain { margin-bottom: 0.9rem; }
  .meta { color: var(--text-muted); font-size: 0.78rem; margin: 0.6rem 0 0; }
  .findings { margin: 0.75rem 0 0; padding-left: 1.1rem; font-size: 0.88rem; line-height: 1.5; }
  .findings.story li, .findings.limits li { margin-bottom: 0.55rem; max-width: 52rem; }
  .person-link {
    font: inherit; font-weight: 600; color: var(--text-primary); background: none; border: none; padding: 0; cursor: pointer;
    text-decoration: underline; text-decoration-color: var(--baseline); text-underline-offset: 2px;
  }
  .person-link:hover, .person-link:focus-visible { text-decoration-color: var(--text-primary); }
  button.toggle, .switcher button {
    font: inherit; font-size: 0.8rem; color: var(--text-secondary);
    background: none; border: 1px solid var(--border); border-radius: 6px;
    padding: 0.35rem 0.7rem; cursor: pointer; white-space: nowrap;
  }
  button.toggle:hover, .switcher button:hover { color: var(--text-primary); }
  .controls { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.75rem 1.5rem; margin-bottom: 0.25rem; }
  .switcher { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; }
  .switcher-label { color: var(--text-muted); font-size: 0.78rem; margin-right: 0.15rem; }
  .switcher button[aria-pressed="true"] { color: var(--text-primary); border-color: var(--text-secondary); font-weight: 600; }

  /* Heatmap */
  .heatmap { display: grid; gap: 2px; width: max-content; max-width: 100%; font-size: 0.8rem; }
  .heatmap .col-label, .heatmap .row-label { color: var(--text-secondary); display: flex; align-items: center; }
  .heatmap .col-label { justify-content: center; text-align: center; padding: 0 0.25rem 0.3rem; font-size: 0.75rem; }
  .heatmap .row-label { justify-content: flex-end; padding-right: 0.6rem; }
  .heatmap .cell {
    width: 100%; min-width: 6.5rem; height: 3rem; border: none; border-radius: 4px; font: inherit;
    font-size: 0.95rem; font-weight: 600; cursor: default; outline-offset: 2px;
  }
  .heatmap .cell.self { background: var(--wash); color: var(--text-muted); font-weight: 400; }
  .heatmap .cell:not(.self):hover, .heatmap .cell:not(.self):focus { outline: 2px solid var(--text-primary); }
  .scale { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.75rem; color: var(--text-muted); font-size: 0.75rem; }
  .scale span.swatch { display: inline-block; width: 1.6rem; height: 0.7rem; border-radius: 2px; }
  .readout { min-height: 1.3em; margin: 0.6rem 0 0; font-size: 0.85rem; color: var(--text-secondary); }

  /* Bar rows (traits and ranking) */
  .traits { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; }
  .bars { position: relative; font-size: 0.8rem; padding-bottom: 1.6rem; }
  .bars h3 { font-size: 0.85rem; font-weight: 600; margin: 0 0 0.5rem; }
  .bar-row { display: grid; grid-template-columns: 9.5rem 1fr 3rem; align-items: center; gap: 0.5rem; height: 1.6rem; }
  .bar-row .name { color: var(--text-secondary); text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar-row .track { position: relative; height: 100%; border-left: 1px solid var(--baseline); }
  .bar-row .bar { position: absolute; left: 0; top: 50%; transform: translateY(-50%); height: 0.75rem; background: var(--series-1); border-radius: 0 4px 4px 0; }
  .bar-row .value { color: var(--text-primary); font-variant-numeric: tabular-nums; }
  .chance { position: absolute; top: 1.9rem; bottom: -0.2rem; border-left: 1px solid var(--text-muted); pointer-events: none; }
  .chance-label { position: absolute; bottom: -1.3rem; transform: translateX(-50%); color: var(--text-muted); font-size: 0.72rem; white-space: nowrap; }

  /* Who changes most */
  .split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); gap: 1.5rem; align-items: start; }
  @media (max-width: 860px) { .split { grid-template-columns: 1fr; } }
  .ranking { max-height: 34rem; overflow-y: auto; padding-right: 0.5rem; scrollbar-width: thin; scrollbar-color: var(--baseline) transparent; }
  .ranking .axis { display: grid; grid-template-columns: 9.5rem 1fr 3rem; gap: 0.5rem; color: var(--text-muted); font-size: 0.72rem; position: sticky; top: 0; background: var(--surface-1); padding-bottom: 0.25rem; z-index: 1; }
  .ranking .axis .ticks { display: flex; justify-content: space-between; }
  .ranking .bar-row { width: 100%; border: none; background: none; font: inherit; font-size: 0.8rem; padding: 0; cursor: pointer; border-radius: 4px; }
  .ranking .bar-row:hover, .ranking .bar-row:focus { background: var(--wash); outline: none; }
  .ranking .bar-row.selected { background: var(--wash); }
  .ranking .bar-row.selected .name { color: var(--text-primary); font-weight: 600; }
  .person { position: sticky; top: 1rem; }
  .person h3 { font-size: 1rem; margin: 0; }
  .person .sub { color: var(--text-muted); font-size: 0.78rem; margin: 0.15rem 0 0.8rem; }
  .model-lists { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 0.9rem; }
  .model-lists h4 { font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); margin: 0 0 0.35rem; }
  .model-lists ol { margin: 0; padding-left: 1.1rem; font-size: 0.82rem; line-height: 1.35; }
  .model-lists li { margin-bottom: 0.3rem; }
  .model-lists .same { color: var(--text-secondary); }
  .model-lists .diff { color: var(--text-primary); font-weight: 600; }
  .model-lists .tag { display: block; color: var(--text-muted); font-size: 0.72rem; font-weight: 400; }
  .model-lists .sim { color: var(--text-muted); font-weight: 400; font-variant-numeric: tabular-nums; }
  .key { color: var(--text-muted); font-size: 0.75rem; margin-top: 0.8rem; }

  /* Map */
  svg.map { display: block; width: 100%; height: auto; margin-top: 0.5rem; touch-action: none; }
  .point { fill: var(--series-1); stroke: var(--surface-1); stroke-width: 2; outline: none; cursor: pointer; }
  .point.active { stroke: var(--text-primary); }
  .point.neighbor { stroke: var(--text-secondary); }
  .link { stroke: var(--hairline); stroke-width: 1; }
  .link.active { stroke: var(--text-secondary); stroke-width: 1.5; }
  .label { fill: var(--text-secondary); font-size: 11px; pointer-events: none; }
  .label.dim { opacity: 0.35; }
  .label.callout { fill: var(--text-primary); font-weight: 600; }
  .tooltip {
    position: absolute; pointer-events: none; display: none;
    background: var(--surface-1); color: var(--text-primary);
    border: 1px solid var(--border); border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    padding: 0.55rem 0.7rem; font-size: 0.8rem; min-width: 13rem; z-index: 3;
  }
  .tooltip strong { display: block; font-size: 0.9rem; margin-bottom: 0.3rem; }
  .tooltip .caption { color: var(--text-muted); font-size: 0.72rem; margin: 0.4rem 0 0.15rem; }
  .tooltip .row { display: flex; justify-content: space-between; gap: 1rem; color: var(--text-secondary); }
  .tooltip .row span:last-child { color: var(--text-primary); font-variant-numeric: tabular-nums; }

  table { width: 100%; border-collapse: collapse; font-size: 0.78rem; margin-top: 1rem; }
  th, td { text-align: left; vertical-align: top; padding: 0.35rem 0.75rem 0.35rem 0; border-bottom: 1px solid var(--hairline); }
  th { color: var(--text-secondary); font-weight: 600; }
  td.num { font-variant-numeric: tabular-nums; color: var(--text-secondary); }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<div class="viz-root">
<main>
  <section class="card">
    <div class="head">
      <div>
        <h1 id="title"></h1>
        <p class="subtitle" id="subtitle"></p>
      </div>
      <button class="toggle" id="toggle" aria-controls="table-view" aria-expanded="false">Show data table</button>
    </div>
    <ul class="findings" id="findings"></ul>
    <p class="meta" id="meta"></p>
    <div id="table-view" hidden></div>
  </section>

  <section class="card">
    <h2>What we found</h2>
    <p class="explain">The numbers below come from this run. The explanations are hypotheses we haven't tested yet. Select a name to see that person's neighbours under every model.</p>
    <ul class="findings story" id="story"></ul>
  </section>

  <section class="card">
    <h2>Which models agree?</h2>
    <p class="explain">Each cell is how many of a person's 3 closest neighbours two models have in common, averaged over all 68 people. 3 means identical neighbour lists for everyone; 0 means no overlap at all. The colours span the lowest to the highest value in the grid, not 0 to 3, so small differences show.</p>
    <div class="heatmap" id="heatmap"></div>
    <div class="scale" id="scale"></div>
    <p class="readout" id="heatmap-readout" aria-live="polite"></p>
  </section>

  <section class="card">
    <h2>What do the closest neighbours have in common?</h2>
    <p class="explain">The share of each person's closest neighbours who work in the same field, or are the same gender. The grey line is what you'd get by picking neighbours at random. The further a bar is above it, the more that model groups people by that trait.</p>
    <div class="traits" id="traits"></div>
  </section>

  <section class="card" id="changes">
    <h2>Who changes most between models?</h2>
    <p class="explain">People ranked by how much the models agree on their closest neighbours, least agreement first. Select a person to compare their neighbours under every model.</p>
    <div class="split">
      <div class="ranking" id="ranking"></div>
      <div class="person" id="person" aria-live="polite"></div>
    </div>
  </section>

  <section class="card" id="map-card">
    <h2>Explore one model's map</h2>
    <p class="explain">t-SNE projection of one model's embeddings. Grey lines link each person to their 3 closest neighbours. Hover over a point for details; click it to compare that person above. Each map is laid out independently, so compare who is near whom, not where.</p>
    <p class="explain">Perplexity sets roughly how many neighbours each person's position takes into account. Low values keep small, tight groups; higher values also arrange whole groups relative to each other. Compare Marie Curie at 10 and 30.</p>
    <div class="controls">
      <div class="switcher" id="switcher" role="group" aria-label="Model"></div>
      <div class="switcher" id="perplexity-switcher" role="group" aria-label="Perplexity"></div>
    </div>
    <svg class="map" id="map" viewBox="0 0 960 640" role="group"></svg>
    <div class="tooltip" id="tooltip" role="status"></div>
  </section>

  <section class="card">
    <h2>Limits</h2>
    <ul class="findings limits">
      <li><strong>The field and gender tags were assigned by hand</strong>, one field per person, and some are judgement calls (Leonardo is tagged as art, Franklin as science). The field scores are only as good as those choices.</li>
      <li><strong>Results drift between runs.</strong> The embeddings API returns slightly different vectors on each call, so neighbour lists and maps can shift. We haven't measured how large this noise is, so treat small differences, such as 0.1 in the agreement grid, with caution.</li>
      <li><strong>The sample is small.</strong> For one person and one pair of models, agreement can only be 0, 1, 2 or 3 shared neighbours, so a single person's score rests on very few comparisons.</li>
      <li><strong>One short biography per person, all from one source.</strong> The results describe how these texts are written as much as how the models behave.</li>
      <li><strong>Similarity scores and map positions are per model.</strong> Compare rankings and who is near whom, not raw scores or positions across models.</li>
    </ul>
  </section>
</main>
</div>
<script id="data" type="application/json">${data}</script>
<script>
  const page = JSON.parse(document.getElementById('data').textContent);
  const { panels, comparison, tags } = page;
  const models = comparison.models;
  const k = comparison.k;
  const short = (model) => model.split('/').pop();
  const pct = (x) => Math.round(x * 100) + '%';
  const html = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const neighbours = panels.map((panel) => new Map(panel.points.map((p) => [p.name, p.neighbors])));
  let selected = comparison.stability[0].name;
  const listeners = [];
  const select = (name) => {
    selected = name;
    listeners.forEach((fn) => fn(name));
  };

  // ---- Header ----
  document.getElementById('title').textContent = page.title;
  document.getElementById('subtitle').textContent = page.subtitle;
  const meta = models.map((m) => short(m) + ' (' + page.dims[m] + ' dimensions)').join(' · ');
  const skipped = page.skipped.map((s) => short(s.model) + ': ' + s.reason).join('; ');
  document.getElementById('meta').textContent = 'Models: ' + meta + (skipped ? '. Skipped: ' + skipped : '');

  const findings = document.getElementById('findings');
  if (models.length >= 2) {
    const pairs = [];
    models.forEach((a, i) => models.forEach((b, j) => { if (i < j) pairs.push({ a, b, v: comparison.agreement[i][j] }); }));
    pairs.sort((x, y) => y.v - x.v);
    const most = pairs[0], least = pairs[pairs.length - 1];
    findings.append(html('li', '', 'Most alike: ' + short(most.a) + ' and ' + short(most.b) + ' share ' + most.v.toFixed(1) + ' of ' + k + ' neighbours on average.'));
    if (pairs.length > 1) {
      findings.append(html('li', '', 'Least alike: ' + short(least.a) + ' and ' + short(least.b) + ' share ' + least.v.toFixed(1) + ' of ' + k + '.'));
    }
    const unstable = comparison.stability.filter((s) => s.agreement < 0.5).length;
    findings.append(html('li', '', unstable + ' of ' + comparison.stability.length + ' people have less than half their neighbours in common across models; ' +
      comparison.stability.filter((s) => s.agreement === 1).length + ' have identical neighbours in every model.'));
  }

  // ---- What we found ----
  // Built from the data so the numbers stay right after a rerun. Each finding is
  // skipped if the people it is about aren't in the data.
  const story = document.getElementById('story');
  const changes = document.getElementById('changes');
  const personLink = (name) => {
    const b = html('button', 'person-link', name);
    b.addEventListener('click', () => {
      select(name);
      changes.scrollIntoView({ behavior: 'smooth' });
    });
    return b;
  };
  const addFinding = (title, parts) => {
    const li = html('li');
    li.append(html('strong', '', title + ' '));
    parts.forEach((part) => li.append(typeof part === 'string' ? document.createTextNode(part) : part));
    story.append(li);
  };
  const pctRange = (xs) => {
    const lo = pct(Math.min(...xs)), hi = pct(Math.max(...xs));
    return lo === hi ? lo : lo.replace('%', '') + '–' + hi;
  };
  const listNames = (names) => (names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]);
  const closest = (i, name) => neighbours[i].get(name).map((n) => n.name);

  // 1. Gender
  const { gender, field } = comparison.traits;
  addFinding('Every model groups people by gender.', [
    pctRange(gender.scores.map((s) => s.share)) + ' of closest neighbours share a person\\'s gender, against ' + pct(gender.chance) +
      ' if neighbours were picked at random. (Same field: ' + pctRange(field.scores.map((s) => s.share)) + ' against ' + pct(field.chance) + '.) ' +
      'A likely cause, not yet tested: many women\\'s biographies are framed around being “the first woman to…”, ' +
      'so the models may be matching that wording rather than what the person did.',
  ]);

  // 2. Marie Curie across models
  const curie = 'Marie Curie', einstein = 'Albert Einstein';
  if (tags[curie] && tags[einstein]) {
    const rank = comparison.stability.findIndex((s) => s.name === curie);
    const withEinstein = models.filter((_, i) => closest(i, curie).includes(einstein));
    const others = [...new Set(models.flatMap((_, i) => closest(i, curie)))].filter((n) => n !== einstein);
    const women = others.filter((n) => tags[n].gender === tags[curie].gender);
    const oneSided = models.filter((_, i) => closest(i, curie).includes(einstein) && !closest(i, einstein).includes(curie));
    const parts = [
      personLink(curie),
      (rank === 0 ? ' is the person the models agree on least' : ' ranks #' + (rank + 1) + ' for disagreement between models') +
        ' (' + pct(comparison.stability[rank].agreement) + '). ' +
        'Einstein is among her 3 closest in ' + withEinstein.length + ' of ' + models.length + ' models. ' +
        'Her other neighbours across all models are ' + listNames(others) + ': ' + women.length + ' of ' + others.length + ' are women.',
    ];
    if (oneSided.length) {
      parts.push(' The link is one-sided: in ' + listNames(oneSided.map(short)) + ', she is not among Einstein\\'s 3 closest.');
    }
    addFinding('Marie Curie sits between women and scientists.', parts);

    // 3. Marie Curie on the first model's map. Exact distances on a t-SNE map change with the
    // random start (seed), so only state what held for every seed we tried: who her nearest points are.
    const layouts = panels[0].layouts;
    if (layouts.length) {
      const names = panels[0].points.map((p) => p.name);
      const nearestOnMap = (layout) => {
        const at = (name) => layout.positions[names.indexOf(name)];
        const [cx, cy] = at(curie);
        return names.filter((n) => n !== curie)
          .sort((a, b) => Math.hypot(at(a)[0] - cx, at(a)[1] - cy) - Math.hypot(at(b)[0] - cx, at(b)[1] - cy))
          .slice(0, 3);
      };
      const nearest = layouts.map(nearestOnMap);
      const allWomen = nearest.every((names3) => names3.every((n) => tags[n].gender === tags[curie].gender));
      const einsteinRank = closest(0, curie).indexOf(einstein) + 1;
      const perplexities = listNames(layouts.map((l) => String(l.perplexity)));
      if (allWomen && einsteinRank && !nearest.some((names3) => names3.includes(einstein))) {
        addFinding('The map hides her link to Einstein.', [
          'On the ' + short(models[0]) + ' map, her 3 nearest points are women at every perplexity (' + perplexities + '), ' +
            'although Einstein is her ' + ['', '1st', '2nd', '3rd'][einsteinRank] + ' closest in the full embeddings. ' +
            'How far away he lands changes with the random start of the layout, so read the map for groups, not exact distances.',
        ]);
      } else {
        addFinding('Her nearest points on the map:', [
          layouts.map((l, i) => listNames(nearest[i]) + ' at perplexity ' + l.perplexity).join('; ') + ' (' + short(models[0]) + ').',
        ]);
      }
    }
  }

  // 4. Shakespeare: writer or "famous genius"?
  const bard = 'William Shakespeare';
  if (tags[bard]) {
    const sameField = models.map((_, i) => closest(i, bard).filter((n) => tags[n].field === tags[bard].field).length);
    const odd = models.map((m, i) => ({ m, i })).filter(({ i }) => sameField[i] <= 1);
    const mostly = sameField.filter((c) => c >= 2).length;
    if (odd.length && mostly) {
      addFinding('Models disagree on what kind of person someone is.', [
        personLink(bard),
        ' has at least 2 writers among his 3 closest in ' + mostly + ' of ' + models.length + ' models. ' +
          odd.map(({ m, i }) => 'In ' + short(m) + ' they are ' + listNames(closest(i, bard)) +
            ' (' + (sameField[i] === 0 ? 'no writers' : '1 writer') + ').').join(' '),
      ]);
    }
  }

  // ---- Heatmap ----
  const heatmap = document.getElementById('heatmap');
  heatmap.style.gridTemplateColumns = 'auto repeat(' + models.length + ', auto)';
  // Spread the 5 colour steps over the observed range: all values sit close together
  // (around 2 of 3), so a 0..k scale would give every cell the same colour
  const offDiagonal = models.flatMap((_, i) => models.map((_, j) => comparison.agreement[i][j]).filter((_, j) => j !== i));
  const lo = Math.min(...offDiagonal), hi = Math.max(...offDiagonal);
  const bin = (v) => (hi > lo ? 1 + Math.min(4, Math.floor(((v - lo) / (hi - lo)) * 5)) : 3); // lo..hi -> 1..5
  const readout = document.getElementById('heatmap-readout');
  heatmap.append(html('div'));
  models.forEach((m) => heatmap.append(html('div', 'col-label', short(m))));
  models.forEach((a, i) => {
    heatmap.append(html('div', 'row-label', short(a)));
    models.forEach((b, j) => {
      const cell = html('button', 'cell');
      if (i === j) {
        cell.classList.add('self');
        cell.textContent = '—';
        cell.setAttribute('aria-label', short(a) + ' compared with itself');
        cell.tabIndex = -1;
      } else {
        const v = comparison.agreement[i][j];
        const b5 = bin(v);
        cell.style.background = 'var(--seq-' + b5 + ')';
        cell.style.color = 'var(--seq-ink-' + b5 + ')';
        cell.textContent = v.toFixed(2);
        const text = short(a) + ' and ' + short(b) + ': on average ' + v.toFixed(2) + ' of ' + k + ' closest neighbours are the same.';
        cell.setAttribute('aria-label', text);
        const show = () => (readout.textContent = text);
        cell.addEventListener('pointerenter', show);
        cell.addEventListener('focus', show);
      }
      heatmap.append(cell);
    });
  });
  heatmap.addEventListener('pointerleave', () => (readout.textContent = ''));
  const scale = document.getElementById('scale');
  scale.append(html('span', '', lo.toFixed(2)));
  [1, 2, 3, 4, 5].forEach((b) => {
    const s = html('span', 'swatch');
    s.style.background = 'var(--seq-' + b + ')';
    scale.append(s);
  });
  scale.append(html('span', '', hi.toFixed(2) + ' shared neighbours (of ' + k + ')'));

  // ---- Traits ----
  const traitNames = { field: 'Same field', gender: 'Same gender' };
  const traitsEl = document.getElementById('traits');
  Object.entries(comparison.traits).forEach(([trait, { chance, scores }]) => {
    const box = html('div', 'bars');
    box.append(html('h3', '', traitNames[trait]));
    scores.forEach((s) => {
      const row = html('div', 'bar-row');
      const bar = html('div', 'bar');
      bar.style.width = s.share * 100 + '%';
      const track = html('div', 'track');
      track.append(bar);
      row.append(html('span', 'name', short(s.model)), track, html('span', 'value', pct(s.share)));
      box.append(row);
    });
    traitsEl.append(box);
    // Chance marker, positioned inside the track column once laid out
    requestAnimationFrame(() => {
      const track = box.querySelector('.track');
      const left = track.offsetLeft + track.offsetWidth * chance;
      const line = html('div', 'chance');
      line.style.left = left + 'px';
      line.style.height = box.querySelectorAll('.bar-row').length * track.parentElement.offsetHeight + 'px';
      const label = html('span', 'chance-label', 'random: ' + pct(chance));
      line.append(label);
      box.append(line);
    });
  });

  // ---- Who changes most ----
  const ranking = document.getElementById('ranking');
  const axis = html('div', 'axis');
  const ticks = html('div', 'ticks');
  ['0%', '50%', '100%'].forEach((t) => ticks.append(html('span', '', t)));
  axis.append(html('span', '', 'Agreement across models'), ticks, html('span'));
  ranking.append(axis);
  const rows = new Map();
  comparison.stability.forEach(({ name, agreement }) => {
    const row = html('button', 'bar-row');
    const track = html('div', 'track');
    const bar = html('div', 'bar');
    bar.style.width = agreement * 100 + '%';
    track.append(bar);
    row.append(html('span', 'name', name), track, html('span', 'value', pct(agreement)));
    row.setAttribute('aria-label', name + ': ' + pct(agreement) + ' agreement');
    row.addEventListener('click', () => select(name));
    row.addEventListener('focus', () => select(name));
    ranking.append(row);
    rows.set(name, row);
  });

  const person = document.getElementById('person');
  function renderPerson(name) {
    rows.forEach((row, n) => row.classList.toggle('selected', n === name));
    person.replaceChildren();
    const t = tags[name];
    const stability = comparison.stability.find((s) => s.name === name);
    person.append(html('h3', '', name), html('p', 'sub', t.field + ' · ' + t.gender + ' · ' + pct(stability.agreement) + ' agreement across models'));
    const lists = html('div', 'model-lists');
    const inAll = (other) => neighbours.every((map) => map.get(name).some((n) => n.name === other));
    models.forEach((m, i) => {
      const col = html('div');
      col.append(html('h4', '', short(m)));
      const ol = html('ol');
      neighbours[i].get(name).forEach((n) => {
        const li = html('li', inAll(n.name) ? 'same' : 'diff');
        li.append(document.createTextNode(n.name + ' '), html('span', 'sim', n.similarity.toFixed(2)));
        const nt = tags[n.name];
        const shared = [nt.field === t.field ? 'same field' : nt.field, nt.gender === t.gender ? 'same gender' : nt.gender];
        li.append(html('span', 'tag', shared.join(' · ')));
        ol.append(li);
      });
      col.append(ol);
      lists.append(col);
    });
    person.append(lists, html('p', 'key', 'Bold names are not in every model\\'s list. Numbers are similarity scores, comparable only within one model.'));
  }
  listeners.push(renderPerson);

  // ---- Map ----
  const W = 960, H = 640, PAD = 28, R = 5, HIT = 24;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('map');
  const tooltip = document.getElementById('tooltip');
  const mapCard = document.getElementById('map-card');
  let mapIndex = 0;
  let layoutIndex = 0;
  let map = null;

  const el = (tag, attrs, parent) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, v] of Object.entries(attrs)) node.setAttribute(key, v);
    parent.appendChild(node);
    return node;
  };

  // A row of toggle buttons; pick(i) runs when button i is pressed
  function makeSwitcher(id, label, options, pick) {
    const container = document.getElementById(id);
    if (label) container.append(html('span', 'switcher-label', label));
    options.forEach((text, i) => {
      const b = html('button', '', text);
      b.setAttribute('aria-pressed', String(i === 0));
      b.addEventListener('click', () => {
        pick(i);
        container.querySelectorAll('button').forEach((x, j) => x.setAttribute('aria-pressed', String(j === i)));
        buildMap();
      });
      container.append(b);
    });
  }
  makeSwitcher('switcher', '', models.map(short), (i) => (mapIndex = i));
  makeSwitcher('perplexity-switcher', 'Perplexity', panels[0].layouts.map((l) => String(l.perplexity)), (i) => (layoutIndex = i));

  function buildMap() {
    svg.replaceChildren();
    tooltip.style.display = 'none';
    const panel = panels[mapIndex];
    const layout = panel.layouts[layoutIndex];
    svg.setAttribute('aria-label', 'Map for ' + panel.title + ' at perplexity ' + layout.perplexity);
    const points = panel.points.map((p, i) => ({ ...p, x: layout.positions[i][0], y: layout.positions[i][1], edges: [] }));
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const scaleXY = Math.min((W - 2 * PAD) / (maxX - minX || 1), (H - 2 * PAD) / (maxY - minY || 1));
    const offX = (W - (maxX - minX) * scaleXY) / 2, offY = (H - (maxY - minY) * scaleXY) / 2;
    points.forEach((p) => {
      p.cx = offX + (p.x - minX) * scaleXY;
      p.cy = offY + (p.y - minY) * scaleXY;
    });
    const byName = new Map(points.map((p) => [p.name, p]));
    const links = el('g', {}, svg), labels = el('g', {}, svg), dots = el('g', {}, svg);

    // Link every point to its closest neighbours, drawing each pair once
    const seen = new Set();
    points.forEach((p) => p.neighbors.forEach((n) => {
      const q = byName.get(n.name);
      const key = [p.name, q.name].sort().join('|');
      if (seen.has(key)) return;
      seen.add(key);
      const edge = { line: el('line', { class: 'link', x1: p.cx, y1: p.cy, x2: q.cx, y2: q.cy }, links), a: p, b: q };
      p.edges.push(edge);
      q.edges.push(edge);
    }));
    const other = (edge, p) => (edge.a === p ? edge.b : edge.a);

    points.forEach((p) => {
      p.dot = el('circle', { class: 'point', cx: p.cx, cy: p.cy, r: R, tabindex: 0 }, dots);
      p.dot.setAttribute('aria-label', p.name + '. Closest: ' + p.neighbors.map((n) => n.name).join(', '));
      p.dot.addEventListener('focus', () => hover(p));
      p.dot.addEventListener('blur', () => hover(null));
      p.dot.addEventListener('click', () => select(p.name));
    });

    // Place each name beside its point where it fits without overlapping anything
    const placed = points.map((p) => ({ x0: p.cx - R - 2, y0: p.cy - R - 2, x1: p.cx + R + 2, y1: p.cy + R + 2, owner: p }));
    const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    points.forEach((p) => {
      const text = el('text', { class: 'label' }, labels);
      text.textContent = p.name;
      const { width, height } = text.getBBox();
      const gap = R + 4;
      const options = [
        [p.cx + gap, p.cy + height / 3],
        [p.cx - gap - width, p.cy + height / 3],
        [p.cx - width / 2, p.cy - gap],
        [p.cx - width / 2, p.cy + gap + height * 0.75],
      ];
      const spot = options.find(([x, y]) => {
        const box = { x0: x - 1, y0: y - height * 0.8, x1: x + width + 1, y1: y + height * 0.25 };
        if (box.x0 < 0 || box.x1 > W || box.y0 < 0 || box.y1 > H) return false;
        if (placed.some((b) => b.owner !== p && overlaps(box, b))) return false;
        placed.push({ ...box, owner: p });
        return true;
      });
      if (spot) {
        text.setAttribute('x', spot[0]);
        text.setAttribute('y', spot[1]);
        p.label = text;
      } else {
        text.remove();
      }
    });

    let callout = null;
    function highlight(p) {
      links.querySelectorAll('.link.active').forEach((line) => line.classList.remove('active'));
      points.forEach((q) => {
        q.dot.classList.remove('active', 'neighbor');
        q.dot.setAttribute('r', R);
        if (q.label) q.label.classList.remove('dim');
      });
      if (callout) { callout.remove(); callout = null; }
      if (!p) return;
      p.dot.classList.add('active');
      p.dot.setAttribute('r', R + 2);
      dots.appendChild(p.dot);
      p.edges.forEach((edge) => {
        edge.line.classList.add('active');
        links.appendChild(edge.line);
        other(edge, p).dot.classList.add('neighbor');
      });
      const connected = new Set(p.edges.map((edge) => other(edge, p)));
      points.forEach((q) => q.label && q.label.classList.toggle('dim', q !== p && !connected.has(q)));
      if (!p.label) {
        callout = el('text', { class: 'label callout', x: p.cx + R + 6, y: p.cy - R - 4 }, svg);
        callout.textContent = p.name;
      }
    }

    // Hovering shows a point temporarily; otherwise the selected person stays highlighted
    function hover(p) {
      highlight(p || byName.get(selected));
      if (!p) { tooltip.style.display = 'none'; return; }
      tooltip.replaceChildren(html('strong', '', p.name), html('div', 'caption', 'Closest in ' + short(panel.title)));
      p.neighbors.forEach((n) => {
        const row = html('div', 'row');
        row.append(html('span', '', n.name), html('span', '', n.similarity.toFixed(2)));
        tooltip.append(row);
      });
      tooltip.append(html('div', 'caption', 'Click to compare across models'));
      const svgBox = svg.getBoundingClientRect(), cardBox = mapCard.getBoundingClientRect();
      const s = svgBox.width / W;
      tooltip.style.display = 'block';
      let left = svgBox.left - cardBox.left + p.cx * s + 14;
      const top = svgBox.top - cardBox.top + p.cy * s - 10;
      if (left + tooltip.offsetWidth > cardBox.width - 8) left -= tooltip.offsetWidth + 28;
      tooltip.style.left = left + 'px';
      tooltip.style.top = top + 'px';
    }

    let current = null;
    svg.onpointermove = (event) => {
      const box = svg.getBoundingClientRect();
      const s = box.width / W;
      const mx = (event.clientX - box.left) / s, my = (event.clientY - box.top) / s;
      let best = null, bestDist = Infinity;
      points.forEach((p) => {
        const d = Math.hypot(p.cx - mx, p.cy - my);
        if (d < bestDist) { best = p; bestDist = d; }
      });
      const next = bestDist * s <= HIT ? best : null;
      if (next === current) return;
      current = next;
      hover(next);
    };
    svg.onpointerleave = () => { current = null; hover(null); };
    svg.onclick = () => { if (current) select(current.name); };

    map = { highlight: (name) => highlight(byName.get(name)) };
    map.highlight(selected);
  }
  listeners.push((name) => map && map.highlight(name));
  buildMap();

  // ---- Data table ----
  const toggle = document.getElementById('toggle');
  const tableView = document.getElementById('table-view');
  const table = document.createElement('table');
  const headRow = table.createTHead().insertRow();
  ['Name', 'Field', 'Agreement', ...models.map(short)].forEach((h) => headRow.appendChild(html('th', '', h)));
  const body = table.createTBody();
  [...comparison.stability].sort((a, b) => a.name.localeCompare(b.name)).forEach(({ name, agreement }) => {
    const row = body.insertRow();
    row.insertCell().textContent = name;
    row.insertCell().textContent = tags[name].field;
    const c = row.insertCell();
    c.className = 'num';
    c.textContent = pct(agreement);
    neighbours.forEach((map) => {
      row.insertCell().textContent = map.get(name).map((n) => n.name + ' (' + n.similarity.toFixed(2) + ')').join(', ');
    });
  });
  tableView.appendChild(table);
  toggle.addEventListener('click', () => {
    const open = tableView.hidden;
    tableView.hidden = !open;
    toggle.textContent = open ? 'Hide data table' : 'Show data table';
    toggle.setAttribute('aria-expanded', String(open));
  });

  select(selected);
</script>
</body>
</html>
`;
}
