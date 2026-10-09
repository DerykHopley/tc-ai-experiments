/**
 * Step 1: Run the eval questions through the RAG pipeline
 * npm run eval   (runs this, then eval/2_score.py)
 * ---
 * RAGAS scores a RAG system from four things per question: the question, the
 * chunks that were retrieved, the answer, and (for some metrics) a reference
 * answer. RAGAS is Python-only, so this script runs our TypeScript pipeline
 * and writes those fields to output/eval/samples.jsonl, one line per question,
 * using the field names RAGAS expects. eval/2_score.py then scores them.
 *
 * Each question in eval/questions.json says whether the data can answer it
 * ("answer") or the model should say it doesn't know ("refuse").
 *
 * Needs the Chroma server running (`npm run chroma`). One embedding call and
 * one LLM call per question.
 */
import fs from 'fs';
import {
  CHAT_MODEL,
  createChatModel,
  formatContext,
  getVectorStore,
  RAG_K,
  ragPrompt,
} from './lib/pipeline.ts';

const QUESTIONS = 'eval/questions.json';
const OUTPUT = 'output/eval/samples.jsonl';

type Question = {
  question: string;
  expect: 'answer' | 'refuse';
  notes?: string;
};

const questions: Question[] = JSON.parse(fs.readFileSync(QUESTIONS, 'utf8'));
const model = await createChatModel();
const vectorStore = await getVectorStore();

const lines: string[] = [];
for (const [i, q] of questions.entries()) {
  console.log(`[${i + 1}/${questions.length}] ${q.question}`);

  // Retrieve, fill the prompt, answer (as in ../rag-langchain stage 4),
  // keeping the distances for the walkthrough page
  const hits = await vectorStore.similaritySearchWithScore(q.question, RAG_K);
  const docs = hits.map(([doc]) => doc);
  const messages = await ragPrompt.formatMessages({
    context: formatContext(docs),
    question: q.question,
  });
  const response = await model.invoke(messages);

  lines.push(
    JSON.stringify({
      // The four RAGAS fields (no reference: Faithfulness doesn't need one)
      user_input: q.question,
      retrieved_contexts: docs.map((doc) => doc.pageContent),
      response: response.text,
      // Ours, passed through for the report
      expect: q.expect,
      notes: q.notes ?? '',
      retrieved: hits.map(([doc, distance]) => ({
        artist: String(doc.metadata.artist_name),
        distance,
      })),
      chat_model: CHAT_MODEL,
    }),
  );
  console.log(`  → ${response.text.slice(0, 100).replace(/\n/g, ' ')}...`);
}

fs.mkdirSync('output/eval', { recursive: true });
fs.writeFileSync(OUTPUT, lines.join('\n') + '\n');
console.log(`\nWrote ${lines.length} samples to ${OUTPUT}`);
