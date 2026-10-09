// The comparison report between the two evaluation processes: rag-langchain's
// own TypeScript evaluation and this project's RAGAS one. The prose is fixed;
// every number comes from the saved runs (see src/6-report-page.ts).
import { THEME_CSS } from './page-theme.ts';

export type RagLangchainRun = {
  name: string;
  recall: number;
  precision: number;
  faithfulness: number;
  relevancy: number;
  correctness: number;
  refusalRight: number;
  questions: number;
  seconds: number;
};

export type ReportData = {
  a: { judge: string; runs: RagLangchainRun[] };
  b: {
    judge: string;
    questions: number;
    answered: number;
    faithfulness: number;
    refusalRight: number;
    byRule: number;
  };
  cross: {
    claims: number;
    answers: number;
    agree: number;
    gemini: { right: number };
    ragas: { right: number };
    disagreements: number;
    sample: { checked: number; right: number };
    scores: {
      run: string;
      gemini: number;
      ragas: number;
      checked: number | null;
    }[];
  };
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const f2 = (n: number) => n.toFixed(2);
const pct = (n: number) => `${Math.round(n * 100)}%`;
const range = (xs: number[]) => {
  const lo = f2(Math.min(...xs));
  const hi = f2(Math.max(...xs));
  return lo === hi ? lo : `${lo}–${hi}`;
};

const PAGES = {
  aComparison:
    'https://derykhopley.github.io/tc-ai-experiments/rag-langchain/output/eval-runs/comparison.html',
  aCode:
    'https://github.com/DerykHopley/tc-ai-experiments/tree/main/rag-langchain',
  walkthrough: 'eval-walkthrough.html',
  crossJudge: 'cross-judge.html',
};

function flow(steps: [string, string][]): string {
  return `<ol class="flow">${steps
    .map(([name, detail]) => `<li><b>${name}</b><small>${detail}</small></li>`)
    .join('')}</ol>`;
}

export function renderReportHtml(d: ReportData): string {
  const { a, b, cross } = d;
  const aFaith = a.runs.map((r) => r.faithfulness);
  const swing = Math.max(
    ...cross.scores.map((s) => Math.abs(s.gemini - s.ragas)),
  );
  const strategySpread = Math.max(...aFaith) - Math.min(...aFaith);
  const best = (pick: (s: ReportData['cross']['scores'][0]) => number) =>
    [...cross.scores].sort((x, y) => pick(y) - pick(x))[0].run;
  const worst = (pick: (s: ReportData['cross']['scores'][0]) => number) =>
    [...cross.scores].sort((x, y) => pick(x) - pick(y))[0].run;

  const aRows = a.runs
    .map(
      (r) =>
        `<tr><td>${esc(r.name)}</td><td class="tnum">${f2(r.recall)}</td><td class="tnum">${f2(r.precision)}</td><td class="tnum">${f2(r.faithfulness)}</td><td class="tnum">${f2(r.relevancy)}</td><td class="tnum">${f2(r.correctness)}</td><td class="tnum">${r.refusalRight}/${r.questions}</td></tr>`,
    )
    .join('');
  const scoreRows = cross.scores
    .map(
      (s) =>
        `<tr><td>${esc(s.run)}</td><td class="tnum">${f2(s.gemini)}</td><td class="tnum">${f2(s.ragas)}</td><td class="tnum"><b>${s.checked === null ? '–' : f2(s.checked)}</b></td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Evaluation Processes Compared</title>
<style>
${THEME_CSS}  body { margin: 0; background: #f9f9f7; }
  @media (prefers-color-scheme: dark) { body { background: #0d0d0d; } }
  .viz-root {
    min-height: 100vh; background: var(--page); color: var(--text-primary);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 2rem 16px; box-sizing: border-box;
  }
  main { max-width: 900px; margin: 0 auto; }
  h1 { font-size: 1.6rem; margin: 0 0 0.25rem; }
  h2 { font-size: 1.15rem; margin: 0 0 0.6rem; }
  h3 { font-size: 0.95rem; margin: 1.1rem 0 0.4rem; }
  p, li { color: var(--text-secondary); line-height: 1.55; }
  p { margin: 0 0 0.75rem; }
  b, strong { color: var(--text-primary); }
  a { color: var(--series-1); }
  .lead { font-size: 1.02rem; }
  .card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; margin-top: 1rem; }
  .card.key { border-left: 4px solid var(--series-1); }
  ul { padding-left: 1.2rem; margin: 0.25rem 0 0.5rem; }
  li { margin: 0.35rem 0; }
  table { border-collapse: collapse; width: 100%; font-size: 0.875rem; }
  th, td { text-align: left; padding: 0.45rem 0.6rem; border-bottom: 1px solid var(--hairline); vertical-align: top; }
  th { color: var(--text-secondary); font-weight: 600; }
  td { color: var(--text-secondary); }
  td:first-child { color: var(--text-primary); font-weight: 600; }
  .tnum { font-variant-numeric: tabular-nums; text-align: right; }
  .table-wrap { overflow-x: auto; }
  .who { white-space: nowrap; font-weight: 600; }
  .who.a { color: var(--series-1); }
  .who.b { color: var(--series-2); }
  .who.both { color: var(--series-3); }
  code { font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-size: 0.85em; }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; }
  .flow { list-style: none; margin: 0.5rem 0 0; padding: 0; display: grid; gap: 0.35rem; }
  .flow li { margin: 0; border: 1px solid var(--hairline); border-radius: 8px; padding: 0.4rem 0.6rem; position: relative; }
  .flow li + li::before { content: "↓"; position: absolute; top: -0.85rem; left: 1rem; color: var(--text-muted); font-size: 0.75rem; }
  .flow b { display: block; font-size: 0.85rem; }
  .flow small { display: block; font-size: 0.78rem; color: var(--text-muted); line-height: 1.4; }
  .label-a, .label-b { display: inline-block; font-size: 0.75rem; font-weight: 700; border-radius: 999px; padding: 0.05rem 0.55rem; color: #fff; margin-right: 0.35rem; }
  .label-a { background: var(--series-1); }
  .label-b { background: var(--series-2); }
  .stats { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 0.75rem 0; }
  .stat { border: 1px solid var(--hairline); border-radius: 8px; padding: 0.6rem 0.9rem; min-width: 140px; }
  .stat b { display: block; font-size: 1.3rem; font-variant-numeric: tabular-nums; }
  .stat span { font-size: 0.8rem; color: var(--text-secondary); }
  .muted { color: var(--text-muted); }
</style>
</head>
<body>
<div class="viz-root">
<main>
  <h1>Two ways to evaluate the same RAG pipeline</h1>
  <p class="lead">The same music RAG pipeline (top 6 chunks, answers by <code>gpt-5-mini</code>) was evaluated twice. <span class="label-a">A</span> is <a href="${PAGES.aCode}">rag-langchain</a>’s own evaluation: RAGAS’s ideas reimplemented in TypeScript, judged by <code>${esc(a.judge)}</code>. <span class="label-b">B</span> is this project: the real RAGAS library in Python, judged by <code>${esc(b.judge)}</code>. This report compares the two processes: what each measures, what each found and missed, and how far either judge can be trusted.</p>

  <section class="card key">
    <h2>In short</h2>
    <ul>
      <li><strong>A measures more; B only measures generation.</strong> A scores retrieval without an LLM (context recall and precision against expected artists) and four answer metrics. B scores faithfulness and refusal only. B’s answers were faithful but incomplete, and B couldn’t see it.</li>
      <li><strong>Each process caught something the other missed.</strong> A found that one artist crowding the top 6 caused every retrieval miss. B found a mislabelled field (birth dates shown as “Active since”) that faithfulness passes as fully supported.</li>
      <li><strong>The judge matters more than the library.</strong> On the same ${cross.claims} claims, the judges agree on ${pct(cross.agree / cross.claims)}, and Gemini was right on ${cross.gemini.right} of the ${cross.disagreements} disagreements. The choice of judge moves faithfulness by up to ${f2(swing)}, more than the ${f2(strategySpread)} between A’s retrieval strategies, and reverses their ranking.</li>
      <li><strong>Agreement is mostly trustworthy.</strong> In a sample of ${cross.sample.checked} claims both judges agreed on, ${cross.sample.right} were right.</li>
      <li><strong>Recommendation:</strong> keep A as the main evaluation, and take three things from B: the label fix, a rule for plain “I don’t know” answers, and a second judge run on a sample, with disagreements checked by hand.</li>
    </ul>
  </section>

  <section class="card">
    <h2>At a glance</h2>
    <div class="table-wrap"><table>
      <thead><tr><th></th><th><span class="label-a">A</span>rag-langchain</th><th><span class="label-b">B</span>ragas-evaluation</th></tr></thead>
      <tbody>
        <tr><td>Built with</td><td>TypeScript only. The judge is called through LangChain with typed (zod) output.</td><td>TypeScript pipeline, Python RAGAS 0.4.3. One JSONL file sits between them.</td></tr>
        <tr><td>Judge</td><td><code>${esc(a.judge)}</code> (a different family from the answering model)</td><td><code>${esc(b.judge)}</code> (also a different model from the answering one)</td></tr>
        <tr><td>Retrieval metrics</td><td>Context recall and precision, plain arithmetic over expected artists</td><td>None</td></tr>
        <tr><td>Answer metrics</td><td>Faithfulness, answer relevancy, correctness against a reference, refusal</td><td>Faithfulness, refusal</td></tr>
        <tr><td>Test set</td><td>${a.runs[0].questions} questions, grouped (genre, fact, open, trap, out of scope), each with expected artists and a reference answer</td><td>${b.questions} questions, each labelled “answer” or “refuse”, including 3 traps the model could answer from memory</td></tr>
        <tr><td>Experiments</td><td>${a.runs.length} runs: top-k twice (to measure noise), 2 per artist, 1 per artist</td><td>One run with the label fix, then the two-judge comparison on A’s runs</td></tr>
        <tr><td>Setup</td><td>Node only</td><td>Node, plus uv with Python 3.12 or 3.13 (RAGAS doesn’t install on 3.14), pinned LangChain versions, analytics switched off</td></tr>
        <tr><td>Output</td><td>A page per run and a comparison of runs</td><td>A step-by-step walkthrough, and the two-judge comparison</td></tr>
      </tbody>
    </table></div>
  </section>

  <section class="card">
    <h2>How each process runs</h2>
    <div class="two">
      <div><span class="label-a">A</span>
        ${flow([
          ['Questions', 'with expected artists and a reference answer'],
          [
            'Retrieve and answer',
            'the real pipeline, with a chosen retrieval strategy',
          ],
          ['Retrieval metrics', 'recall and precision: arithmetic, no LLM'],
          [
            'Judge calls, in parallel',
            'faithfulness (2 calls), relevancy (1 call + embeddings), correctness, refusal',
          ],
          ['One JSON file and page per run', 'then a page comparing the runs'],
        ])}
      </div>
      <div><span class="label-b">B</span>
        ${flow([
          ['Questions', 'labelled “answer” or “refuse”'],
          [
            'Retrieve and answer (TypeScript)',
            'written to samples.jsonl in RAGAS’s field names',
          ],
          [
            'Refusal check (Python)',
            'a rule for plain “I don’t know”, otherwise a RAGAS DiscreteMetric',
          ],
          [
            'Faithfulness, answers only',
            'RAGAS: split into claims, then a verdict for each',
          ],
          [
            'results.json and a walkthrough page',
            'every judge prompt and verdict kept',
          ],
        ])}
      </div>
    </div>
  </section>

  <section class="card">
    <h2>Faithfulness: the same idea, different details</h2>
    <p>Both split the answer into claims and check each claim against the retrieved chunks. Score = supported ÷ all. The details differ, and they matter:</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Detail</th><th><span class="label-a">A</span></th><th><span class="label-b">B</span> (RAGAS)</th></tr></thead>
      <tbody>
        <tr><td>“I don’t know” and “Artists used: …”</td><td>The claim prompt tells the judge to skip them, so a refusal has no claims and no score</td><td>Split into claims like any other text and scored at random (0, 0.5 or 1), so B only runs faithfulness on answers</td></tr>
        <tr><td>Where the support is</td><td>The judge names the numbered chunk that supports each claim</td><td>A reason only, no chunk number</td></tr>
        <tr><td>The chunks the judge sees</td><td>Numbered, exactly as in the answer prompt</td><td>Joined into one text</td></tr>
        <tr><td>Prompt</td><td>Short, our own wording</td><td>RAGAS’s, with worked examples (about 3,000 characters before the chunks)</td></tr>
      </tbody>
    </table></div>
  </section>

  <section class="card">
    <h2>What each process found, and missed</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Finding</th><th>Found by</th><th>Why the other missed it</th></tr></thead>
      <tbody>
        <tr><td>Every retrieval miss was crowding: one artist filling several of the 6 slots</td><td class="who a">A</td><td>B has no expected artists, so it can’t measure recall. B’s own soul answer used Aretha Franklin in 5 of 6 slots and still scored 1.0.</td></tr>
        <tr><td>Faithful but incomplete: answers stuck to what was retrieved, so only correctness dropped</td><td class="who a">A</td><td>B has no reference answers, so it has no correctness metric.</td></tr>
        <tr><td>Answer relevancy measured the metric more than the answers</td><td class="who a">A</td><td>B doesn’t run answer relevancy.</td></tr>
        <tr><td>Capping chunks per artist trades depth for breadth</td><td class="who a">A</td><td>B ran one strategy only.</td></tr>
        <tr><td>“Active since” showed a person’s birth date as their career start, and faithfulness passed it</td><td class="who b">B</td><td>A’s only date question is about Daft Punk, a group, for whom the label is correct. Only a question about a person’s career exposes it.</td></tr>
        <tr><td>RAGAS scores “I don’t know” answers at random</td><td class="who b">B</td><td>A’s own claim prompt already avoids it.</td></tr>
        <tr><td>A small judge misreads plain “I don’t know”; a rule is more reliable</td><td class="who b">B</td><td>A’s Gemini judge got the refusals right (${a.runs[0].refusalRight}/${a.runs[0].questions} in the first run).</td></tr>
        <tr><td>Judges are noisy: the same answer gets different scores across runs</td><td class="who both">Both</td><td>A ran top-k twice; B rescored the same answers.</td></tr>
        <tr><td>Judges hesitate to turn tags into a category</td><td class="who b">B</td><td>Seen in the two-judge comparison of A’s answers: Gemini rejected “Marvin Gaye is a classic soul / Motown singer” with both tags in the chunk, and both judges rejected Aretha Franklin’s “soul / Motown” with her soul tags in the chunk.</td></tr>
      </tbody>
    </table></div>
    <h3>Scores as each process reported them</h3>
    <p><span class="label-a">A</span> per run:</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Run</th><th class="tnum">Recall</th><th class="tnum">Precision</th><th class="tnum">Faithfulness</th><th class="tnum">Relevancy</th><th class="tnum">Correctness</th><th class="tnum">Refusal right</th></tr></thead>
      <tbody>${aRows}</tbody>
    </table></div>
    <p style="margin-top:0.75rem"><span class="label-b">B</span>: faithfulness <b>${f2(b.faithfulness)}</b> over ${b.answered} answers; refusal right <b>${b.refusalRight}/${b.questions}</b>, ${b.byRule} of them decided by the rule. The questions differ from A’s, so these numbers can’t be compared with A’s directly. The next section can.</p>
  </section>

  <section class="card">
    <h2>How far can the judge be trusted?</h2>
    <p>To compare the judges directly, the ${cross.claims} claims from A’s ${cross.answers} answers were judged again by B’s judge with RAGAS’s prompt, against the same chunks. Every disagreement was settled from the chunk text, or by hand where it was a judgement call. <a href="${PAGES.crossJudge}">Full comparison →</a></p>
    <div class="stats">
      <div class="stat"><b>${pct(cross.agree / cross.claims)}</b><span>same verdict (${cross.agree} of ${cross.claims})</span></div>
      <div class="stat"><b>${cross.gemini.right} – ${cross.ragas.right}</b><span>right on the ${cross.disagreements} disagreements: Gemini – RAGAS</span></div>
      <div class="stat"><b>${cross.sample.right} / ${cross.sample.checked}</b><span>sampled agreements that were right</span></div>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>A’s run</th><th class="tnum">Gemini’s verdicts</th><th class="tnum">RAGAS’s verdicts</th><th class="tnum">Checked</th></tr></thead>
      <tbody>${scoreRows}</tbody>
    </table></div>
    <ul>
      <li><strong>The judge moves the score more than the strategies do.</strong> Gemini’s faithfulness per run is ${range(cross.scores.map((s) => s.gemini))}; RAGAS’s is ${range(cross.scores.map((s) => s.ragas))}. Gemini puts ${esc(worst((s) => s.gemini))} last; RAGAS puts ${esc(best((s) => s.ragas))} first. A conclusion like “strategy X is more faithful” needs the judge named next to it.</li>
      <li><strong>The checked scores are close to Gemini’s.</strong> RAGAS’s judge mostly erred by rejecting facts in plain sight: release years, values in tag lists, and reading “or” as “and”.</li>
      <li><strong>What counts as “supported” is a choice.</strong> Is one crowd-sourced tag, or an album title, evidence? No judge prompt settles that. Those cases were decided by hand and recorded with the reason.</li>
    </ul>
  </section>

  <section class="card">
    <h2>Recommendation</h2>
    <ul>
      <li><strong>Keep <span class="label-a">A</span> as the main evaluation.</strong> It measures retrieval as well as generation, has the more reliable judge, and names the chunk behind each verdict, which makes checking quick.</li>
      <li><strong>Port the label fix to rag-langchain</strong> (<code>Born:</code> for people, <code>Formed:</code> for groups), reindex, and rerun. Its published runs still use “Active since”.</li>
      <li><strong>Add B’s kind of questions to A’s set:</strong> a person’s career start, and traps the model could answer from memory (members, sales). Ask some questions that want more detail (“and their albums”), not just “which X are in the data”: they test retrieval depth.</li>
      <li><strong>Add a rule for plain “I don’t know” answers</strong> before the refusal judge, so a judge change can’t break it.</li>
      <li><strong>Use a second judge as a check, not a second score.</strong> Run it on a sample, read the disagreements, and report scores with the judge’s name. Treat differences smaller than the judge noise (about ${f2(Math.max(...a.runs.slice(0, 2).map((r) => r.faithfulness)) - Math.min(...a.runs.slice(0, 2).map((r) => r.faithfulness)))} between A’s two identical top-k runs) as no difference.</li>
      <li><strong>Use B for learning, not for the main number.</strong> The RAGAS library is a useful reference implementation and a ready second judge, but its default prompts with a small model were the least reliable part of either process.</li>
    </ul>
  </section>

  <section class="card">
    <h2>Limits</h2>
    <ul>
      <li>Small numbers: ${a.runs[0].questions} and ${b.questions} questions, ${cross.claims} claims, one pass of B’s judge on A’s claims, ${cross.sample.checked} sampled agreements.</li>
      <li>In the two-judge comparison Gemini wrote the claims, which may suit Gemini’s verdicts. RAGAS’s claim-splitting step was skipped so the verdicts could be compared one to one.</li>
      <li>B’s numbers come from a different question set and a fixed label, so A’s and B’s scores in the tables above aren’t directly comparable. Only the two-judge comparison uses identical inputs.</li>
      <li>The judgement calls reflect one person’s reading of “supported”, recorded with their reasons in <code>eval/cross-judge-labels.json</code> and <code>eval/agreement-sample.json</code>.</li>
    </ul>
    <p class="muted">Pages: <a href="${PAGES.aComparison}">A’s run comparison</a> · <a href="${PAGES.walkthrough}">B’s walkthrough</a> · <a href="${PAGES.crossJudge}">Two-judge comparison</a></p>
  </section>
</main>
</div>
</body>
</html>
`;
}
