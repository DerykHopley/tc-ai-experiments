// A self-contained HTML page comparing evaluation runs: average scores per
// metric as a dot plot, a per-question grid for one metric at a time, and
// which artists each run retrieved.
import { THEME_CSS } from './page-theme.ts';
import type { EvalRun, QuestionResult } from './evaluation-page.ts';

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Colour follows the strategy, never the run's position. Runs repeating a
// strategy get the same colour with a hollow marker. long-context is the
// no-search baseline, not a fourth strategy: it's drawn as an ink diamond,
// because a fourth hue can't be told apart from the others when every pair
// can sit side by side (yellow vs orange fails the palette validator).
const STRATEGY_COLOUR: Record<string, string> = {
  'top-k': 'var(--series-1)',
  'two-per-artist': 'var(--series-2)',
  'one-per-artist': 'var(--series-3)',
  'long-context': 'var(--text-primary)',
};
const DIAMOND = new Set(['long-context']);

// A run's marker for the legend and column heads: circle or diamond,
// filled for a strategy's first run, hollow for repeats
function marker(
  m: { colour: string; hollow: boolean; diamond: boolean },
  size: number,
): string {
  const c = size / 2;
  const r = c - 2;
  const paint = `fill="${m.hollow ? 'var(--surface-1)' : m.colour}" stroke="${m.colour}" stroke-width="2"`;
  const shape = m.diamond
    ? `<polygon points="${c},${c - r - 0.5} ${c + r + 0.5},${c} ${c},${c + r + 0.5} ${c - r - 0.5},${c}" ${paint}/>`
    : `<circle cx="${c}" cy="${c}" r="${r}" ${paint}/>`;
  return `<svg width="${size}" height="${size}" aria-hidden="true">${shape}</svg>`;
}

type Metric = {
  key: string;
  label: string;
  value: (r: QuestionResult) => number | null | undefined;
};

const METRICS: Metric[] = [
  {
    key: 'recall',
    label: 'Context recall',
    value: (r) => r.metrics.contextRecall?.score,
  },
  {
    key: 'precision',
    label: 'Context precision',
    value: (r) => r.metrics.contextPrecision?.score,
  },
  {
    key: 'faithfulness',
    label: 'Faithfulness',
    value: (r) => r.metrics.faithfulness.score,
  },
  {
    key: 'relevancy',
    label: 'Answer relevancy',
    value: (r) => r.metrics.answerRelevancy?.score,
  },
  {
    key: 'correctness',
    label: 'Correctness',
    value: (r) => r.metrics.answerCorrectness?.score,
  },
  {
    key: 'refusal',
    label: 'Refusal right',
    value: (r) => (r.metrics.behaviour.pass ? 1 : 0),
  },
];

