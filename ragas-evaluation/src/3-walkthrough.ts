/**
 * Step 3: Walk through the RAGAS evaluation
 * npm run walkthrough -- [question number]
 * ---
 * Reads output/eval/results.json (from `npm run eval`) and writes
 * output/eval-walkthrough.html: every judge step for one question (the
 * refusal check, the claims, the verdicts, the score), then the results for
 * all questions and a list of what to check by hand.
 *
 * Without a number it follows the answered question with the most
 * unsupported claims. No API calls.
 */
import fs from 'fs';
import { RAG_K } from './lib/pipeline.ts';
import {
  renderEvalHtml,
  type EvalResult,
  type EvalSummary,
} from './lib/eval-page.ts';

const INPUT = 'output/eval/results.json';
const OUTPUT = 'output/eval-walkthrough.html';

const { summary, results }: { summary: EvalSummary; results: EvalResult[] } =
  JSON.parse(fs.readFileSync(INPUT, 'utf8'));

const unsupported = (r: EvalResult) =>
  r.faithfulness.claims.filter((c) => !c.supported).length;

let featured: number;
if (process.argv[2]) {
  featured = Number(process.argv[2]) - 1;
  if (!results[featured]) {
    throw new Error(`Pick a question from 1 to ${results.length}`);
  }
} else {
  // The most interesting one to follow: most unsupported claims, then most
  // claims overall
  featured = results
    .map((r, i) => ({
      i,
      bad: unsupported(r),
      all: r.faithfulness.claims.length,
    }))
    .sort((a, b) => b.bad - a.bad || b.all - a.all)[0].i;
}

fs.writeFileSync(
  OUTPUT,
  renderEvalHtml({ summary, results, featured, k: RAG_K }),
);
console.log(
  `Following question ${featured + 1}: ${results[featured].user_input}`,
);
console.log(`Wrote ${OUTPUT}`);
