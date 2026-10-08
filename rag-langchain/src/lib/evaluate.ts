// The evaluation metrics. Two kinds:
// - Retrieval metrics are plain arithmetic over which artists came back.
// - Generation metrics use a second LLM as a judge ("LLM as a judge"), with
//   structured output so every verdict comes back as typed data.
// The ideas follow Ragas (https://docs.ragas.io), simplified so each step is
// visible. Where we differ from Ragas, the comment says so.
import { initChatModel } from 'langchain';
import { z } from 'zod';
import { embeddings, openRouterConfig } from './pipeline.ts';

// A different model family from the one answering (gpt-5-mini): a model
// judging its own output tends to be too kind to it. (Claude would be the
// first choice, but this OpenRouter workspace's guardrails block Anthropic
// models: https://openrouter.ai/workspaces/default/guardrails)
export const JUDGE_MODEL = 'google/gemini-2.5-flash';

const judge = await initChatModel(JUDGE_MODEL, {
  modelProvider: 'openai',
  ...openRouterConfig,
});

// Ask the judge and get back an object matching `schema`
async function ask<T extends z.ZodType>(
  schema: T,
  name: string,
  prompt: string,
): Promise<z.infer<T>> {
  const raw = await judge.withStructuredOutput(schema, { name }).invoke(prompt);
  // Validate here too: the judge's output is data we didn't write
  return schema.parse(raw);
}

// ---------------------------------------------------------------------------
// Retrieval (no LLM)
// ---------------------------------------------------------------------------

// Of the artists we expected, how many appear anywhere in the retrieved
// chunks? (Ragas' context recall checks the reference answer's claims
// against the context; checking expected artists is the same idea for data
// where the answer is a list of artists.)
export function contextRecall(retrieved: string[], expected: string[]) {
  const found = expected.filter((artist) => retrieved.includes(artist));
  return { score: found.length / expected.length, found };
}

// Are the relevant chunks ranked near the top? For every relevant chunk,
// take the precision of the list up to that rank, then average. A relevant
// chunk at rank 1 counts for more than one at rank 6. (Ragas' context
// precision, with "relevant" meaning "from an expected artist".)
export function contextPrecision(retrieved: string[], expected: string[]) {
  let relevantSoFar = 0;
  const precisions: number[] = [];
  retrieved.forEach((artist, i) => {
    if (!expected.includes(artist)) return;
    relevantSoFar++;
    precisions.push(relevantSoFar / (i + 1));
  });
  const score = precisions.length
    ? precisions.reduce((a, b) => a + b, 0) / precisions.length
    : 0;
  return { score, relevant: retrieved.map((a) => expected.includes(a)) };
}

// ---------------------------------------------------------------------------
// Generation (LLM as a judge)
// ---------------------------------------------------------------------------

// Faithfulness: is everything the answer says backed by the retrieved
// chunks? Two judge calls, as in Ragas:
// 1. break the answer into short, standalone claims;
// 2. check each claim against the context.
// Score = supported claims / all claims. It says nothing about whether the
// answer is *right*, only whether it stuck to what it was given.
export async function faithfulness(
  question: string,
  answer: string,
  context: string,
) {
  const { claims } = await ask(
    z.object({
      claims: z
        .array(z.string())
        .describe('Standalone factual claims, one fact each'),
    }),
    'extract_claims',
    `Break the answer into short, standalone factual claims, one fact each.
Each claim must make sense on its own (replace "he", "it", "they" with names).
Leave out statements that aren't facts about the world, such as "I don't know based on the data" or "Artists used: ...".
If the answer makes no factual claims, return an empty list.

Question: ${question}

Answer:
${answer}`,
  );
  if (claims.length === 0) return { score: null, claims: [] };

  const { verdicts } = await ask(
    z.object({
      verdicts: z.array(
        z.object({
          claim: z.string(),
          supported: z
            .boolean()
            .describe('True only if the context directly states or implies it'),
          source: z
            .number()
            .nullable()
            .describe('Number of the context block that supports it, or null'),
          reason: z.string().describe('One short sentence'),
        }),
      ),
    }),
    'verify_claims',
    `For each claim, decide whether the context below supports it. Judge only against the context, not your own knowledge: a true fact that isn't in the context is NOT supported.
Context blocks are numbered [1], [2], ... Give the number of the block that supports each supported claim.

Context:
${context}

Claims:
${claims.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
  );
  const supported = verdicts.filter((v) => v.supported).length;
  return { score: supported / verdicts.length, claims: verdicts };
}

// Answer relevancy: does the answer address the question that was asked?
// Ragas' trick: have the judge write the questions this answer would be a
// good answer to, embed them, and compare them with the real question. An
// answer that drifts off topic produces questions that drift too.
export async function answerRelevancy(question: string, answer: string) {
  const { questions, noncommittal } = await ask(
    z.object({
      questions: z.array(z.string()).length(3),
      noncommittal: z
        .boolean()
        .describe('True if the answer is evasive or declines to answer'),
    }),
    'reverse_questions',
    `Write 3 different questions that the answer below would be a good answer to. Also say whether the answer is noncommittal (evasive, or declines to answer).

Answer:
${answer}`,
  );
  const [target, ...generated] = await embeddings.embedDocuments([
    question,
    ...questions,
  ]);
  const cosine = (a: number[], b: number[]) =>
    a.reduce((sum, n, i) => sum + n * b[i], 0) /
    (Math.hypot(...a) * Math.hypot(...b));
  const similarities = generated.map((v) => cosine(target, v));
  const mean = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  // Ragas scores a noncommittal answer 0, however similar the questions are
  return {
    score: noncommittal ? 0 : mean,
    noncommittal,
    questions: questions.map((q, i) => ({
      question: q,
      similarity: similarities[i],
    })),
  };
}

// Answer correctness against a reference answer we wrote. Simpler than
// Ragas (which combines claim-level F1 with embedding similarity): the judge
// gives one verdict with a reason.
export async function answerCorrectness(
  question: string,
  answer: string,
  reference: string,
) {
  const result = await ask(
    z.object({
      verdict: z.enum(['correct', 'partial', 'incorrect']),
      reason: z.string().describe('One or two short sentences'),
    }),
    'grade_answer',
    `Compare the answer with the reference answer.
- correct: it contains all the facts in the reference and nothing that contradicts it. Extra true detail is fine.
- partial: some facts from the reference are missing, but nothing contradicts it.
- incorrect: it contradicts the reference, or misses the point.

Question: ${question}
Reference answer: ${reference}

Answer:
${answer}`,
  );
  const score = { correct: 1, partial: 0.5, incorrect: 0 }[result.verdict];
  return { score, ...result };
}

// Did the answer decline to give the requested information? Used both ways:
// out-of-scope questions should be declined, answerable ones shouldn't.
export async function refusal(question: string, answer: string) {
  return ask(
    z.object({
      refused: z
        .boolean()
        .describe(
          'True if the answer says it cannot give the requested information',
        ),
      reason: z.string().describe('One short sentence'),
    }),
    'detect_refusal',
    `Does this answer decline to give the information the question asks for (for example "I don't know", "the data doesn't say")? Giving related facts but not the requested one still counts as declining.

Question: ${question}

Answer:
${answer}`,
  );
}