const mean = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export function renderComparisonHtml(runs: EvalRun[]): string {
  const questions = runs[0].results;
  const seen = new Map<string, number>();
  const meta = runs.map((run) => {
    const n = seen.get(run.config.strategy) ?? 0;
    seen.set(run.config.strategy, n + 1);
    return {
      name: run.name,
      strategy: run.config.strategy,
      colour: STRATEGY_COLOUR[run.config.strategy] ?? 'var(--text-secondary)',
      hollow: n > 0,
      diamond: DIAMOND.has(run.config.strategy),
    };
  });

  const averages = METRICS.map((m) => ({
    ...m,
    values: runs.map((run) => mean(run.results.map(m.value))),
  }));

  // Per question, per run, per metric (for the grid)
  const grid = questions.map((q) => ({
    id: q.id,
    group: q.group,
    question: q.question,
    values: Object.fromEntries(
      METRICS.map((m) => [
        m.key,
        runs.map((run) => {
          const r = run.results.find((x) => x.id === q.id);
          return r ? (m.value(r) ?? null) : null;
        }),
      ]),
    ),
  }));

  // Which artists came back, with counts, for questions with expected artists
  const retrievedRows = questions
    .filter((q) => q.expectedArtists || q.group === 'open')
    .map((q) => {
      const cells = runs
        .map((run) => {
          const r = run.results.find((x) => x.id === q.id)!;
          if (run.config.strategy === 'long-context') {
            const verdict = r.metrics.answerCorrectness?.verdict;
            return `<td class="muted">all ${r.retrieved.length} artists, no search${verdict ? `<div class="verdict">answer: ${verdict}</div>` : ''}</td>`;
          }
          const counts = new Map<string, number>();
          for (const c of r.retrieved)
            counts.set(c.artist, (counts.get(c.artist) ?? 0) + 1);
          const expected = new Set(q.expectedArtists ?? []);
          const chips = [...counts]
            .map(
              ([artist, n]) =>
                `<span class="achip${expected.has(artist) ? ' exp' : ''}">${expected.has(artist) ? '✓ ' : ''}${esc(artist)}${n > 1 ? ` <b>×${n}</b>` : ''}</span>`,
            )
            .join('');
          const missing = [...expected].filter((a) => !counts.has(a));
          const verdict = r.metrics.answerCorrectness?.verdict;
          return `<td>${chips}${missing.length ? `<div class="missing">missing: ${esc(missing.join(', '))}</div>` : ''}${verdict ? `<div class="verdict">answer: ${verdict}</div>` : ''}</td>`;
        })
        .join('');
      return `<tr><th class="q">${esc(q.question)}</th>${cells}</tr>`;
    })
    .join('');

  const legend = meta
    .map((m) => `<span class="key">${marker(m, 14)}${esc(m.name)}</span>`)
    .join('');

  const tableRows = averages
    .map(
      (a) =>
        `<tr><th>${a.label}</th>${a.values.map((v) => `<td class="tnum">${v === null ? '–' : v.toFixed(2)}</td>`).join('')}</tr>`,
    )
    .join('');

  const data = JSON.stringify({
    meta,
    averages: averages.map(({ key, label, values }) => ({
      key,
      label,
      values,
    })),
    grid,
    metrics: METRICS.map(({ key, label }) => ({ key, label })),
  }).replace(/</g, '\\u003c');
  const first = runs[0];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Retrieval Strategy Comparison</title>
<style>
${THEME_CSS}  body { margin: 0; background: #f9f9f7; }
  @media (prefers-color-scheme: dark) { body { background: #0d0d0d; } }
  .viz-root { min-height: 100vh; background: var(--page); color: var(--text-primary); font-family: system-ui, -apple-system, "Segoe UI", sans-serif; padding: 2rem 16px; box-sizing: border-box; }
  main { max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  h2 { font-size: 1.1rem; margin: 0 0 0.5rem; }
  p { color: var(--text-secondary); line-height: 1.5; margin: 0 0 0.6rem; }
  .card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; margin-top: 1rem; }
  .runlinks { font-size: 0.9rem; margin: 0.25rem 0 0; }
  .runlinks a { color: var(--text-primary); }
  .legend { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; font-size: 0.85rem; color: var(--text-secondary); margin: 0.5rem 0; }
  .key { display: inline-flex; align-items: center; gap: 0.4rem; }
  .strategies { margin: 0.25rem 0 0; padding-left: 1.1rem; color: var(--text-secondary); font-size: 0.9rem; line-height: 1.5; }
  svg#dots { display: block; width: 100%; height: auto; }
  .table-wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
  th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--hairline); vertical-align: top; }
  thead th { color: var(--text-secondary); font-weight: 600; font-size: 0.8rem; }
  .tnum { font-variant-numeric: tabular-nums; }
  details summary { cursor: pointer; color: var(--text-secondary); font-size: 0.85rem; margin-top: 0.5rem; }
  .matrix { border-collapse: separate; border-spacing: 2px; }
  .matrix td, .matrix th { border-bottom: none; }
  .matrix .cell { text-align: center; vertical-align: middle; font-variant-numeric: tabular-nums; border-radius: 4px; min-width: 90px; font-size: 0.8rem; }
  .matrix .na { color: var(--text-muted); background: var(--wash); }
  .matrix th.q, th.q { font-weight: 400; max-width: 320px; }
  .group-row th { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); padding-top: 0.8rem; }
  .colhead { display: inline-flex; align-items: center; gap: 0.35rem; }
  select { font: inherit; font-size: 0.9rem; color: var(--text-primary); background: var(--page); border: 1px solid var(--border); border-radius: 8px; padding: 0.35rem 0.5rem; }
  label { font-size: 0.85rem; color: var(--text-secondary); display: inline-flex; gap: 0.5rem; align-items: center; margin-bottom: 0.5rem; }
  .ramp { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.6rem; flex-wrap: wrap; }
  .ramp span.sw { width: 26px; height: 12px; border-radius: 3px; display: inline-block; }
  .achip { display: inline-block; font-size: 0.78rem; border: 1px solid var(--hairline); border-radius: 999px; padding: 0.05rem 0.45rem; margin: 0.1rem 0.15rem 0.1rem 0; color: var(--text-secondary); }
  .achip.exp { color: var(--text-primary); border-color: var(--text-secondary); }
  .missing { font-size: 0.78rem; color: var(--text-primary); margin-top: 0.25rem; font-weight: 600; }
  .verdict { font-size: 0.75rem; color: var(--text-muted); margin-top: 0.15rem; }
  .tooltip { position: fixed; pointer-events: none; display: none; white-space: nowrap; padding: 0.35rem 0.55rem; background: var(--surface-1); color: var(--text-primary); border: 1px solid var(--border); border-radius: 6px; font-size: 0.8rem; box-shadow: 0 4px 16px rgba(0,0,0,0.12); font-variant-numeric: tabular-nums; }
  .notes li { color: var(--text-secondary); line-height: 1.5; margin-bottom: 0.3rem; }
</style>
</head>
<body>
<div class="viz-root">
<main>
  <h1>Comparing retrieval strategies</h1>
  <p>The same ${questions.length} test questions, run through the pipeline with different ways of picking the top ${first.config.k} chunks (or none), and scored by the same judge (<code>${esc(first.config.judgeModel)}</code>).</p>
  <ul class="strategies">
    <li><b>top-k</b>: the ${first.config.k} nearest chunks. One artist can fill several slots.</li>
    <li><b>two-per-artist</b>: the nearest chunks, at most 2 from any artist.</li>
    <li><b>one-per-artist</b>: the nearest chunk from each of ${first.config.k} different artists.</li>
    ${runs.some((r) => r.config.strategy === 'long-context') ? '<li><b>long-context</b> (the ◆ diamonds): no search at all. Every artist’s whole profile goes into the prompt, about 28k tokens. The baseline that shows what retrieval adds; its retrieval isn’t scored.</li>' : ''}
  </ul>
  <div class="legend" aria-label="Runs">${legend}</div>
  <p class="runlinks">Each run’s full results, with every claim and the judge’s verdict on it: ${meta.map((m) => `<a href="${esc(m.name)}.html">${esc(m.name)}</a>`).join(' · ')}</p>

  <section class="card">
    <h2>Average scores</h2>
    <p>One row per metric, one dot per run (nudged up or down so equal scores stay visible). The grey band spans the runs that used the same strategy: how much the scores move when nothing changes. Differences inside that band are noise.</p>
    <svg id="dots" role="img" aria-label="Average score per metric for each run"></svg>
    <details><summary>Show as a table</summary>
      <div class="table-wrap"><table>
        <thead><tr><th>Metric</th>${meta.map((m) => `<th class="tnum">${esc(m.name)}</th>`).join('')}</tr></thead>
        <tbody>${tableRows}</tbody>
      </table></div>
    </details>
  </section>

  <section class="card">
    <h2>Question by question</h2>
    <label>Metric <select id="metric"></select></label>
    <div class="table-wrap"><table class="matrix" id="grid"></table></div>
    <div class="ramp">score <span class="sw" style="background:var(--seq-1)"></span>0–0.2 <span class="sw" style="background:var(--seq-2)"></span>0.2–0.4 <span class="sw" style="background:var(--seq-3)"></span>0.4–0.6 <span class="sw" style="background:var(--seq-4)"></span>0.6–0.8 <span class="sw" style="background:var(--seq-5)"></span>0.8–1 <span>· “–” doesn’t apply</span></div>
  </section>

  <section class="card">
    <h2>What each strategy retrieved</h2>
    <p>The artists behind the ${first.config.k} retrieved chunks. <b>×n</b> means n chunks from the same artist, ✓ marks an expected artist, and the line below names expected artists that didn’t come back.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Question</th>${meta.map((m) => `<th><span class="colhead">${marker(m, 12)}${esc(m.name)}</span></th>`).join('')}</tr></thead>
      <tbody>${retrievedRows}</tbody>
    </table></div>
  </section>

  <section class="card">
    <h2>Reading this</h2>
    <ul class="notes">
      <li><b>Compare against the noise band first.</b> Two runs with identical settings already differ, because answers and the judge’s verdicts vary.</li>
      <li><b>Retrieval scores don’t use an LLM,</b> so they only change when the retrieved chunks change. Generation scores can change on any run.</li>
      <li><b>Each run’s full details</b> (every claim and verdict) are on its own page: ${meta.map((m) => `<a href="${esc(m.name)}.html">${esc(m.name)}</a>`).join(', ')}.</li>
    </ul>
  </section>
</main>
<div class="tooltip" id="tooltip"></div>
</div>
<script id="data" type="application/json">${data}</script>
<script>
(() => {
  const { meta, averages, grid, metrics } = JSON.parse(document.getElementById('data').textContent);
  const NS = 'http://www.w3.org/2000/svg';
  const tooltip = document.getElementById('tooltip');
  const svg = document.getElementById('dots');
  // Next to the cursor, flipped to the left near the right edge
  function placeTooltip(e) {
    tooltip.style.display = 'block';
    const w = tooltip.offsetWidth;
    const left = e.clientX + 12 + w > window.innerWidth - 8 ? e.clientX - 12 - w : e.clientX + 12;
    tooltip.style.left = Math.max(8, left) + 'px';
    tooltip.style.top = e.clientY + 12 + 'px';
  }

  // Dot plot: metric rows, a 0–1 axis
  const W = 1000, LEFT = 170, RIGHT = 30, ROW = 52, TOP = 26;
  const H = TOP + averages.length * ROW + 10;
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  const x = (v) => LEFT + v * (W - LEFT - RIGHT);
  const el = (tag, attrs, text) => {
    const node = document.createElementNS(NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (text !== undefined) node.textContent = text;
    svg.appendChild(node);
    return node;
  };
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    el('line', { x1: x(t), x2: x(t), y1: TOP - 6, y2: H - 6, stroke: 'var(--hairline)', 'stroke-width': 1 });
    el('text', { x: x(t), y: TOP - 12, 'text-anchor': 'middle', 'font-size': 12, fill: 'var(--text-muted)' }, String(t));
  }
  averages.forEach((a, row) => {
    const cy = TOP + row * ROW + ROW / 2;
    el('text', { x: LEFT - 14, y: cy + 4, 'text-anchor': 'end', 'font-size': 14, fill: 'var(--text-primary)' }, a.label);
    el('line', { x1: x(0), x2: x(1), y1: cy, y2: cy, stroke: 'var(--hairline)', 'stroke-width': 1 });
    // Noise band: the range across runs that share a strategy
    const byStrategy = {};
    meta.forEach((m, i) => { if (a.values[i] !== null) (byStrategy[m.strategy] ||= []).push(a.values[i]); });
    for (const values of Object.values(byStrategy)) {
      if (values.length < 2) continue;
      const lo = Math.min(...values), hi = Math.max(...values);
      el('rect', { x: x(lo) - 8, y: cy - 18, width: x(hi) - x(lo) + 16, height: 36, rx: 12, fill: 'var(--wash)', stroke: 'var(--hairline)' });
    }
    meta.forEach((m, i) => {
      const v = a.values[i];
      if (v === null) return;
      // Small vertical offset per run, so runs with equal scores don't hide each other
      const dy = (i - (meta.length - 1) / 2) * 6;
      const paint = { fill: m.hollow ? 'var(--surface-1)' : m.colour, stroke: m.hollow ? m.colour : 'var(--surface-1)', 'stroke-width': m.hollow ? 2.5 : 2 };
      const px = x(v), py = cy + dy;
      const dot = m.diamond
        ? el('polygon', { points: [px, py - 9, px + 9, py, px, py + 9, px - 9, py].join(' '), ...paint })
        : el('circle', { cx: px, cy: py, r: 7, ...paint });
      dot.addEventListener('mousemove', (e) => {
        tooltip.textContent = m.name + ' · ' + a.label + ': ' + v.toFixed(2);
        placeTooltip(e);
      });
      dot.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
    });
  });

  // Question grid for one metric
  const select = document.getElementById('metric');
  metrics.forEach((m) => select.add(new Option(m.label, m.key)));
  select.value = 'correctness';
  const table = document.getElementById('grid');
  const step = (v) => Math.min(5, Math.floor(v * 5) + 1);
  function drawGrid() {
    const key = select.value;
    table.replaceChildren();
    const head = table.createTHead().insertRow();
    const th = document.createElement('th'); th.textContent = 'Question'; head.appendChild(th);
    meta.forEach((m) => { const h = document.createElement('th'); h.textContent = m.name; head.appendChild(h); });
    const body = table.createTBody();
    let group = '';
    for (const q of grid) {
      if (q.group !== group) {
        group = q.group;
        const g = body.insertRow(); g.className = 'group-row';
        const gh = document.createElement('th'); gh.colSpan = meta.length + 1; gh.textContent = group; g.appendChild(gh);
      }
      const row = body.insertRow();
      const qh = document.createElement('th'); qh.className = 'q'; qh.textContent = q.question; row.appendChild(qh);
      q.values[key].forEach((v) => {
        const cell = row.insertCell();
        cell.className = 'cell' + (v === null ? ' na' : '');
        if (v === null) { cell.textContent = '–'; return; }
        const s = step(v);
        cell.style.background = 'var(--seq-' + s + ')';
        cell.style.color = 'var(--seq-ink-' + s + ')';
        cell.textContent = v.toFixed(2);
      });
    }
  }
  select.addEventListener('change', drawGrid);
  drawGrid();
})();
</script>
</body>
</html>
`;
}
