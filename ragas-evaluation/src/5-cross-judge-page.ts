/**
 * Step 5: The two-judge comparison as a page
 * npm run cross-judge-page
 * ---
 * Reads output/cross-judge/verdicts.json (from `npm run cross-judge`) and the
 * decisions in eval/cross-judge-labels.json, and writes
 * output/cross-judge.html. No API calls, so rerun it after editing a label.
 */
import fs from 'fs';
import {
  renderCrossJudgeHtml,
  type CrossJudgePageData,
} from './lib/cross-judge-page.ts';

const VERDICTS = 'output/cross-judge/verdicts.json';
const LABELS = 'eval/cross-judge-labels.json';
const OUTPUT = 'output/cross-judge.html';

const { summary, claims } = JSON.parse(fs.readFileSync(VERDICTS, 'utf8'));
const labels = fs.existsSync(LABELS)
  ? JSON.parse(fs.readFileSync(LABELS, 'utf8'))
  : {};
const data: CrossJudgePageData = { summary, claims, labels };

fs.writeFileSync(OUTPUT, renderCrossJudgeHtml(data));
const open = claims.filter(
  (c: { agree: boolean; run: string; id: string; n: number }) =>
    !c.agree && labels[`${c.run}/${c.id}/${c.n}`]?.supported == null,
).length;
console.log(
  `Wrote ${OUTPUT}${open ? ` (${open} disagreements undecided)` : ''}`,
);
