// A self-contained HTML page that walks the RAGAS evaluation step by step for
// one question, then shows every question's result. Everything is rendered
// on the server (escaped); there is no script.
import { THEME_CSS } from './page-theme.ts';

export type Claim = { claim: string; supported: boolean; reason: string };

export type EvalResult = {
  user_input: string;
  retrieved_contexts: string[];
  response: string;
  expect: 'answer' | 'refuse';
  notes: string;
  retrieved: { artist: string; distance: number }[];
  chat_model: string;
  faithfulness: {
    score: number | null;
    claims: Claim[];
    prompts: { claims?: string; verdicts?: string };
  };
  refusal: {
    value: 'answered' | 'refused';
    reason: string;
    // "rule": a plain "I don't know" answer, marked without asking the judge
    by: 'judge' | 'rule';
    prompt: string | null;
    correct: boolean;
  };
};

export type EvalSummary = {
  judge_model: string;
  samples: number;
  faithfulness_mean: number | null;
  faithfulness_scored: number;
  refusal_correct: number;
};

export type EvalPageData = {
  summary: EvalSummary;
  results: EvalResult[];
  // Index into results of the question the steps follow
  featured: number;
  k: number;
};

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const fmt = (n: number) => n.toLocaleString('en-US');
const score = (n: number | null) => (n === null ? 'n/a' : n.toFixed(2));

// Find the line in the retrieved chunks that shares the most words with a
// claim. This is our helper for checking the judge, not part of RAGAS.
const words = (s: string) =>
  new Set(s.toLowerCase().match(/[\p{L}\p{N}]{3,}|\d+/gu) ?? []);
const STOP = new Set(['the', 'and', 'are', 'was', 'for', 'with', 'from']);

export function closestLine(
  claim: string,
  contexts: string[],
): { chunk: number; line: string; shared: string[] } | null {
  const wanted = [...words(claim)].filter((w) => !STOP.has(w));
  let best: { chunk: number; line: string; shared: string[] } | null = null;
  contexts.forEach((context, chunk) => {
    for (const line of context.split('\n')) {
      const have = words(line);
      const shared = wanted.filter((w) => have.has(w));
      if (shared.length > (best?.shared.length ?? 0)) {
        best = { chunk: chunk + 1, line, shared };
      }
    }
  });
  return best;
}

