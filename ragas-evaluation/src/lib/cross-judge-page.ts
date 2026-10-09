// A self-contained HTML page comparing two judges' verdicts on the same
// claims, with the human decisions on the claims they disagree about.
// Rendered on the server (escaped); there is no script.
import { closestLine, markWords } from './eval-page.ts';
import { THEME_CSS } from './page-theme.ts';

type Verdict = { supported: boolean; reason: string };

export type JudgedClaim = {
  run: string;
  id: string;
  question: string;
  answer: string;
  chunks: string[];
  n: number;
  claim: string;
  gemini: Verdict & { source: number | null };
  ragas: Verdict;
  agree: boolean;
};

export type CrossJudgeSummary = {
  judges: { gemini: string; ragas: string };
  runs: string[];
  answers: number;
  claims: number;
  agree: number;
};

// Who decided each disagreement, keyed by run/id/claim number
export type Label = {
  claim: string;
  supported: boolean | null;
  pattern: string;
  evidence: string;
  by: string | null;
};

// A sampled claim both judges agreed on, checked by hand
export type SampleCheck = {
  claim: string;
  judges_said: boolean;
  supported: boolean | null;
  evidence: string;
  by: string | null;
};

export type CrossJudgePageData = {
  summary: CrossJudgeSummary;
  claims: JudgedClaim[];
  labels: Record<string, Label>;
  sample: Record<string, SampleCheck>;
};

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const pct = (n: number) => `${Math.round(n * 100)}%`;
const keyOf = (c: JudgedClaim) => `${c.run}/${c.id}/${c.n}`;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function verdictMark(supported: boolean): string {
  return `<span class="sq ${supported ? 'ok' : 'bad'}">${supported ? '✓' : '✗'}</span>`;
}

// Faithfulness per answer under each judge's verdicts, averaged per run.
// "checked" uses the shared verdict where the judges agree and the decision
// where they don't (null while any disagreement in the run is undecided).
// Sampled agreements that were checked use the checked answer instead.
export function runScores(
  claims: JudgedClaim[],
  runs: string[],
  labels: Record<string, Label>,
  sample: Record<string, SampleCheck>,
) {
  return runs.map((run) => {
    const answers = new Map<string, JudgedClaim[]>();
    for (const c of claims.filter((x) => x.run === run)) {
      answers.set(c.id, [...(answers.get(c.id) ?? []), c]);
    }
    const score = (pick: (c: JudgedClaim) => boolean | null | undefined) =>
      mean(
        [...answers.values()].map((cs) => cs.filter(pick).length / cs.length),
      );
    return {
      run,
      answers: answers.size,
      gemini: score((c) => c.gemini.supported),
      ragas: score((c) => c.ragas.supported),
      checked: claims.some(
        (c) => c.run === run && !c.agree && labels[keyOf(c)]?.supported == null,
      )
        ? null
        : score((c) =>
            c.agree
              ? (sample[keyOf(c)]?.supported ?? c.gemini.supported)
              : labels[keyOf(c)].supported,
          ),
    };
  });
}

function sampleSection(d: CrossJudgePageData): string {
  const entries = Object.entries(d.sample);
  if (!entries.length) return '';
  const checked = entries.filter(([, s]) => s.supported !== null);
  const wrong = checked.filter(([, s]) => s.supported !== s.judges_said);
  const rejected = entries.filter(([, s]) => !s.judges_said).length;
  const rows = entries
    .map(([key, s]) => {
      const ok = s.supported === null ? null : s.supported === s.judges_said;
      return `<tr class="${ok === false ? 'wrong' : ''}"><td>${ok === null ? '<span class="pending">?</span>' : ok ? '<span class="pass">✓</span>' : '<span class="fail">✗</span>'}</td><td>${esc(s.claim)}<div class="muted small">${esc(key)} · both judges: ${s.judges_said ? 'supported' : 'not supported'}</div></td><td class="small">${esc(s.evidence)}${s.by && !s.by.startsWith('claude') ? ` <span class="muted">(${esc(s.by)})</span>` : ''}</td></tr>`;
    })
    .join('');
  return `<section class="card">
    <h2>Can we trust it when they agree?</h2>
    <p>Two judges agreeing doesn’t make them right. ${entries.length} agreed claims were checked against the chunks: the ${rejected} that both judges rejected, plus ${entries.length - rejected} drawn at random from the ones both accepted (seed 42, <code>eval/sample_agreements.py</code>). <b>${checked.length - wrong.length} of ${checked.length}</b> were right.${wrong.length ? ` Where they were wrong, both judges made the same mistake.` : ''}</p>
    <div class="table-wrap"><table class="sample">
      <thead><tr><th></th><th>Claim</th><th>Evidence in the chunks</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </section>`;
}

