/**
 * Stage 4: Retrieval-augmented generation
 * npm run 4-rag -- "your question"
 * ---
 * The LLM doesn't know our dataset. So for each question we:
 * 1. retrieve the most similar chunks from the vector store (stage 3),
 * 2. paste them into the prompt as context,
 * 3. ask the LLM to answer from that context only.
 * The answer is only as good as what retrieval found: if the right chunk
 * isn't in the top k, the LLM never sees it.
 *
 * Needs the Chroma server running: `npm run chroma` in a second terminal.
 */
import {
  createChatModel,
  formatContext,
  getVectorStore,
  RAG_K,
  ragPrompt,
} from './lib/pipeline.ts';

const questions = process.argv[2]
  ? [process.argv[2]]
  : [
      'Which artists blend hip hop with R&B, and what are some of their albums?',
      // Not in the data: the model should say it doesn't know
      'What is the capital of Australia?',
    ];

// The prompt template and model live in lib/pipeline.ts, so stage 6's
// walkthrough uses exactly the same ones
const model = await createChatModel();
const vectorStore = await getVectorStore();
// A retriever is the vector store behind a simple "query in, Documents out"
// interface, so it can be swapped for another kind of search later
const retriever = vectorStore.asRetriever({ k: RAG_K });

for (const question of questions) {
  console.log(`\n=== Question: ${question}\n`);

  // 1. Retrieve
  const docs = await retriever.invoke(question);
  console.log(`Retrieved ${docs.length} chunks:`);
  docs.forEach((doc, i) =>
    console.log(`  [${i + 1}] ${doc.metadata.artist_name}`),
  );

  // 2. Augment: fill the template
  const messages = await ragPrompt.formatMessages({
    context: formatContext(docs),
    question,
  });
  const promptText = messages.map((m) => m.text).join('\n\n');
  console.log(
    `\nPrompt: ${promptText.length} characters. First 600:\n${promptText.slice(0, 600)}...\n`,
  );

  // 3. Generate
  const response = await model.invoke(messages);
  console.log(`Answer:\n${response.text}`);
}
