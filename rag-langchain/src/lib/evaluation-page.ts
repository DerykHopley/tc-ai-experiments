// A self-contained HTML page for one evaluation run: averages, a score
// matrix (questions x metrics) and, per question, everything the judge saw
// and decided, so its verdicts can be checked by hand.
import { THEME_CSS } from './page-theme.ts';

export type QuestionResult = {
  id: string;
  group: string;
  question: string;
  note?: string;
  expectedArtists?: string[];
  reference?: string;
  shouldRefuse: boolean;
  // distance is null when there was no search (long-context)
  retrieved: {
    rank: number;
    artist: string;
    distance: number | null;
    // The re-ranker's 0-3 usefulness score (rerank strategy only)
    rerankScore?: number;
    text: string;
  }[];
  answer: string;
  answerMs: number;
  outputTokens?: number;
  metrics: {
    contextRecall?: { score: number; found: string[] };
    contextPrecision?: { score: number; relevant: boolean[] };
    faithfulness: {
      score: number | null;
      claims: {
        claim: string;
        supported: boolean;
        source: number | null;
        reason: string;
      }[];
    };
    answerRelevancy?: {
      score: number;
      noncommittal: boolean;
      questions: { question: string; similarity: number }[];
    };
    answerCorrectness?: { score: number; verdict: string; reason: string };
    behaviour: { refused: boolean; reason: string; pass: boolean };
  };
};

export type EvalRun = {
  name: string;
  date: string;
  config: {
    strategy: string;
    chatModel: string;
    judgeModel: string;
    embeddingModel: string;
    k: number;
    chunkSize: number;
    chunkOverlap: number;
  };
  seconds: number;
  results: QuestionResult[];
};

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

type Column = {
  key: string;
  label: string;
  kind: 'retrieval' | 'generation';
  how: string;
  value: (r: QuestionResult) => number | null | undefined;
  text?: (r: QuestionResult) => string;
};

const COLUMNS: Column[] = [
  {
    key: 'recall',
    label: 'Context recall',
    kind: 'retrieval',
    how: 'Share of the expected artists that appear in the retrieved chunks. No LLM.',
    value: (r) => r.metrics.contextRecall?.score,
  },
  {
    key: 'precision',
    label: 'Context precision',
    kind: 'retrieval',
    how: 'Are the chunks from expected artists ranked near the top? Rank-weighted. No LLM.',
    value: (r) => r.metrics.contextPrecision?.score,
  },
  {
    key: 'faithfulness',
    label: 'Faithfulness',
    kind: 'generation',
    how: 'Share of the answer’s claims that the retrieved chunks back up. Judge splits the answer into claims, then checks each.',
    value: (r) => r.metrics.faithfulness.score,
  },
  {
    key: 'relevancy',
    label: 'Answer relevancy',
    kind: 'generation',
    how: 'Judge writes 3 questions the answer would fit; their embedding similarity to the real question. 0 if evasive.',
    value: (r) => r.metrics.answerRelevancy?.score,
  },
  {
    key: 'correctness',
    label: 'Correctness',
    kind: 'generation',
    how: 'Judge compares the answer with our reference answer: correct 1, partial 0.5, incorrect 0.',
    value: (r) => r.metrics.answerCorrectness?.score,
  },
  {
    key: 'behaviour',
    label: 'Refusal',
    kind: 'generation',
    how: 'Did it refuse exactly when it should? Out-of-scope questions should be refused; answerable ones not.',
    value: (r) => (r.metrics.behaviour.pass ? 1 : 0),
    text: (r) =>
      `${r.metrics.behaviour.pass ? 'pass' : 'fail'} · ${r.metrics.behaviour.refused ? 'refused' : 'answered'}`,
  },
];

// Scores 0..1 onto the 5-step ramp (step 5 = best)
const step = (v: number) => Math.min(5, Math.floor(v * 5) + 1);

function mean(values: (number | null | undefined)[]) {
  const xs = values.filter((v): v is number => typeof v === 'number');
  return {
    value: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null,
    n: xs.length,
  };
}