export function renderCrossJudgeHtml(d: CrossJudgePageData): string {
  const { summary, claims, labels } = d;
  const g = summary.judges.gemini;
  const r = summary.judges.ragas;
  const disagreements = claims.filter((c) => !c.agree);
  const decided = disagreements.filter(
    (c) => labels[keyOf(c)]?.supported !== null && labels[keyOf(c)],
  );
  const right = (judge: 'gemini' | 'ragas') =>
    decided.filter((c) => c[judge].supported === labels[keyOf(c)].supported)
      .length;
  const undecided = disagreements.length - decided.length;

  const count = (gs: boolean, rs: boolean) =>
    claims.filter((c) => c.gemini.supported === gs && c.ragas.supported === rs)
      .length;
  const matrix = `<table class="matrix">
  <thead><tr><th></th><th colspan="2">${esc(r)} (RAGAS prompt)</th></tr>
  <tr><th>${esc(g)}</th><th>supported</th><th>not supported</th></tr></thead>
  <tbody>
    <tr><th>supported</th><td class="same">${count(true, true)}</td><td class="diff">${count(true, false)}</td></tr>
    <tr><th>not supported</th><td class="diff">${count(false, true)}</td><td class="same">${count(false, false)}</td></tr>
  </tbody>
</table>`;

  const scores = runScores(claims, summary.runs, labels, d.sample);
  const scoreRows = scores
    .map(
      (s) =>
        `<tr><td>${esc(s.run)}</td><td class="tnum">${s.answers}</td><td class="tnum">${s.gemini.toFixed(2)}</td><td class="tnum">${s.ragas.toFixed(2)}</td><td class="tnum"><b>${s.checked === null ? '–' : s.checked.toFixed(2)}</b></td></tr>`,
    )
    .join('');

  // Disagreements grouped by what went wrong
  const patterns = new Map<string, JudgedClaim[]>();
  for (const c of disagreements) {
    const p = labels[keyOf(c)]?.pattern ?? 'Not looked at yet';
    patterns.set(p, [...(patterns.get(p) ?? []), c]);
  }
  const patternRows = [...patterns]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([p, cs]) => {
      const wrong = (judge: 'gemini' | 'ragas') =>
        cs.filter((c) => {
          const l = labels[keyOf(c)];
          return (
            l && l.supported !== null && c[judge].supported !== l.supported
          );
        }).length;
      return `<tr><td>${esc(p)}</td><td class="tnum">${cs.length}</td><td class="tnum">${wrong('gemini') || ''}</td><td class="tnum">${wrong('ragas') || ''}</td></tr>`;
    })
    .join('');

  const card = (c: JudgedClaim, i: number) => {
    const l = labels[keyOf(c)];
    const near = closestLine(c.claim, c.chunks);
    const decision =
      !l || l.supported === null
        ? '<span class="pending">Undecided: your call</span>'
        : `Decided: <b>${l.supported ? 'supported' : 'not supported'}</b> → <b>${c.gemini.supported === l.supported ? 'Gemini' : 'RAGAS'}</b> was right <span class="muted">(${esc(l.by ?? '')})</span>`;
    return `<div class="claim${!l || l.supported === null ? ' open' : ''}">
  <p class="where"><span class="muted">#${i + 1} · ${esc(c.run)} · ${esc(c.question)}</span>${l ? ` <span class="tag">${esc(l.pattern)}</span>` : ''}</p>
  <p class="text">“${esc(c.claim)}”</p>
  <div class="two">
    <p>${verdictMark(c.gemini.supported)} <b>Gemini</b> ${esc(c.gemini.reason)}</p>
    <p>${verdictMark(c.ragas.supported)} <b>RAGAS</b> ${esc(c.ragas.reason)}</p>
  </div>
  ${l ? `<p class="evidence"><span class="muted">Evidence:</span> ${esc(l.evidence)}</p>` : near ? `<p class="evidence"><span class="muted">Closest line, chunk [${near.chunk}]:</span> <code>${markWords(near.line, near.shared)}</code></p>` : ''}
  <p class="decision">${decision}</p>
</div>`;
  };

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Two Judges Compared</title>
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
  h2 { font-size: 1.1rem; margin: 0 0 0.5rem; }
  p { color: var(--text-secondary); line-height: 1.5; margin: 0 0 0.75rem; }
  .muted { color: var(--text-muted); }
  .card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; margin-top: 1rem; }
  .stats { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1rem; }
  .stat { border: 1px solid var(--hairline); border-radius: 8px; padding: 0.6rem 0.9rem; min-width: 130px; background: var(--surface-1); }
  .stat b { display: block; font-size: 1.3rem; font-variant-numeric: tabular-nums; }
  .stat span { font-size: 0.8rem; color: var(--text-secondary); }
  table { border-collapse: collapse; font-size: 0.875rem; }
  th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--hairline); }
  th { color: var(--text-secondary); font-weight: 600; }
  .tnum { font-variant-numeric: tabular-nums; text-align: right; }
  .table-wrap { overflow-x: auto; }
  .matrix td { text-align: center; font-size: 1.1rem; font-variant-numeric: tabular-nums; min-width: 6rem; }
  .matrix td.same { background: var(--mark-bg); font-weight: 700; }
  .matrix td.diff { background: var(--mark-alt-bg); font-weight: 700; }
  .sq { display: inline-grid; place-items: center; width: 1.1rem; height: 1.1rem; border-radius: 3px; font-size: 0.7rem; font-weight: 700; color: #fff; vertical-align: text-bottom; }
  .sq.ok { background: var(--ok); }
  .sq.bad { background: var(--bad); }
  .claim { border: 1px solid var(--hairline); border-radius: 8px; padding: 0.75rem; margin-top: 0.75rem; }
  .claim.open { border: 2px dashed var(--series-2); }
  .claim p { margin: 0.3rem 0; font-size: 0.875rem; }
  .claim .text { font-size: 1rem; color: var(--text-primary); }
  .claim .where { font-size: 0.8rem; }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 0 1rem; }
  .tag { display: inline-block; font-size: 0.75rem; border: 1px solid var(--hairline); border-radius: 999px; padding: 0 0.5rem; color: var(--text-secondary); }
  .evidence code { background: var(--code-bg); padding: 0.1rem 0.3rem; border-radius: 4px; overflow-wrap: anywhere; font-size: 0.8rem; }
  mark { background: var(--mark-bg); color: inherit; }
  .decision { color: var(--text-primary); }
  .pending { color: var(--series-2); font-weight: 700; }
  .pass { color: var(--ok); font-weight: 700; }
  .fail { color: var(--div-pos); font-weight: 700; }
  .small { font-size: 0.8rem; }
  table.sample td { vertical-align: top; }
  table.sample tr.wrong td { background: var(--mark-alt-bg); }
  ul { color: var(--text-secondary); line-height: 1.5; padding-left: 1.2rem; }
  li { margin: 0.35rem 0; }
  code { font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-size: 0.85em; }
