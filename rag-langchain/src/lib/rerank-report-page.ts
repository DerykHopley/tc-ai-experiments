// A self-contained HTML page for the re-ranking experiment: score scale ×
// per-artist cap, at the re-ranker's default temperature (1) and at 0, plus
// a repeatability check and the same chunks scored alone. Rendered on the
// server; the findings text is fixed, every number comes from the runs.
import { THEME_CSS } from './page-theme.ts';
import type { EvalRun, QuestionResult } from './evaluation-page.ts';

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const f2 = (n: number | null) => (n === null ? '–' : n.toFixed(2));
const mean = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => typeof x === 'number');
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export type Cell = { run: EvalRun; label: string; temperature: number };

export type Consistency = {
  repeats: number;
  results: {
    id: string;
    question: string;
    temperature: number;
    scale: 3 | 100;
    artists: string[];
    repeats: number[][];
  }[];
  alone: {
    id: string;
    artist: string;
    searchRank: number;
    scale: 3 | 100;
    scores: number[];
  }[];
};

function averages(run: EvalRun) {
  const m = run.results.map((r) => r.metrics);
  return {
    recall: mean(m.map((x) => x.contextRecall?.score)),
    faithfulness: mean(m.map((x) => x.faithfulness.score)),
    correctness: mean(m.map((x) => x.answerCorrectness?.score)),
    refusal: `${m.filter((x) => x.behaviour.pass).length}/${m.length}`,
  };
}

const byId = (run: EvalRun, id: string) =>
  run.results.find((r) => r.id === id) as QuestionResult;