function detail(r: QuestionResult, run: EvalRun): string {
  const m = r.metrics;
  const expected = new Set(r.expectedArtists ?? []);
  const chunks = r.retrieved
    .map(
      (c) => `<details class="chunk">
  <summary><span class="rank">[${c.rank}]</span> ${esc(c.artist)}${r.expectedArtists ? (expected.has(c.artist) ? ' <span class="tag yes">expected</span>' : ' <span class="tag">not expected</span>') : ''}${c.distance === null ? '' : `<span class="dist">${c.rerankScore === undefined ? '' : `re-ranked ${c.rerankScore}/3 · `}distance ${c.distance.toFixed(3)}</span>`}</summary>
  <pre>${esc(c.text)}</pre>
</details>`,
    )
    .join('');

  const claims = m.faithfulness.claims.length
    ? `<table><thead><tr><th>Claim</th><th>Backed?</th><th>Block</th><th>Judge’s reason</th></tr></thead><tbody>${m.faithfulness.claims
        .map(
          (c) =>
            `<tr><td>${esc(c.claim)}</td><td class="${c.supported ? 'ok' : 'bad'}">${c.supported ? '✓ yes' : '✗ no'}</td><td class="tnum">${c.source ?? '–'}</td><td class="muted">${esc(c.reason)}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : '<p class="muted">No factual claims in the answer, so faithfulness doesn’t apply.</p>';

  const relevancy = m.answerRelevancy
    ? `<h4>Answer relevancy: ${m.answerRelevancy.score.toFixed(2)}${m.answerRelevancy.noncommittal ? ' (answer judged evasive, so scored 0)' : ''}</h4>
<p class="muted">Questions the judge thinks this answer fits, and their similarity to the real question:</p>
<ul class="plain">${m.answerRelevancy.questions.map((q) => `<li><span class="tnum">${q.similarity.toFixed(2)}</span> ${esc(q.question)}</li>`).join('')}</ul>`
    : '';

  const correctness = m.answerCorrectness
    ? `<h4>Correctness: ${m.answerCorrectness.verdict}</h4>
<p><span class="label">Reference:</span> ${esc(r.reference ?? '')}</p>
<p class="muted">${esc(m.answerCorrectness.reason)}</p>`
    : '';

  return `<section class="card detail" id="detail-${r.id}" hidden>
  <p class="group">${esc(r.group)}</p>
  <h3>${esc(r.question)}</h3>
  ${r.note ? `<p class="muted">${esc(r.note)}</p>` : ''}
  <div class="cols">
    <div>
      <h4>Answer <span class="muted small">${(r.answerMs / 1000).toFixed(1)} s${r.outputTokens ? ` · ${r.outputTokens} output tokens` : ''}</span></h4>
      <pre class="answer">${esc(r.answer)}</pre>
      <h4>Refusal: ${m.behaviour.pass ? 'pass' : 'fail'}</h4>
      <p class="muted">${r.shouldRefuse ? 'Should refuse.' : 'Should answer.'} Judge: ${m.behaviour.refused ? 'it refused' : 'it answered'}. ${esc(m.behaviour.reason)}</p>
      ${correctness}
    </div>
    <div>
      <h4>${run.config.strategy === 'long-context' ? `In the prompt: all ${r.retrieved.length} profiles, no search` : `Retrieved (top ${run.config.k})`}${m.contextRecall ? ` · recall ${m.contextRecall.score.toFixed(2)} · precision ${m.contextPrecision!.score.toFixed(2)}` : ''}</h4>
      ${run.config.strategy === 'long-context' ? '<p class="muted">Retrieval isn’t scored: every artist is in the prompt.</p>' : r.expectedArtists ? `<p class="muted">Expected: ${esc(r.expectedArtists.join(', '))}</p>` : '<p class="muted">No expected artists for this question, so retrieval isn’t scored.</p>'}
      ${chunks}
    </div>
  </div>
  <h4>Faithfulness: ${m.faithfulness.score === null ? 'n/a' : m.faithfulness.score.toFixed(2)}</h4>
  ${claims}
  ${relevancy}
</section>`;
}