</style>
</head>
<body>
<div class="viz-root">
<main>
  <h1>Two judges, the same claims</h1>
  <p>rag-langchain scored its answers with <code>${esc(g)}</code> as the judge. Here the same ${summary.claims} claims from ${summary.answers} answers (${summary.runs.length} runs) were judged again by <code>${esc(r)}</code> with RAGAS’s own verdict prompt, against the same numbered chunks. Where the two disagree, the chunk text decides who was right.</p>

  <div class="stats">
    <div class="stat"><b>${pct(summary.agree / summary.claims)}</b><span>of claims get the same verdict (${summary.agree} of ${summary.claims})</span></div>
    <div class="stat"><b>${disagreements.length}</b><span>disagreements</span></div>
    <div class="stat"><b>${right('gemini')} – ${right('ragas')}</b><span>right on the ${decided.length} decided: Gemini – RAGAS</span></div>
    ${undecided ? `<div class="stat"><b>${undecided}</b><span>still undecided</span></div>` : ''}
  </div>

  <section class="card">
    <h2>Where they agree</h2>
    <p>Rows are Gemini’s verdict, columns RAGAS’s. Blue cells are agreement; orange cells are the disagreements listed below. Most disagreements are claims Gemini accepted and RAGAS rejected: RAGAS’s judge is stricter, but stricter isn’t the same as right.</p>
    <div class="table-wrap">${matrix}</div>
  </section>

  <section class="card">
    <h2>What it does to the score</h2>
    <p>The same answers, scored with each judge’s verdicts (supported ÷ claims per answer, averaged per run). This is how much a faithfulness score depends on which judge you pick. <b>Checked</b> uses the shared verdict where the judges agree, and the decision below where they don’t.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Run</th><th class="tnum">Answers</th><th class="tnum">Gemini</th><th class="tnum">RAGAS</th><th class="tnum">Checked</th></tr></thead>
      <tbody>${scoreRows}</tbody>
    </table></div>
  </section>

  <section class="card">
    <h2>What went wrong</h2>
    <p>Each disagreement, grouped by the kind of mistake, and which judge made it.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Pattern</th><th class="tnum">Claims</th><th class="tnum">Gemini wrong</th><th class="tnum">RAGAS wrong</th></tr></thead>
      <tbody>${patternRows}</tbody>
    </table></div>
  </section>

  <section class="card">
    <h2>Every disagreement</h2>
    <p>Decisions are in <code>eval/cross-judge-labels.json</code>. Clear cases were decided from the chunk text (the evidence line is quoted). Dashed cards are judgement calls, left for a person to decide.</p>
    ${disagreements.map(card).join('\n')}
  </section>

  ${sampleSection(d)}

  <section class="card">
    <h2>Limits</h2>
    <ul>
      <li><strong>Gemini wrote the claims.</strong> RAGAS’s claim-splitting step was skipped so the verdicts could be compared one to one, so every claim is phrased the way Gemini split the answer.</li>
      <li><strong>One pass of the RAGAS judge.</strong> Its verdicts move between runs. The agreement rate is for this pass.</li>
      <li><strong>Agreements were only sampled.</strong> ${Object.keys(d.sample).length} of ${summary.agree} were checked, so the error rate among agreements is a rough estimate. The “checked” scores assume every agreement not in the sample is right.</li>
      <li><strong>The four runs share questions,</strong> so the same claim (“Adele released 21 in 2011”) can count up to four times.</li>
    </ul>
  </section>
</main>
</div>
</body>
</html>
`;
}
