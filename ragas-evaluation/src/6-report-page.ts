/**
 * Step 6: The comparison report between the two evaluation processes
 * npm run report
 * ---
 * Reads rag-langchain's runs (data/rag-langchain-runs/), this project's
 * results (output/eval/results.json), the two-judge verdicts and the
 * decisions, and writes output/evaluation-comparison.html. No API calls.
 */
import fs from 'fs';
import { runScores } from './lib/cross-judge-page.ts';
import { renderReportHtml, type RagLangchainRun } from './lib/report-page.ts';

const RUNS = ['top-k-a', 'top-k-b', 'two-per-artist', 'one-per-artist'];
const OUTPUT = 'output/evaluation-comparison.html';
const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

// rag-langchain: the mean of each metric over the questions it applies to
let judgeA = '';
const runs: RagLangchainRun[] = RUNS.map((name) => {
  const run = read(`data/rag-langchain-runs/${name}.json`);
  judgeA = run.config.judgeModel;
  const results: { metrics: Record<string, any> }[] = run.results;
  const metric = (key: string) =>
    mean(
      results
        .map((r) => r.metrics[key]?.score)
        .filter((s): s is number => typeof s === 'number'),
    );
  return {
    name,
    recall: metric('contextRecall'),
    precision: metric('contextPrecision'),
    faithfulness: metric('faithfulness'),
    relevancy: metric('answerRelevancy'),
    correctness: metric('answerCorrectness'),
    refusalRight: results.filter((r) => r.metrics.behaviour?.pass).length,
    questions: results.length,
    seconds: run.seconds,
  };
});

// This project's own run
const own = read('output/eval/results.json');
const ownResults: { refusal: { by: string } }[] = own.results;

// The two-judge comparison
const { summary, claims } = read('output/cross-judge/verdicts.json');
const labels = read('eval/cross-judge-labels.json');
const sample = read('eval/agreement-sample.json');
type Claim = {
  run: string;
  id: string;
  n: number;
  agree: boolean;
  gemini: { supported: boolean };
  ragas: { supported: boolean };
};
const key = (c: Claim) => `${c.run}/${c.id}/${c.n}`;
const disagreements = (claims as Claim[]).filter((c) => !c.agree);
const right = (judge: 'gemini' | 'ragas') =>
  disagreements.filter((c) => c[judge].supported === labels[key(c)]?.supported)
    .length;
const checked = Object.values(sample) as {
  supported: boolean | null;
  judges_said: boolean;
}[];

fs.writeFileSync(
  OUTPUT,
  renderReportHtml({
    a: { judge: judgeA, runs },
    b: {
      judge: own.summary.judge_model,
      questions: own.summary.samples,
      answered: own.summary.faithfulness_scored,
      faithfulness: own.summary.faithfulness_mean,
      refusalRight: own.summary.refusal_correct,
      byRule: ownResults.filter((r) => r.refusal.by === 'rule').length,
    },
    cross: {
      claims: summary.claims,
      answers: summary.answers,
      agree: summary.agree,
      gemini: { right: right('gemini') },
      ragas: { right: right('ragas') },
      disagreements: disagreements.length,
      sample: {
        checked: checked.filter((s) => s.supported !== null).length,
        right: checked.filter((s) => s.supported === s.judges_said).length,
      },
      scores: runScores(claims, summary.runs, labels, sample),
    },
  }),
);
console.log(`Wrote ${OUTPUT}`);