export function renderRerankReportHtml(d: {
  cells: Cell[];
  references: EvalRun[];
  focus: { question: string; chunks: { artist: string; searchRank: number }[] };
  consistency: Consistency;
}): string {
  const { cells, references, focus, consistency } = d;
  const temps = [1, 0];

  const avgRows = [
    ...cells.map((c) => ({
      name: c.run.name,
      what: `${c.label}, temperature ${c.temperature}`,
      ref: false,
      a: averages(c.run),
    })),
    ...references.map((r) => ({
      name: r.name,
      what: 'reference',
      ref: true,
      a: averages(r),
    })),
  ]
    .map(
      ({ name, what, ref, a }) =>
        `<tr${ref ? ' class="ref"' : ''}><td>${esc(name)}</td><td>${esc(what)}</td><td class="tnum">${f2(a.recall)}</td><td class="tnum">${f2(a.faithfulness)}</td><td class="tnum">${f2(a.correctness)}</td><td class="tnum">${a.refusal}</td></tr>`,
    )
    .join('');

  // The same candidate chunks, scored in each run
  const groupHead = temps
    .map(
      (t) =>
        `<th colspan="${cells.filter((c) => c.temperature === t).length}" class="group">temperature ${t}</th>`,
    )
    .join('');
  const scoreHead = cells
    .map((c) => `<th class="tnum">${esc(c.label)}</th>`)
    .join('');
  const scoreRows = focus.chunks
    .map((chunk) => {
      const tds = cells
        .map((c) => {
          const cand = byId(c.run, focus.question).candidates?.find(
            (x) => x.searchRank === chunk.searchRank,
          );
          if (!cand) return '<td class="tnum">–</td>';
          return `<td class="tnum${cand.kept ? ' kept' : ''}">${cand.score}${cand.kept ? ' ✓' : ''}</td>`;
        })
        .join('');
      return `<tr><td>${esc(chunk.artist)}</td><td class="tnum">#${chunk.searchRank}</td>${tds}</tr>`;
    })
    .join('');

  // Repeatability: the same candidates scored several times
  const consRows = consistency.results
    .map((r) => {
      const n = r.repeats[0].length;
      const same = Array.from({ length: n }, (_, i) =>
        r.repeats.every((rep) => rep[i] === r.repeats[0][i]),
      ).filter(Boolean).length;
      const top6 = r.repeats.map((rep) =>
        Array.from({ length: n }, (_, i) => i)
          .sort((a, b) => rep[b] - rep[a] || a - b)
          .slice(0, 6)
          .sort((a, b) => a - b)
          .join(','),
      );
      const stable = new Set(top6).size === 1;
      return `<tr><td>${esc(r.id)}</td><td class="tnum">0–${r.scale}</td><td class="tnum">${r.temperature}</td><td class="tnum">${same} / ${n}</td><td>${stable ? 'yes' : '<b>no</b>'}</td></tr>`;
    })
    .join('');

  // The same profile chunk, alone and inside the batch
  const aloneRows = consistency.alone
    .map((a) => {
      const batch = consistency.results.find(
        (r) => r.id === a.id && r.temperature === 0 && r.scale === a.scale,
      );
      const inBatch = batch
        ? batch.repeats.map((rep) => rep[a.searchRank - 1])
        : [];
      const lower = inBatch.some((s, i) => s < a.scores[i]);
      return `<tr${lower ? ' class="drop"' : ''}><td>${esc(a.artist)}</td><td class="tnum">#${a.searchRank}</td><td class="tnum">0–${a.scale}</td><td class="tnum">${a.scores.join(', ')}</td><td class="tnum">${inBatch.join(', ')}</td></tr>`;
    })
    .join('');

  const missing = (c: Cell, id: string) => {
    const r = byId(c.run, id);
    const kept = new Set(r.retrieved.map((x) => x.artist));
    return (r.expectedArtists ?? []).filter((a) => !kept.has(a));
  };
  const multi = cells[0].run.results.filter(
    (r) => r.expectedArtists && r.expectedArtists.length > 1,
  );
  const missRows = multi
    .map((q) => {
      const tds = cells
        .map((c) => {
          const m = missing(c, q.id);
          const verdict =
            byId(c.run, q.id).metrics.answerCorrectness?.verdict ?? '';
          return `<td>${m.length ? `<span class="miss">✗ ${esc(m.join(', '))}</span>` : '<span class="ok">✓ all</span>'}<div class="small muted">${esc(verdict)}</div></td>`;
        })
        .join('');
      return `<tr><td>${esc(q.question)}</td>${tds}</tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Re-ranking Experiment</title>
<style>
${THEME_CSS}  body { margin: 0; background: #f9f9f7; }
  @media (prefers-color-scheme: dark) { body { background: #0d0d0d; } }
  .viz-root { min-height: 100vh; background: var(--page); color: var(--text-primary); font-family: system-ui, -apple-system, "Segoe UI", sans-serif; padding: 2rem 16px; box-sizing: border-box; }
  main { max-width: 1000px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  h2 { font-size: 1.1rem; margin: 0 0 0.6rem; }
  p, li { color: var(--text-secondary); line-height: 1.55; }
  p { margin: 0 0 0.75rem; }
  b, strong { color: var(--text-primary); }
  a { color: inherit; }
  .card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; margin-top: 1rem; }
  .card.key { border-left: 4px solid var(--series-1); }
  table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
  th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--hairline); vertical-align: top; }
  th { color: var(--text-secondary); font-weight: 600; }
  th.group { text-align: center; border-bottom: 2px solid var(--hairline); }
  .tnum { font-variant-numeric: tabular-nums; text-align: right; }
  .table-wrap { overflow-x: auto; }
  tr.ref td { color: var(--text-muted); }
  tr.drop td { background: var(--mark-alt-bg); }
  td.kept { background: var(--mark-bg); font-weight: 700; }
  .miss { color: var(--text-primary); font-weight: 600; }
  .ok { color: var(--text-muted); }
  .small { font-size: 0.78rem; }
  .muted { color: var(--text-muted); }
  ul { padding-left: 1.2rem; }
  li { margin: 0.4rem 0; }
  code { font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-size: 0.85em; }
</style>
</head>
<body>
<div class="viz-root">
<main>
  <p><a href="comparison.html">← All retrieval strategies</a></p>
  <h1>Re-ranking: scale, cap, temperature, or the batch?</h1>
  <p>The first re-rank runs had an LLM (<code>gpt-4o-mini</code>) score 30 candidate chunks 0–3 in one call, and missed Stevie Wonder for the soul question. This experiment crossed a 0–3 or 0–100 scale with and without a cap of 2 chunks per artist, first at the model’s default temperature (1) and then at 0. Every run saved the score of all 30 candidates. A separate check scored the same candidates repeatedly, and scored single chunks on their own.</p>

  <section class="card key">
    <h2>What it showed</h2>
    <ul>
      <li><strong>The batch is the problem.</strong> Scored on its own, Stevie Wonder’s profile chunk (tags: soul, motown) gets the top score every time. Scored as candidate #18 in a batch of 30, it gets 0 or 1. Chunks near the top of the search results score the same both ways; chunks further down are underrated in the batch (table below).</li>
      <li><strong>Temperature 1 made the scores noisy.</strong> The same chunk got very different scores in different runs, and the best run at temperature 1 won by luck. Temperature 0 isn’t a full fix: on 0–100 the scores were identical every time, but on 0–3 the soul candidates were <em>less</em> repeatable than at temperature 1 (table below). And stable isn’t the same as good: at temperature 0, plain 0–3 lost Shakira for the Latin question.</li>
      <li><strong>At temperature 0, the scale doesn’t matter and the cap does all the work.</strong> Both capped variants match two-per-artist exactly on recall and correctness. The re-ranker scored Stevie Wonder 0 or 1 even then; the cap only let his chunks in because it pushed out Marvin Gaye’s and Aretha Franklin’s extra chunks.</li>
      <li><strong>A cap of 2 can’t fit a 5-artist answer into 6 slots.</strong> Kishore Kumar and Diljit Dosanjh were missing for Bollywood in every run. Diljit Dosanjh scores low even on his own (his tags are punjabi and bhangra), which is a fair judgement.</li>
      <li><strong>Yes/no probabilities didn’t help.</strong> Tried first as a continuous score: <code>gpt-4o-mini</code> answered “true” with near-certainty for every relevant chunk, so they tied too.</li>
      <li><strong>Next:</strong> score each candidate in its own call (pointwise), the way cross-encoders and probability-based re-rankers work. That costs 30 small calls per question instead of one large one.</li>
    </ul>
  </section>

  <section class="card">
    <h2>The same chunk, alone and in the batch</h2>
    <p>Profile chunks (the ones with the tags) of the artists expected for soul and Bollywood, scored 3 times on their own and 3 times inside the batch of 30, all at temperature 0. Highlighted rows score lower in the batch.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Artist</th><th class="tnum">Search position</th><th class="tnum">Scale</th><th class="tnum">Alone</th><th class="tnum">In the batch</th></tr></thead>
      <tbody>${aloneRows}</tbody>
    </table></div>
  </section>

  <section class="card">
    <h2>How repeatable are the scores?</h2>
    <p>The same 30 candidates scored ${consistency.repeats} times with nothing changed. “Same score” counts chunks that got an identical score every time.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Question</th><th class="tnum">Scale</th><th class="tnum">Temperature</th><th class="tnum">Same score</th><th>Same top 6 every time</th></tr></thead>
      <tbody>${consRows}</tbody>
    </table></div>
  </section>

  <section class="card">
    <h2>Averages</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Run</th><th>Variant</th><th class="tnum">Recall</th><th class="tnum">Faithfulness</th><th class="tnum">Correctness</th><th class="tnum">Refusal right</th></tr></thead>
      <tbody>${avgRows}</tbody>
    </table></div>
    <p class="small muted" style="margin-top:0.6rem">With 13 questions, these averages can’t rank the variants on their own. The per-question tables show what changed.</p>
  </section>

  <section class="card">
    <h2>The soul question’s chunks, scored in each run</h2>
    <p>“${esc(byId(cells[0].run, focus.question).question)}” One row per candidate chunk from an expected artist (its search position), with the score each run gave it. ✓ and blue: the chunk was kept.</p>
    <div class="table-wrap"><table>
      <thead><tr><th></th><th></th>${groupHead}</tr><tr><th>Artist</th><th class="tnum">Search</th>${scoreHead}</tr></thead>
      <tbody>${scoreRows}</tbody>
    </table></div>
  </section>

  <section class="card">
    <h2>Which expected artists were missing</h2>
    <div class="table-wrap"><table>
      <thead><tr><th></th>${groupHead}</tr><tr><th>Question</th>${cells.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${missRows}</tbody>
    </table></div>
  </section>
</main>
</div>
</body>
</html>
`;
}
