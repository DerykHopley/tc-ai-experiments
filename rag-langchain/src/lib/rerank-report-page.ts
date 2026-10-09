// A self-contained HTML page for the re-ranking experiment: two score
// scales × with or without a per-artist cap. Rendered on the server; the
// findings text is fixed, the numbers come from the runs.
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

export type Cell = { run: EvalRun; scale: string; cap: string };

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
}): string {
  const { cells, references, focus } = d;

  const avgRows = [
    ...cells.map(
      (c) => [c.run.name, `${c.scale}${c.cap}`, averages(c.run)] as const,
    ),
    ...references.map((r) => [r.name, 'reference', averages(r)] as const),
  ]
    .map(
      ([name, what, a]) =>
        `<tr${what === 'reference' ? ' class="ref"' : ''}><td>${esc(name)}</td><td>${esc(what)}</td><td class="tnum">${f2(a.recall)}</td><td class="tnum">${f2(a.faithfulness)}</td><td class="tnum">${f2(a.correctness)}</td><td class="tnum">${a.refusal}</td></tr>`,
    )
    .join('');

  // The same candidate chunks, scored in each run
  const scoreHead = cells
    .map((c) => `<th class="tnum">${esc(c.scale)}${esc(c.cap)}</th>`)
    .join('');
  const scoreRows = focus.chunks
    .map((chunk) => {
      const cellsHtml = cells
        .map((c) => {
          const cand = byId(c.run, focus.question).candidates?.find(
            (x) => x.searchRank === chunk.searchRank,
          );
          if (!cand) return '<td class="tnum">–</td>';
          return `<td class="tnum${cand.kept ? ' kept' : ''}">${cand.score}${cand.kept ? ' ✓' : ''}</td>`;
        })
        .join('');
      return `<tr><td>${esc(chunk.artist)}</td><td class="tnum">#${chunk.searchRank}</td>${cellsHtml}</tr>`;
    })
    .join('');

  // Expected artists that didn't make it, per question and run
  const questions = cells[0].run.results.filter(
    (r) => r.expectedArtists && r.expectedArtists.length > 1,
  );
  const missRows = questions
    .map((q) => {
      const tds = cells
        .map((c) => {
          const r = byId(c.run, q.id);
          const kept = new Set(r.retrieved.map((x) => x.artist));
          const missing = (q.expectedArtists ?? []).filter((a) => !kept.has(a));
          const verdict = r.metrics.answerCorrectness?.verdict ?? '';
          return `<td>${missing.length ? `<span class="miss">✗ missing ${esc(missing.join(', '))}</span>` : '<span class="ok">✓ all found</span>'}<div class="small muted">answer: ${esc(verdict)}</div></td>`;
        })
        .join('');
      return `<tr><td>${esc(q.question)}</td>${tds}</tr>`;
    })
    .join('');
  const cellHeads = cells
    .map((c) => `<th>${esc(c.scale)}${esc(c.cap)}</th>`)
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
  main { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  h2 { font-size: 1.1rem; margin: 0 0 0.6rem; }
  p, li { color: var(--text-secondary); line-height: 1.55; }
  p { margin: 0 0 0.75rem; }
  b, strong { color: var(--text-primary); }
  a { color: inherit; }
  .card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; margin-top: 1rem; }
  .card.key { border-left: 4px solid var(--series-1); }
  table { border-collapse: collapse; width: 100%; font-size: 0.875rem; }
  th, td { text-align: left; padding: 0.4rem 0.55rem; border-bottom: 1px solid var(--hairline); vertical-align: top; }
  th { color: var(--text-secondary); font-weight: 600; }
  .tnum { font-variant-numeric: tabular-nums; text-align: right; }
  .table-wrap { overflow-x: auto; }
  tr.ref td { color: var(--text-muted); }
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
  <h1>Re-ranking: scale, cap, or noise?</h1>
  <p>The first re-rank runs scored candidates 0–3 and missed Stevie Wonder for the soul question. The guess was that too many chunks tied at 3, so search order decided. This experiment tested that with four runs: a 0–3 or a 0–100 scale, each with and without a cap of 2 chunks per artist after re-ranking. Each run saved the re-ranker’s score for all 30 candidates, not just the 6 kept.</p>

  <section class="card key">
    <h2>What it showed</h2>
    <ul>
      <li><strong>It wasn’t ties.</strong> In the 0–3 run without a cap, only 2 candidates scored 3. Stevie Wonder’s chunks, including his profile with its soul and Motown tags, scored 1. The re-ranker judged them weak.</li>
      <li><strong>The re-ranker’s scores are mostly noise.</strong> The same chunks got very different scores in different runs (table below): Stevie Wonder’s profile got 1, 0, 30 and 70, and Marvin Gaye’s first chunk got 2, 2, 70 and 0. The re-ranker runs at the model’s default temperature, so each call samples different scores.</li>
      <li><strong>The best run was luck.</strong> 0–100 with a cap scored highest, but only because that call happened to rate Stevie Wonder 70. In the 0–3 run with a cap, the last slot went to Frank Sinatra on a tie at <em>0</em> with Stevie Wonder, decided by search order.</li>
      <li><strong>A cap of 2 can’t fit a 5-artist answer into 6 slots</strong> when the top artists’ second chunks outscore the others’ first. Kishore Kumar and Diljit Dosanjh were missing for Bollywood in every run.</li>
      <li><strong>Yes/no probabilities didn’t help either.</strong> Tried first, as a probability-style score: <code>gpt-4o-mini</code> answered “true” with near-certainty for every relevant chunk, so those scores tied too.</li>
      <li><strong>Next:</strong> set the re-ranker’s temperature to 0, and check its consistency by scoring the same candidates several times, before comparing scales or caps again.</li>
    </ul>
  </section>

  <section class="card">
    <h2>Averages</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Run</th><th>Variant</th><th class="tnum">Recall</th><th class="tnum">Faithfulness</th><th class="tnum">Correctness</th><th class="tnum">Refusal right</th></tr></thead>
      <tbody>${avgRows}</tbody>
    </table></div>
    <p class="small muted" style="margin-top:0.6rem">With 13 questions and a noisy re-ranker, these averages can’t rank the variants. The two tables below show why.</p>
  </section>

  <section class="card">
    <h2>The same chunks, scored four times</h2>
    <p>“${esc(byId(cells[0].run, focus.question).question)}” Each row is one candidate chunk (its position in the search results), with the score each run’s re-ranker gave it. ✓ and blue: the chunk was kept.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Artist</th><th class="tnum">Search</th>${scoreHead}</tr></thead>
      <tbody>${scoreRows}</tbody>
    </table></div>
  </section>

  <section class="card">
    <h2>Which expected artists were missing</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Question</th>${cellHeads}</tr></thead>
      <tbody>${missRows}</tbody>
    </table></div>
  </section>
</main>
</div>
</body>
</html>
`;
}