// Wrap the shared words in <mark>, on already-escaped text
export function markWords(line: string, shared: string[]): string {
  if (!shared.length) return esc(line);
  const pattern = new RegExp(
    `(${shared.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'giu',
  );
  return esc(line).replace(pattern, '<mark>$1</mark>');
}

function step(n: number, title: string, what: string, body: string): string {
  return `<section class="card step" id="step-${n}">
  <div class="step-head">
    <span class="num">${n}</span>
    <div><h2>${title}</h2><p class="what">${what}</p></div>
  </div>
  ${body}
</section>`;
}

const code = (s: string) => `<pre class="code"><code>${esc(s)}</code></pre>`;

function promptBlock(label: string, prompt: string | null | undefined): string {
  if (!prompt) return '';
  return `<details class="prompt"><summary>${label} <span class="muted">(${fmt(prompt.length)} chars)</span></summary><pre>${esc(prompt)}</pre></details>`;
}

// One square per claim, ticked or crossed: the score made visible
function claimSquares(claims: Claim[]): string {
  return `<span class="squares" aria-hidden="true">${claims
    .map(
      (c) =>
        `<span class="sq ${c.supported ? 'ok' : 'bad'}">${c.supported ? '✓' : '✗'}</span>`,
    )
    .join('')}</span>`;
}

function behaviourChip(value: 'answer' | 'refuse'): string {
  return `<span class="tag ${value}">${value === 'answer' ? 'answers' : 'says “don’t know”'}</span>`;
}

function claimCards(r: EvalResult): string {
  return r.faithfulness.claims
    .map((c, i) => {
      const near = closestLine(c.claim, r.retrieved_contexts);
      return `<div class="claim ${c.supported ? 'ok' : 'bad'}">
  <div class="claim-head"><span class="sq ${c.supported ? 'ok' : 'bad'}">${c.supported ? '✓' : '✗'}</span><b>${i + 1}. ${esc(c.claim)}</b></div>
  <p class="reason"><span class="muted">Judge:</span> ${esc(c.reason)}</p>
  ${near ? `<p class="near"><span class="muted">Closest line, chunk [${near.chunk}]:</span> <code>${markWords(near.line, near.shared)}</code></p>` : '<p class="near muted">No line in the chunks shares words with this claim.</p>'}
</div>`;
    })
    .join('\n');
}

function resultRow(r: EvalResult, i: number, featured: number): string {
  const f = r.faithfulness;
  const judged = r.refusal.value === 'refused' ? 'refuse' : 'answer';
  const unsupported = f.claims.filter((c) => !c.supported).length;
  return `<details class="row${r.refusal.correct ? '' : ' wrong'}"${i === featured ? ' id="featured-row"' : ''}>
  <summary>
    <span class="row-n">${i + 1}</span>
    <span class="row-q">${esc(r.user_input)}${i === featured ? ' <span class="badge">followed above</span>' : ''}</span>
    <span class="row-refusal">${r.refusal.correct ? '<span class="pass">✓</span>' : '<span class="fail">✗</span>'} ${behaviourChip(judged)}</span>
    <span class="row-faith">${
      f.score === null
        ? '<span class="muted">n/a</span>'
        : `<b class="tnum">${score(f.score)}</b>${claimSquares(f.claims)}`
    }</span>
  </summary>
  <div class="row-body">
    <p class="label">Expected: ${behaviourChip(r.expect)}${r.notes ? ` <span class="muted">· ${esc(r.notes)}</span>` : ''}</p>
    <p class="label">Retrieved (top ${r.retrieved.length}): ${esc(r.retrieved.map((x) => x.artist).join(', '))}</p>
    <p class="label">Answer</p>
    <pre class="answer">${esc(r.response)}</pre>
    <p class="label">Refusal check (${r.refusal.by}): <b>${r.refusal.value}</b>${r.refusal.correct ? '' : ' <span class="fail">(disagrees with the expected label)</span>'}</p>
    <p class="reason">${esc(r.refusal.reason)}</p>
    ${
      f.claims.length
        ? `<p class="label">Faithfulness: ${f.claims.length - unsupported} of ${f.claims.length} claims supported</p>${claimCards(r)}`
        : '<p class="label muted">Faithfulness not scored: the answer says it doesn’t know, so there are no claims about the data to check.</p>'
    }
  </div>
</details>`;
}

export function renderEvalHtml(d: EvalPageData): string {
  const { summary, results } = d;
  const r = results[d.featured];
  const f = r.faithfulness;
  const supported = f.claims.filter((c) => c.supported).length;
  const allClaims = results.flatMap((x) => x.faithfulness.claims);
  const unsupportedAll = results.flatMap((x, i) =>
    x.faithfulness.claims.filter((c) => !c.supported).map((c) => ({ i, c, x })),
  );
  const mismatches = results
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => !x.refusal.correct);

  // The sample as exported, with long fields shortened
  const sampleJson = JSON.stringify(
    {
      user_input: r.user_input,
      retrieved_contexts: r.retrieved_contexts.map(
        (c) => `${c.slice(0, 70).replace(/\n/g, ' ')}… (${c.length} chars)`,
      ),
      response: r.response,
      expect: r.expect,
    },
    null,
    2,
  );

  const flow = (lane: string, items: [number | string, string, string][]) =>
    `<div class="lane"><span class="lane-name">${lane}</span><ol>${items
      .map(
        ([n, name, detail]) =>
          `<li><a href="#step-${n}"><span class="num small">${n}</span><span><b>${name}</b><small>${detail}</small></span></a></li>`,
      )
      .join('')}</ol></div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>RAG Evaluation Walkthrough</title>
<style>
${THEME_CSS}  body { margin: 0; background: #f9f9f7; }
  @media (prefers-color-scheme: dark) { body { background: #0d0d0d; } }
  .viz-root {
    min-height: 100vh; background: var(--page); color: var(--text-primary);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 2rem 16px; box-sizing: border-box;
    --ok: var(--series-3); --bad: var(--series-2);
  }
  main { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  h2 { font-size: 1.1rem; margin: 0; }
  h3 { font-size: 0.95rem; margin: 1.25rem 0 0.5rem; }
  p { color: var(--text-secondary); line-height: 1.5; margin: 0 0 0.75rem; }
  a { color: inherit; }
  .muted { color: var(--text-muted); }
  .card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; margin-top: 1rem; }
  .phase { margin: 2rem 0 0; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
  .phase + p { margin-top: 0.25rem; }
  .num { flex: none; display: inline-grid; place-items: center; width: 1.9rem; height: 1.9rem; border-radius: 50%; background: var(--text-primary); color: var(--page); font-weight: 700; font-size: 0.9rem; }
  .num.small { width: 1.4rem; height: 1.4rem; font-size: 0.75rem; }
  .step-head { display: flex; gap: 0.75rem; align-items: flex-start; margin-bottom: 0.75rem; }
  .what { margin: 0.2rem 0 0; }
  pre, code { font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-size: 0.8rem; }
  pre { white-space: pre-wrap; word-break: break-word; background: var(--code-bg); border-radius: 8px; padding: 0.75rem; margin: 0.5rem 0; line-height: 1.45; }
  pre.code { border-left: 3px solid var(--text-muted); }
  .answer { font-family: inherit; font-size: 0.9rem; }
  .label { font-size: 0.85rem; color: var(--text-secondary); margin: 0.75rem 0 0.25rem; }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 0.75rem; }
  .question { font-size: 1.15rem; line-height: 1.5; border-left: 4px solid var(--series-1); padding-left: 0.9rem; margin: 0.5rem 0; color: var(--text-primary); }
  .stats { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1rem; }
  .stat { border: 1px solid var(--hairline); border-radius: 8px; padding: 0.6rem 0.9rem; min-width: 130px; background: var(--surface-1); }
  .stat b { display: block; font-size: 1.3rem; font-variant-numeric: tabular-nums; }
  .stat span { font-size: 0.8rem; color: var(--text-secondary); }
  .tnum { font-variant-numeric: tabular-nums; }
  .tag { display: inline-block; font-size: 0.75rem; border-radius: 999px; padding: 0.05rem 0.5rem; border: 1px solid var(--hairline); white-space: nowrap; }
  .tag.answer { border-color: var(--series-1); }
  .tag.refuse { border-style: dashed; border-color: var(--text-muted); }
  .badge { font-size: 0.7rem; background: var(--text-primary); color: var(--page); border-radius: 999px; padding: 0.05rem 0.45rem; font-weight: 600; vertical-align: middle; }
  .pass { color: var(--ok); font-weight: 700; }
  .fail { color: var(--div-pos); font-weight: 700; }
  .verdict { display: inline-flex; gap: 0.5rem; align-items: center; font-size: 1rem; border: 1px solid var(--hairline); border-radius: 8px; padding: 0.4rem 0.75rem; margin: 0.25rem 0.5rem 0.25rem 0; }
  .squares { display: inline-flex; flex-wrap: wrap; gap: 3px; margin-left: 0.5rem; vertical-align: middle; }
  .sq { display: inline-grid; place-items: center; width: 1.1rem; height: 1.1rem; border-radius: 3px; font-size: 0.7rem; font-weight: 700; color: #fff; flex: none; }
  .sq.ok { background: var(--ok); }
  .sq.bad { background: var(--bad); }
  .big-squares .sq { width: 2rem; height: 2rem; font-size: 1rem; border-radius: 6px; }
  .big-squares .squares { gap: 6px; margin: 0; }
  .equation { font-size: 1rem; margin: 0.75rem 0; color: var(--text-primary); }
  .scale { position: relative; height: 12px; border-radius: 6px; background: var(--div-mid); margin: 1.5rem 0 2rem; }
  .scale .fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 6px; background: var(--series-1); }
  .scale .tick { position: absolute; top: -6px; bottom: -6px; width: 2px; background: var(--text-secondary); }
  .scale .tick span { position: absolute; top: 22px; left: 50%; transform: translateX(-50%); font-size: 0.7rem; color: var(--text-secondary); white-space: nowrap; }
  .claims-list { margin: 0.5rem 0 0; padding-left: 1.4rem; }
  .claims-list li { margin: 0.3rem 0; line-height: 1.45; }
  .claim { border: 1px solid var(--hairline); border-left: 4px solid var(--ok); border-radius: 8px; padding: 0.6rem 0.75rem; margin-top: 0.5rem; }
  .claim.bad { border-left-color: var(--bad); }
  .claim-head { display: flex; gap: 0.5rem; align-items: flex-start; }
  .claim-head b { font-weight: 600; line-height: 1.4; }
  .reason { font-size: 0.85rem; margin: 0.35rem 0 0; }
  .near { font-size: 0.8rem; margin: 0.35rem 0 0; }
  .near code { background: var(--code-bg); padding: 0.1rem 0.3rem; border-radius: 4px; overflow-wrap: anywhere; }
  mark { background: var(--mark-bg); color: inherit; border-radius: 3px; padding: 0 1px; }
  details.prompt { margin-top: 0.5rem; }
  details.prompt summary { cursor: pointer; font-size: 0.85rem; color: var(--text-secondary); }
  .gate { display: grid; grid-template-columns: 1fr auto 1fr; gap: 0.5rem; align-items: center; margin-top: 0.75rem; font-size: 0.85rem; }
  .gate div { border: 1px solid var(--hairline); border-radius: 8px; padding: 0.5rem 0.75rem; color: var(--text-secondary); }
  .gate .on { border: 2px solid var(--text-primary); color: var(--text-primary); }
  .gate .arrow { border: none; padding: 0; text-align: center; color: var(--text-muted); }
  table { border-collapse: collapse; width: 100%; font-size: 0.875rem; }
  th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--hairline); vertical-align: top; }
  th { color: var(--text-secondary); font-weight: 600; }
  .table-wrap { overflow-x: auto; }
  details.row { border: 1px solid var(--hairline); border-radius: 8px; margin-top: 0.5rem; background: var(--surface-1); }
  details.row.wrong { border-color: var(--div-pos); }
  details.row summary { cursor: pointer; display: grid; grid-template-columns: 1.5rem 1fr auto; gap: 0.25rem 0.75rem; padding: 0.6rem 0.75rem; align-items: center; list-style: none; }
  details.row summary::-webkit-details-marker { display: none; }
  .row-n { color: var(--text-muted); font-variant-numeric: tabular-nums; }
  .row-q { line-height: 1.4; }
  .row-refusal { grid-column: 3; white-space: nowrap; }
  .row-faith { grid-column: 2 / 4; display: flex; align-items: center; flex-wrap: wrap; }
  @media (min-width: 720px) {
    details.row summary { grid-template-columns: 1.5rem 1fr 11rem 12rem; }
    .row-faith { grid-column: 4; }
  }
  .row-body { padding: 0 0.75rem 0.75rem 2.75rem; }
  .row-head { display: none; }
  @media (min-width: 720px) {
    .row-head { display: grid; grid-template-columns: 1.5rem 1fr 11rem 12rem; gap: 0.75rem; padding: 0 0.75rem; font-size: 0.8rem; color: var(--text-secondary); font-weight: 600; margin-top: 1rem; }
  }
  nav.flow { margin-top: 1.25rem; }
  .lane { margin-top: 0.75rem; }
  .lane:first-child { margin-top: 0; }
  .lane-name { display: block; margin-bottom: 0.35rem; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); }
  .lane ol { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .lane li { display: flex; align-items: center; }
  .lane li + li::before { content: "→"; color: var(--text-muted); margin-right: 0.4rem; }
  .lane a { display: flex; align-items: center; gap: 0.4rem; text-decoration: none; border: 1px solid var(--border); border-radius: 8px; padding: 0.3rem 0.5rem; background: var(--surface-1); }
  .lane a:hover { border-color: var(--text-secondary); }
  .lane b { display: block; font-size: 0.8rem; }
  .lane small { display: block; font-size: 0.7rem; color: var(--text-muted); }
  ul.check { padding-left: 1.2rem; }
  ul.check li { margin: 0.5rem 0; line-height: 1.45; color: var(--text-secondary); }
  ul.check li b { color: var(--text-primary); font-weight: 600; }
</style>
</head>
<body>
<div class="viz-root">
<main>
  <h1>Grading the answers with RAGAS</h1>
  <p>The <a href="https://github.com/DerykHopley/tc-ai-experiments/tree/main/rag-langchain">rag-langchain</a> project followed questions through the pipeline. This page grades the pipeline’s answers: a second LLM (the <em>judge</em>) checks every answer against the chunks that were retrieved for it. Every value below is real output from the last <code>npm run eval</code>. Answers: <code>${esc(r.chat_model)}</code>. Judge: <code>${esc(summary.judge_model)}</code>.</p>

  <div class="stats">
    <div class="stat"><b>${score(summary.faithfulness_mean)}</b><span>mean faithfulness, over ${summary.faithfulness_scored} answers</span></div>
    <div class="stat"><b>${summary.refusal_correct} / ${summary.samples}</b><span>answered or refused as expected</span></div>
    <div class="stat"><b>${allClaims.length - unsupportedAll.length} / ${allClaims.length}</b><span>claims supported by the chunks</span></div>
  </div>

  <nav class="flow card" aria-label="Evaluation steps">
    ${flow('Prepare', [
      [1, 'Questions', `${results.length}, labelled`],
      [2, 'Run the RAG', 'per question'],
      [3, 'Sample', 'RAGAS fields'],
    ])}
    ${flow('Judge (per answer)', [
      [4, 'Refusal check', 'answered / refused'],
      [5, 'Split into claims', `${f.claims.length} here`],
      [6, 'Check each claim', `${supported} supported`],
      [7, 'Score', score(f.score)],
    ])}
    ${flow('Report', [
      [8, 'Every question', `${results.length} results`],
      [
        9,
        'What to check',
        `${mismatches.length + unsupportedAll.length} items`,
      ],
    ])}
  </nav>

  <h2 class="phase">Prepare the samples</h2>
  <p>Steps 1–3 run in TypeScript (<code>src/1-export.ts</code>), because that’s where the pipeline is. Steps 4–7 run in Python (<code>eval/2_score.py</code>), because RAGAS is a Python library. Between them sits one file, <code>output/eval/samples.jsonl</code>.</p>

  ${step(
    1,
    'Write questions with the behaviour you expect',
    'An evaluation is only as good as its questions. Each one is labelled: should the data answer it, or should the model say it doesn’t know? The “don’t know” ones include tempting questions the model could answer from its own training, but our data can’t.',
    `${code('eval/questions.json  →  [{ "question": "...", "expect": "answer" | "refuse", "notes": "..." }]')}
<div class="table-wrap"><table>
  <thead><tr><th>#</th><th>Question</th><th>Expect</th><th>Why it’s in the set</th></tr></thead>
  <tbody>${results
    .map(
      (x, i) =>
        `<tr><td class="tnum">${i + 1}</td><td>${esc(x.user_input)}${i === d.featured ? ' <span class="badge">followed below</span>' : ''}</td><td>${behaviourChip(x.expect)}</td><td class="muted">${esc(x.notes)}</td></tr>`,
    )
    .join('')}</tbody>
</table></div>`,
  )}

  ${step(
    2,
    'Run each question through the RAG pipeline',
    `The usual RAG steps: retrieve the top ${d.k} chunks, fill the prompt, call the LLM. From here on the page follows question ${d.featured + 1}.`,
    `${code(`const hits = await vectorStore.similaritySearchWithScore(question, ${d.k});
const messages = await ragPrompt.formatMessages({ context: formatContext(docs), question });
const response = await model.invoke(messages);`)}
<p class="question">${esc(r.user_input)}</p>
<div class="two">
  <div><p class="label">Retrieved chunks (cosine distance)</p><table><tbody>${r.retrieved
    .map(
      (x, i) =>
        `<tr><td class="tnum">[${i + 1}]</td><td>${esc(x.artist)}</td><td class="tnum">${x.distance.toFixed(3)}</td></tr>`,
    )
    .join('')}</tbody></table></div>
  <div><p class="label">The answer</p><pre class="answer">${esc(r.response)}</pre></div>
</div>`,
  )}

  ${step(
    3,
    'Save it as a RAGAS sample',
    'RAGAS expects fixed field names. Faithfulness needs three of them: the question, the retrieved chunks and the answer. (The fourth, <code>reference</code>, a hand-written correct answer, is only needed by the retrieval metrics we skipped.) <code>expect</code> is our own label, passed through.',
    `${code(sampleJson)}`,
  )}

  <h2 class="phase">The judge</h2>
  <p>Each step below is one LLM call to the judge model, with a fixed prompt. The judge returns JSON, which RAGAS reads into the verdicts. Expand a prompt to see exactly what the judge was sent.</p>

  ${step(
    4,
    'Did it answer, or say it doesn’t know?',
    'A RAGAS <code>DiscreteMetric</code>: our own prompt, and the judge must pick one of a fixed set of values and give a reason. This runs first, because it decides whether faithfulness applies at all. Answers that are only “I don’t know based on the data.” (plus the “Artists used” line) skip the judge: a rule marks them refused, because the small judge kept misreading them.',
    `<div>
  <span class="verdict">${r.refusal.by === 'rule' ? 'Rule' : 'Judge'}: <b>${esc(r.refusal.value)}</b></span>
  <span class="verdict">Expected: ${behaviourChip(r.expect)}</span>
  <span class="verdict">${r.refusal.correct ? '<span class="pass">✓ match</span>' : '<span class="fail">✗ mismatch</span>'}</span>
</div>
<p class="reason"><span class="muted">Reason:</span> ${esc(r.refusal.reason)}</p>
${promptBlock('Prompt sent to the judge', r.refusal.prompt)}
<div class="gate">
  <div class="${r.refusal.value === 'answered' ? 'on' : ''}"><b>answered</b> → check its claims (steps 5–7)</div>
  <div class="arrow">or</div>
  <div class="${r.refusal.value === 'refused' ? 'on' : ''}"><b>refused</b> → faithfulness n/a: “I don’t know” makes no claims about the data</div>
</div>`,
  )}

  ${step(
    5,
    'Split the answer into claims',
    'RAGAS Faithfulness, call 1. The judge rewrites the answer as short standalone statements, with names instead of pronouns, so each one can be checked on its own. This step decides what gets counted: a long answer with many small facts gets many claims.',
    f.claims.length
      ? `<div class="two">
  <div><p class="label">The answer</p><pre class="answer">${esc(r.response)}</pre></div>
  <div><p class="label">${f.claims.length} claims</p><ol class="claims-list">${f.claims.map((c) => `<li>${esc(c.claim)}</li>`).join('')}</ol></div>
</div>
${promptBlock('Prompt sent to the judge (RAGAS’s own, with a worked example)', f.prompts.claims)}`
      : '<p class="muted">Skipped: the refusal check found nothing to check.</p>',
  )}

  ${step(
    6,
    'Check each claim against the retrieved chunks',
    `RAGAS Faithfulness, call 2. The judge gets all ${r.retrieved_contexts.length} chunks joined together, plus the claims, and returns 1 if a claim can be inferred directly from the chunks, otherwise 0, with a reason. Under each verdict is the line in the chunks with the most words in common with the claim. This page finds that line, not the judge. Use it to check the verdict yourself.`,
    f.claims.length
      ? `${claimCards(r)}
${promptBlock('Prompt sent to the judge (RAGAS’s own, with the chunks and claims filled in)', f.prompts.verdicts)}`
      : '<p class="muted">Skipped.</p>',
  )}

  ${step(
    7,
    'Score: supported claims ÷ all claims',
    'No LLM here, just counting. Each square is one claim from step 6.',
    f.score === null
      ? '<p class="muted">n/a for this question.</p>'
      : `<div class="big-squares">${claimSquares(f.claims)}</div>
<p class="equation">${supported} supported ÷ ${f.claims.length} claims = <b>${score(f.score)}</b></p>
<div class="scale" role="img" aria-label="Score ${score(f.score)} on a 0 to 1 scale">
  <div class="fill" style="width:${(f.score * 100).toFixed(1)}%"></div>
  <div class="tick" style="left:60%"><span>0.6 problem</span></div>
  <div class="tick" style="left:80%"><span>0.8 target</span></div>
</div>
<p>A common rule of thumb: aim for 0.8 or above; under 0.6 means a real hallucination problem. But a low score is either an answer that adds facts, or a judge that missed one. Step 6 tells you which.</p>`,
  )}

  <h2 class="phase">Report</h2>

  ${step(
    8,
    'Every question',
    'Click a row to see the answer, the refusal verdict and every claim. Rows with a red border are where the refusal judge disagrees with the label in <code>questions.json</code>.',
    `<div class="row-head" aria-hidden="true"><span>#</span><span>Question</span><span>Refusal check</span><span>Faithfulness</span></div>
${results.map((x, i) => resultRow(x, i, d.featured)).join('\n')}`,
  )}

  ${step(
    9,
    'What to check by hand',
    'Scores point you to the answers worth reading. For each item, decide who is wrong: the RAG answer (fix the prompt, retrieval or data) or the judge (fix the judge prompt, use a stronger judge, or accept the noise).',
    `<ul class="check">${
      [
        ...mismatches.map(
          ({ x, i }) =>
            `<li><b>Q${i + 1}: expected ${x.expect === 'answer' ? 'an answer' : '“don’t know”'}, ${x.refusal.by} says ${x.refusal.value}.</b> ${esc(x.user_input)} <span class="muted">${esc(x.refusal.reason)}</span></li>`,
        ),
        ...unsupportedAll.map(({ i, c, x }) => {
          const near = closestLine(c.claim, x.retrieved_contexts);
          return `<li><b>Q${i + 1}, unsupported claim:</b> “${esc(c.claim)}” ${near ? `<span class="muted">Closest line:</span> <code>${markWords(near.line, near.shared)}</code>` : ''}</li>`;
        }),
      ].join('') ||
      '<li>Nothing: every answer matched its label and every claim was supported.</li>'
    }</ul>
<p>Judge verdicts change a little between runs. Rerun <code>uv run eval/2_score.py</code> (scoring only, no new answers) to see which items are noise and which come up every time.</p>`,
  )}
</main>
</div>
</body>
</html>
`;
}
