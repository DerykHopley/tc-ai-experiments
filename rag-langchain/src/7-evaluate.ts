/**
 * Stage 7: Evaluate the pipeline
 * npm run 7-evaluate                                run with top-k retrieval
 * npm run 7-evaluate -- --strategy one-per-artist   or another strategy
 * npm run 7-evaluate -- --name top-k-b              save under another name
 * npm run 7-evaluate -- --render                    rebuild every run's page
 * ---
 * Runs every question in data/eval_questions.json through the real pipeline
 * (retrieve -> prompt -> answer), then scores it:
 * - Retrieval, without an LLM: did the expected artists come back, and near
 *   the top? (context recall, context precision)
 * - Generation, with a second LLM as judge: is every claim backed by the
 *   retrieved chunks (faithfulness), does the answer address the question
 *   (answer relevancy), does it match our reference (correctness), and did
 *   it refuse exactly when it should?
 *
 * Writes output/eval-runs/<name>.json (the raw results; stage 8 compares
 * runs) and output/eval-runs/<name>.html. The name defaults to the strategy.
 * Needs the Chroma server (`npm run chroma`).
 * One run is about 13 answers and 60 judge calls: a few cents.
 */
import fs from 'fs';
import {
  CHAT_MODEL,
  createChatModel,
  EMBEDDING_MODEL,
  formatContext,
  getVectorStore,
  RAG_K,
  ragPrompt,
  retrieve,
  splitter,
  STRATEGIES,
  type RetrievalStrategy,
} from './lib/pipeline.ts';
import {
  answerCorrectness,
  answerRelevancy,
  contextPrecision,
  contextRecall,
  faithfulness,
  JUDGE_MODEL,
  refusal,
} from './lib/evaluate.ts';
import {
  renderEvaluationHtml,
  type EvalRun,
  type QuestionResult,
} from './lib/evaluation-page.ts';

const QUESTIONS = 'data/eval_questions.json';
const RUNS_DIR = 'output/eval-runs';
// Questions evaluated at the same time (each one makes several API calls)
const PARALLEL = 4;

type TestQuestion = {
  id: string;
  group: string;
  question: string;
  expected_artists?: string[];
  reference?: string;
  should_refuse?: boolean;
  note?: string;
};

// The value after a flag, e.g. `--strategy one-per-artist`
const option = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
};

if (process.argv.includes('--render')) {
  for (const file of fs
    .readdirSync(RUNS_DIR)
    .filter((f) => f.endsWith('.json'))) {
    const run: EvalRun = JSON.parse(
      fs.readFileSync(`${RUNS_DIR}/${file}`, 'utf8'),
    );
    fs.writeFileSync(`${RUNS_DIR}/${run.name}.html`, renderEvaluationHtml(run));
    console.log(`Rebuilt ${RUNS_DIR}/${run.name}.html`);
  }
  process.exit(0);
}

const strategy = (option('--strategy') ?? 'top-k') as RetrievalStrategy;
if (!STRATEGIES.includes(strategy)) {
  console.error(
    `Unknown strategy "${strategy}". Use one of: ${STRATEGIES.join(', ')}`,
  );
  process.exit(1);
}
const name = option('--name') ?? strategy;

const tests: TestQuestion[] = JSON.parse(fs.readFileSync(QUESTIONS, 'utf8'));
const vectorStore = await getVectorStore();
const model = await createChatModel();

async function evaluate(test: TestQuestion): Promise<QuestionResult> {
  // 1. Retrieve and answer, exactly as stage 4 does
  const hits = await retrieve(vectorStore, test.question, strategy);
  const docs = hits.map(([doc]) => doc);
  const context = formatContext(docs);
  const messages = await ragPrompt.formatMessages({
    context,
    question: test.question,
  });
  const start = performance.now();
  const response = await model.invoke(messages);
  const answerMs = Math.round(performance.now() - start);
  const answer = response.text;
  const artists = docs.map((doc) => String(doc.metadata.artist_name));

  // 2. Score it. The judge calls are independent, so run them together.
  const shouldRefuse = test.should_refuse ?? false;
  const [faith, relevancy, correctness, refused] = await Promise.all([
    faithfulness(test.question, answer, context),
    shouldRefuse ? null : answerRelevancy(test.question, answer),
    test.reference
      ? answerCorrectness(test.question, answer, test.reference)
      : null,
    refusal(test.question, answer),
  ]);

  console.log(`  ✓ ${test.id}`);
  return {
    id: test.id,
    group: test.group,
    question: test.question,
    note: test.note,
    expectedArtists: test.expected_artists,
    reference: test.reference,
    shouldRefuse,
    retrieved: hits.map(([doc, distance], i) => ({
      rank: i + 1,
      artist: artists[i],
      distance,
      text: doc.pageContent,
    })),
    answer,
    answerMs,
    outputTokens: response.usage_metadata?.output_tokens,
    metrics: {
      contextRecall: test.expected_artists
        ? contextRecall(artists, test.expected_artists)
        : undefined,
      contextPrecision: test.expected_artists
        ? contextPrecision(artists, test.expected_artists)
        : undefined,
      faithfulness: faith,
      answerRelevancy: relevancy ?? undefined,
      answerCorrectness: correctness ?? undefined,
      behaviour: { ...refused, pass: refused.refused === shouldRefuse },
    },
  };
}

// Run the questions a few at a time, keeping the file's order
console.log(
  `Evaluating ${tests.length} questions as "${name}" (retrieval: ${strategy}, answers: ${CHAT_MODEL}, judge: ${JUDGE_MODEL})`,
);
const started = performance.now();
const results: QuestionResult[] = [];
for (let i = 0; i < tests.length; i += PARALLEL) {
  results.push(
    ...(await Promise.all(tests.slice(i, i + PARALLEL).map(evaluate))),
  );
}

const run: EvalRun = {
  name,
  date: new Date().toISOString(),
  config: {
    strategy,
    chatModel: CHAT_MODEL,
    judgeModel: JUDGE_MODEL,
    embeddingModel: EMBEDDING_MODEL,
    k: RAG_K,
    chunkSize: splitter.chunkSize,
    chunkOverlap: splitter.chunkOverlap,
  },
  seconds: Math.round((performance.now() - started) / 1000),
  results,
};

fs.mkdirSync(RUNS_DIR, { recursive: true });
fs.writeFileSync(`${RUNS_DIR}/${name}.json`, JSON.stringify(run, null, 2));
fs.writeFileSync(`${RUNS_DIR}/${name}.html`, renderEvaluationHtml(run));

// A summary in the terminal
const mean = (values: (number | null | undefined)[]) => {
  const xs = values.filter((v): v is number => typeof v === 'number');
  return xs.length
    ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2)
    : 'n/a';
};
const m = results.map((r) => r.metrics);
console.log(`\nDone in ${run.seconds} s`);
console.table({
  'context recall': mean(m.map((x) => x.contextRecall?.score)),
  'context precision': mean(m.map((x) => x.contextPrecision?.score)),
  faithfulness: mean(m.map((x) => x.faithfulness.score)),
  'answer relevancy': mean(m.map((x) => x.answerRelevancy?.score)),
  correctness: mean(m.map((x) => x.answerCorrectness?.score)),
  'refused when it should (and only then)': `${m.filter((x) => x.behaviour.pass).length}/${m.length}`,
});
console.log(`Wrote ${RUNS_DIR}/${name}.json and .html`);