export function renderEvaluationHtml(run: EvalRun): string {
  const { results, config } = run;
  const averages = COLUMNS.map((c) => ({
    ...c,
    ...mean(results.map(c.value)),
  }));

  const tiles = averages
    .map(
      (a) => `<div class="tile">
  <span class="kind">${a.kind}</span>
  <b>${a.value === null ? 'n/a' : a.key === 'behaviour' ? `${Math.round(a.value * a.n)}/${a.n}` : a.value.toFixed(2)}</b>
  <span class="name">${a.label}</span>
  <small>${esc(a.how)} <span class="n">n = ${a.n}</span></small>
</div>`,
    )
    .join('');

  let lastGroup = '';
  const rows = results
    .map((r) => {
      const groupRow =
        r.group !== lastGroup
          ? `<tr class="group-row"><th colspan="${COLUMNS.length + 1}">${esc(r.group)}</th></tr>`
          : '';
      lastGroup = r.group;
      const cells = COLUMNS.map((c) => {
        const v = c.value(r);
        if (v === null || v === undefined)
          return '<td class="cell na" title="Not applicable">–</td>';
        const s = step(v);
        return `<td class="cell" style="background:var(--seq-${s});color:var(--seq-ink-${s})">${c.text ? c.text(r) : v.toFixed(2)}</td>`;
      }).join('');
      return `${groupRow}<tr class="qrow" data-id="${r.id}" tabindex="0"><th class="q">${esc(r.question)}</th>${cells}</tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>RAG Evaluation</title>
<style>
${THEME_CSS}  body { margin: 0; background: #f9f9f7; }
  @media (prefers-color-scheme: dark) { body { background: #0d0d0d; } }
  .viz-root { min-height: 100vh; background: var(--page); color: var(--text-primary); font-family: system-ui, -apple-system, "Segoe UI", sans-serif; padding: 2rem 16px; box-sizing: border-box; }
  main { max-width: 1100px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  .back { margin: 0 0 0.5rem; font-size: 0.85rem; }
  .back a { color: var(--text-secondary); }
  h2 { font-size: 1.1rem; margin: 0 0 0.5rem; }
  h3 { font-size: 1.1rem; margin: 0.1rem 0 0.5rem; }
  h4 { font-size: 0.9rem; margin: 1rem 0 0.4rem; }
  p { color: var(--text-secondary); line-height: 1.5; margin: 0 0 0.6rem; }
  .muted { color: var(--text-secondary); }
  .small { font-size: 0.8rem; font-weight: 400; }
  .card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; margin-top: 1rem; }
  .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.5rem 0 0; }
  .chip { font-size: 0.8rem; color: var(--text-secondary); border: 1px solid var(--hairline); border-radius: 999px; padding: 0.15rem 0.6rem; }
  .chip b { color: var(--text-primary); }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem; }
  .tile { border: 1px solid var(--hairline); border-radius: 10px; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.15rem; }
  .tile b { font-size: 1.6rem; font-variant-numeric: tabular-nums; }
  .tile .name { font-weight: 600; font-size: 0.9rem; }
  .tile .kind { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
  .tile small { font-size: 0.75rem; color: var(--text-secondary); line-height: 1.4; }
  .tile .n { color: var(--text-muted); white-space: nowrap; }
  .table-wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
  th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--hairline); vertical-align: top; }
  thead th { color: var(--text-secondary); font-weight: 600; font-size: 0.8rem; }
  .matrix { border-collapse: separate; border-spacing: 2px; }
  .matrix td, .matrix th { border-bottom: none; }
  .matrix thead th { vertical-align: bottom; }
  .matrix .cell { text-align: center; vertical-align: middle; font-variant-numeric: tabular-nums; border-radius: 4px; min-width: 76px; font-size: 0.8rem; }
  .matrix .na { color: var(--text-muted); background: var(--wash); }
  .matrix th.q { font-weight: 400; max-width: 340px; }
  .group-row th { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); padding-top: 0.8rem; }
  .qrow { cursor: pointer; }
  .qrow:hover th.q, .qrow:focus th.q { text-decoration: underline; }
  .qrow.selected th.q { font-weight: 700; }
  .qrow:focus { outline: 2px solid var(--series-1); outline-offset: 1px; }
  .ramp { display: flex; align-items: center; gap: 0.4rem; font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.6rem; flex-wrap: wrap; }
  .ramp span.sw { width: 26px; height: 12px; border-radius: 3px; display: inline-block; }
  .group { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin: 0; }
  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.25rem; }
  pre { white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, Menlo, monospace; font-size: 0.78rem; background: var(--code-bg); border-radius: 8px; padding: 0.6rem; margin: 0.3rem 0; }
  pre.answer { font-family: inherit; font-size: 0.9rem; }
  details.chunk { border: 1px solid var(--hairline); border-radius: 6px; padding: 0.3rem 0.5rem; margin-top: 0.3rem; font-size: 0.85rem; }
  details.chunk summary { cursor: pointer; }
  .rank { font-variant-numeric: tabular-nums; color: var(--text-muted); }
  .dist { float: right; color: var(--text-muted); font-variant-numeric: tabular-nums; font-size: 0.8rem; }
  .tag { font-size: 0.7rem; border: 1px solid var(--hairline); border-radius: 999px; padding: 0 0.4rem; color: var(--text-muted); }
  .tag.yes { border-color: var(--series-1); color: var(--text-primary); }
  td.ok { white-space: nowrap; }
  td.bad { white-space: nowrap; font-weight: 700; }
  .tnum { font-variant-numeric: tabular-nums; }
  .label { font-weight: 600; color: var(--text-primary); }
  ul.plain { list-style: none; padding: 0; margin: 0; font-size: 0.85rem; }
  ul.plain li { padding: 0.2rem 0; }
  ul.plain .tnum { display: inline-block; width: 3rem; color: var(--text-secondary); }
  .notes li { color: var(--text-secondary); line-height: 1.5; margin-bottom: 0.3rem; }
</style>
</head>
<body>
<div class="viz-root">
<main>
  <p class="back"><a href="comparison.html">← Compare all runs</a></p>
  <h1>Evaluating the RAG pipeline</h1>
  <p>${results.length} test questions, each run through the real pipeline and scored. Retrieval is scored with plain arithmetic. The answers are scored by a second LLM acting as judge, using metrics modelled on <a href="https://docs.ragas.io">Ragas</a>.</p>
  <div class="chips">
    <span class="chip">answers <b>${esc(config.chatModel)}</b></span>
    <span class="chip">judge <b>${esc(config.judgeModel)}</b></span>
    <span class="chip">embeddings <b>${esc(config.embeddingModel)}</b></span>
    <span class="chip">run <b>${esc(run.name)}</b></span>
    <span class="chip">${config.strategy === 'long-context' ? 'retrieval <b>none</b>: every profile in the prompt' : `retrieval <b>${esc(config.strategy)}</b>, top <b>${config.k}</b> chunks`}</span>
    <span class="chip">chunks <b>${config.chunkSize}</b> chars, <b>${config.chunkOverlap}</b> overlap</span>
    <span class="chip">run <b>${esc(run.date.slice(0, 16).replace('T', ' '))}</b> UTC · ${run.seconds} s</span>
  </div>

  <section class="card">
    <h2>Averages</h2>
    <div class="tiles">${tiles}</div>
  </section>

  <section class="card">
    <h2>Every question, every metric</h2>
    <p>Darker is better. “–” means the metric doesn’t apply: no expected artists, no reference answer, or a question that should be refused. Select a question to see what the judge saw and decided.</p>
    <div class="table-wrap"><table class="matrix">
      <thead><tr><th>Question</th>${COLUMNS.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <div class="ramp">score <span class="sw" style="background:var(--seq-1)"></span>0–0.2 <span class="sw" style="background:var(--seq-2)"></span>0.2–0.4 <span class="sw" style="background:var(--seq-3)"></span>0.4–0.6 <span class="sw" style="background:var(--seq-4)"></span>0.6–0.8 <span class="sw" style="background:var(--seq-5)"></span>0.8–1</div>
  </section>

  ${results.map((r) => detail(r, run)).join('\n')}

  <section class="card">
    <h2>Reading these numbers</h2>
    <ul class="notes">
      <li><b>The judge is an LLM too, and can be wrong.</b> Before trusting a score, read a few claim verdicts and see if you agree. Checking the judge against your own labels is the next step.</li>
      <li><b>Faithfulness isn’t correctness.</b> An answer can stick perfectly to the retrieved chunks and still be incomplete, if retrieval missed something.</li>
      <li><b>Small numbers.</b> ${results.length} questions is enough to spot problems, not to compare two setups that differ by a few points.</li>
      <li><b>Answers vary between runs.</b> The same question can get a slightly different answer, and different scores, next time.</li>
    </ul>
  </section>
</main>
</div>
<script>
(() => {
  let current = null;
  function show(id) {
    if (current) document.getElementById('detail-' + current).hidden = true;
    document.querySelectorAll('.qrow').forEach((row) => row.classList.toggle('selected', row.dataset.id === id));
    const panel = document.getElementById('detail-' + id);
    panel.hidden = false;
    current = id;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  document.querySelectorAll('.qrow').forEach((row) => {
    row.addEventListener('click', () => show(row.dataset.id));
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(row.dataset.id); } });
  });
})();
</script>
</body>
</html>
`;
}
