// A self-contained HTML page that walks one question through the pipeline,
// showing the real data at every step. Text is rendered on the server
// (escaped); the vector strips are drawn in the browser from embedded JSON.
import { THEME_CSS } from './page-theme.ts';

type Metadata = Record<string, unknown>;

export type WalkthroughData = {
  question: string;
  artist: string;
  chatModel: string;
  embeddingModel: string;
  k: number;
  load: {
    rawCsvLine: string;
    artistRowCount: number;
    releaseRowCount: number;
    pageContent: string;
    metadata: Metadata;
  };
  reshape: { pageContent: string; metadata: Metadata };
  split: {
    chunkSize: number;
    chunkOverlap: number;
    header: string;
    chunks: { id: string; text: string; overlap: number }[];
    topChunkId: string;
  };
  store: { collection: string; count: number; id: string; metadata: Metadata };
  chunkVector: number[];
  chunkNorm: number;
  queryVector: number[];
  queryNorm: number;
  embedMs: number;
  search: {
    results: {
      rank: number;
      id: string;
      artist: string;
      kind: string;
      distance: number;
      preview: string;
    }[];
    searchMs: number;
    dot: number;
  };
  prompt: { system: string; human: string };
  llm: {
    ms: number;
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    answer: string;
  };
};

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const fmt = (n: number) => n.toLocaleString('en-US');
const json = (value: unknown) => esc(JSON.stringify(value, null, 2));

function truncate(text: string, max: number): string {
  if (text.length <= max) return esc(text);
  return `${esc(text.slice(0, max))}<span class="more">… ${fmt(text.length - max)} more characters</span>`;
}

function step(
  n: number,
  title: string,
  what: string,
  code: string | null,
  io: string,
  body: string,
): string {
  return `<section class="card step" id="step-${n}">
  <div class="step-head">
    <span class="num">${n}</span>
    <div>
      <h2>${title}</h2>
      <p class="what">${what}</p>
    </div>
  </div>
  <div class="io">${io}</div>
  ${code ? `<pre class="code"><code>${esc(code)}</code></pre>` : ''}
  ${body}
</section>`;
}

function vectorBlock(key: string, vector: number[], label: string): string {
  const first = vector
    .slice(0, 8)
    .map((n) => n.toFixed(4))
    .join(', ');
  return `<figure class="vector">
  <figcaption>${label}</figcaption>
  <svg class="strip" data-vec="${key}" viewBox="0 0 ${vector.length} 1" preserveAspectRatio="none" role="img" aria-label="${esc(label)}: ${vector.length} values"></svg>
  <code class="numbers">[${first}, … ${fmt(vector.length - 8)} more]</code>
</figure>`;
}

export function renderWalkthroughHtml(d: WalkthroughData): string {
  const { split, search, llm } = d;
  const top = search.results[0];
  const topIndex = split.chunks.findIndex((c) => c.id === split.topChunkId);

  // Chunk text, marking the header our splitDocuments() adds and the tail
  // that the splitter repeats at the start of the next chunk
  const chunkHtml = split.chunks
    .map((chunk, i) => {
      let rest = chunk.text;
      let head = '';
      if (rest.startsWith(split.header)) {
        head = `<mark class="added">${esc(split.header.trim())}</mark>\n`;
        rest = rest.slice(split.header.length);
      }
      const tail = chunk.overlap
        ? `<mark class="overlap">${esc(rest.slice(-chunk.overlap))}</mark>`
        : '';
      const main = esc(chunk.overlap ? rest.slice(0, -chunk.overlap) : rest);
      const isTop = i === topIndex;
      return `<div class="chunk${isTop ? ' top' : ''}">
  <div class="chunk-head"><code>${esc(chunk.id)}</code><span>${fmt(chunk.text.length)} chars</span>${isTop ? '<span class="badge">ranked #1 for this question</span>' : ''}</div>
  <pre>${head}${main}${tail}</pre>
</div>`;
    })
    .join('\n');

  const maxSimilarity = Math.max(...search.results.map((r) => 1 - r.distance));
  const resultRows = search.results
    .map((r) => {
      const similarity = 1 - r.distance;
      const cut = r.rank > d.k;
      return `${r.rank === d.k + 1 ? `<tr class="cutoff"><td colspan="5">Cut-off: only the top ${d.k} go into the prompt. These just missed:</td></tr>` : ''}<tr class="${cut ? 'missed' : ''}">
  <td class="tnum">${r.rank}</td>
  <td>${esc(r.artist)}</td>
  <td>${r.kind}</td>
  <td class="tnum">${r.distance.toFixed(3)}</td>
  <td><div class="bar-cell"><span class="bar" style="width:${((similarity / maxSimilarity) * 70).toFixed(1)}%"></span><span class="bar-label">${similarity.toFixed(3)}</span></div></td>
</tr>`;
    })
    .join('\n');

  // Split the system message into the fixed rules and the filled-in context
  const marker = 'Context:\n';
  const cut = d.prompt.system.indexOf(marker) + marker.length;
  const rules = d.prompt.system.slice(0, cut);
  const context = d.prompt.system.slice(cut);
  const promptChars = d.prompt.system.length + d.prompt.human.length;

  const flow = (lane: string, items: [number, string, string][]) =>
    `<div class="lane"><span class="lane-name">${lane}</span><ol>${items
      .map(
        ([n, name, detail]) =>
          `<li><a href="#step-${n}"><span class="num small">${n}</span><span><b>${name}</b><small>${detail}</small></span></a></li>`,
      )
      .join('')}</ol></div>`;

  const data = JSON.stringify({
    query: d.queryVector,
    chunk: d.chunkVector,
  }).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>RAG Walkthrough</title>
<style>
${THEME_CSS}  body { margin: 0; background: #f9f9f7; }
  @media (prefers-color-scheme: dark) { body { background: #0d0d0d; } }
  .viz-root {
    min-height: 100vh; background: var(--page); color: var(--text-primary);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 2rem 16px; box-sizing: border-box;
  }
  main { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 1.5rem; margin: 0 0 0.25rem; }
  h2 { font-size: 1.1rem; margin: 0; }
  h3 { font-size: 0.95rem; margin: 1.25rem 0 0.5rem; }
  p { color: var(--text-secondary); line-height: 1.5; margin: 0 0 0.75rem; }
  a { color: inherit; }
  .card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; margin-top: 1rem; }
  .phase { margin: 2rem 0 0; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
  .phase + p { margin-top: 0.25rem; }
  .num { flex: none; display: inline-grid; place-items: center; width: 1.9rem; height: 1.9rem; border-radius: 50%; background: var(--text-primary); color: var(--page); font-weight: 700; font-size: 0.9rem; }
  .num.small { width: 1.4rem; height: 1.4rem; font-size: 0.75rem; }
  .step-head { display: flex; gap: 0.75rem; align-items: flex-start; }
  .what { margin: 0.2rem 0 0; }
  .io { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.75rem 0; }
  .chip { font-size: 0.8rem; color: var(--text-secondary); border: 1px solid var(--hairline); border-radius: 999px; padding: 0.15rem 0.6rem; }
  .chip b { color: var(--text-primary); }
  pre, code { font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-size: 0.8rem; }
  pre { white-space: pre-wrap; word-break: break-word; background: var(--code-bg); border-radius: 8px; padding: 0.75rem; margin: 0.5rem 0; line-height: 1.45; }
  pre.code { border-left: 3px solid var(--text-muted); }
  .more { color: var(--text-muted); font-style: italic; }
  .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 0.75rem; }
  .label { font-size: 0.8rem; color: var(--text-secondary); margin: 0.5rem 0 0; }
  mark { color: inherit; border-radius: 3px; padding: 0 1px; }
  mark.overlap { background: var(--mark-bg); }
  mark.added { background: var(--mark-alt-bg); }
  mark.context { display: block; background: var(--mark-bg); padding: 0.25rem; }
  .key { display: flex; flex-wrap: wrap; gap: 1rem; font-size: 0.8rem; color: var(--text-secondary); }
  .key mark { padding: 0 0.4rem; }
  .chunk { border: 1px solid var(--hairline); border-radius: 8px; padding: 0.5rem 0.75rem; margin-top: 0.6rem; }
  .chunk.top { border: 2px solid var(--text-primary); }
  .chunk-head { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; font-size: 0.8rem; color: var(--text-secondary); }
  .badge { background: var(--text-primary); color: var(--page); border-radius: 999px; padding: 0.05rem 0.5rem; font-weight: 600; }
  .vector { margin: 0.75rem 0; }
  .vector figcaption { font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.3rem; }
  .strip { display: block; width: 100%; height: 34px; border-radius: 4px; background: var(--div-mid); cursor: crosshair; }
  .numbers { display: block; color: var(--text-muted); margin-top: 0.3rem; overflow-wrap: anywhere; }
  .scale { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--text-secondary); }
  .scale .ramp { width: 140px; height: 10px; border-radius: 3px; background: linear-gradient(90deg, var(--div-neg), var(--div-mid), var(--div-pos)); }
  table { border-collapse: collapse; width: 100%; font-size: 0.875rem; }
  th, td { text-align: left; padding: 0.4rem 0.5rem; border-bottom: 1px solid var(--hairline); vertical-align: middle; }
  th { color: var(--text-secondary); font-weight: 600; }
  .tnum { font-variant-numeric: tabular-nums; }
  .table-wrap { overflow-x: auto; }
  tr.missed td { color: var(--text-muted); }
  tr.missed .bar { background: var(--muted-mark); }
  tr.cutoff td { font-size: 0.8rem; color: var(--text-secondary); border-bottom: 2px dashed var(--series-2); padding-top: 0.9rem; }
  .bar-cell { min-width: 160px; display: flex; align-items: center; gap: 0.5rem; }
  .bar { display: inline-block; height: 10px; background: var(--series-1); border-radius: 0 4px 4px 0; }
  .bar-label { font-variant-numeric: tabular-nums; font-size: 0.8rem; color: var(--text-secondary); }
  .equation { font-size: 0.9rem; line-height: 1.6; }
  .equation b { font-variant-numeric: tabular-nums; }
  .stats { display: flex; flex-wrap: wrap; gap: 0.75rem; }
  .stat { border: 1px solid var(--hairline); border-radius: 8px; padding: 0.6rem 0.9rem; min-width: 120px; }
  .stat b { display: block; font-size: 1.3rem; font-variant-numeric: tabular-nums; }
  .stat span { font-size: 0.8rem; color: var(--text-secondary); }
  .question { font-size: 1.15rem; line-height: 1.5; border-left: 4px solid var(--series-2); padding-left: 0.9rem; margin: 0.5rem 0; }
  .answer { white-space: pre-wrap; font-family: inherit; font-size: 0.95rem; background: none; padding: 0; }
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
  .tooltip { position: fixed; pointer-events: none; display: none; padding: 0.3rem 0.5rem; background: var(--surface-1); color: var(--text-primary); border: 1px solid var(--border); border-radius: 6px; font-size: 0.75rem; box-shadow: 0 4px 16px rgba(0,0,0,0.12); font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<div class="viz-root">
<main>
  <h1>One question, step by step</h1>
  <p class="question">${esc(d.question)}</p>
  <p>Every value below is real output from this run. Embeddings: <code>${esc(d.embeddingModel)}</code>. LLM: <code>${esc(d.chatModel)}</code>. Both via OpenRouter.</p>

  <nav class="flow card" aria-label="Pipeline steps">
    ${flow('Indexing', [
      [1, 'CSV row', '1 line'],
      [2, 'Document', 'CSVLoader'],
      [3, 'Profile', 'reshaped'],
      [4, 'Chunks', `${split.chunks.length} for this artist`],
      [5, 'Vector', `${fmt(d.chunkVector.length)} numbers`],
      [6, 'Chroma', `${fmt(d.store.count)} records`],
    ])}
    ${flow('Query time', [
      [7, 'Question', 'text'],
      [8, 'Query vector', `${fmt(d.queryVector.length)} numbers`],
      [9, 'Search', `top ${d.k}`],
      [10, 'Prompt', `${fmt(promptChars)} chars`],
      [11, 'LLM', `${(llm.ms / 1000).toFixed(1)} s`],
      [12, 'Answer', `${fmt(llm.answer.length)} chars`],
    ])}
  </nav>

  <h2 class="phase">Indexing</h2>
  <p>This happened earlier, when the Chroma collection was built, and ran for every artist. Here we follow the one chunk that ended up ranked #1 for this question (<b>${esc(d.artist)}</b>) back to the CSV row it came from.</p>

  ${step(
    1,
    'Read the CSV row',
    'The source data: one line of <code>artists.csv</code>, plus this artist’s rows in <code>releases.csv</code>.',
    null,
    `<span class="chip"><b>${fmt(d.load.artistRowCount)}</b> rows in artists.csv</span><span class="chip"><b>${fmt(d.load.releaseRowCount)}</b> release rows for ${esc(d.artist)}</span>`,
    `<pre>${truncate(d.load.rawCsvLine, 600)}</pre>`,
  )}

  ${step(
    2,
    'Load it into a Document',
    'A document loader turns each CSV row into a LangChain <code>Document</code>: <code>pageContent</code> (the text) and <code>metadata</code> (where it came from).',
    "const docs = await new CSVLoader('data/artists.csv').load();",
    '<span class="chip">1 CSV row → <b>1 Document</b></span>',
    `<div class="two"><div><p class="label">pageContent</p><pre>${truncate(d.load.pageContent, 700)}</pre></div><div><p class="label">metadata</p><pre>${json(d.load.metadata)}</pre></div></div>`,
  )}

  ${step(
    3,
    'Reshape into one profile per artist',
    'Our own step: the artist row and all its release rows become one readable profile. Duplicate releases (same album, other countries or formats) are merged, keeping the earliest year.',
    'const profiles = await loadArtistDocuments(); // src/lib/pipeline.ts',
    `<span class="chip">1 artist row + ${fmt(d.load.releaseRowCount)} release rows → <b>1 Document</b> of ${fmt(d.reshape.pageContent.length)} chars</span>`,
    `<div class="two"><div><p class="label">pageContent</p><pre>${truncate(d.reshape.pageContent, 900)}</pre></div><div><p class="label">metadata (kept on every chunk, usable as a filter)</p><pre>${json(d.reshape.metadata)}</pre></div></div>`,
  )}

  ${step(
    4,
    'Split into chunks',
    `The splitter cuts the profile into pieces of at most ${split.chunkSize} characters, breaking at line ends where it can. Each chunk repeats up to ${split.chunkOverlap} characters from the end of the one before, so a sentence cut at a boundary still appears whole in one of them.`,
    `const splitter = new RecursiveCharacterTextSplitter({ chunkSize: ${split.chunkSize}, chunkOverlap: ${split.chunkOverlap} });
const chunks = await splitDocuments(profiles); // splits, then adds the "(continued)" header`,
    `<span class="chip">1 Document → <b>${split.chunks.length} chunks</b></span>`,
    `<div class="key"><span><mark class="overlap">repeated</mark> also starts the next chunk (overlap)</span><span><mark class="added">header</mark> added by us, so the chunk still names its artist</span></div>
${chunkHtml}`,
  )}

  ${step(
    5,
    'Embed the chunk',
    'The embedding model reads the chunk’s text and returns a fixed-length list of numbers. Texts with similar meaning get similar lists. No single number means anything on its own; the meaning is in the overall pattern.',
    'const vectors = await embeddings.embedDocuments(chunks.map((c) => c.pageContent));',
    `<span class="chip">${fmt(split.chunks[topIndex]?.text.length ?? 0)} chars → <b>${fmt(d.chunkVector.length)} numbers</b></span><span class="chip">vector length <b>${d.chunkNorm.toFixed(3)}</b></span>`,
    `${vectorBlock('chunk', d.chunkVector, `Chunk ${esc(d.store.id)}, one cell per number`)}
<div class="scale"><span>negative</span><span class="ramp"></span><span>positive</span><span>· hover the strip to read a value</span></div>
<p style="margin-top:0.75rem">OpenAI’s vectors come out with length 1. For vectors of length 1, cosine similarity is just the dot product, which is what step 9 relies on.</p>`,
  )}

  ${step(
    6,
    'Store it in Chroma',
    'The vector store keeps each chunk’s vector next to its text and metadata, under a stable id. It’s saved to disk, so this whole indexing phase doesn’t run again until you reindex.',
    'await vectorStore.addDocuments(chunks, { ids }); // ids like <artist_mbid>-<n>',
    `<span class="chip">collection <b>${esc(d.store.collection)}</b></span><span class="chip"><b>${fmt(d.store.count)}</b> records in total</span>`,
    `<div class="two"><div><p class="label">id</p><pre>${esc(d.store.id)}</pre><p class="label">embedding</p><pre>${fmt(d.chunkVector.length)} numbers (step 5)</pre><p class="label">document</p><pre>the chunk text (step 4)</pre></div><div><p class="label">metadata, as stored (Chroma flattens LangChain’s loc field)</p><pre>${json(d.store.metadata)}</pre></div></div>`,
  )}

  <h2 class="phase">Query time</h2>
  <p>This ran just now, for this question.</p>

  ${step(
    7,
    'The question',
    'Plain text from the user. Nothing about it is matched by keywords: it is turned into a vector like the chunks were.',
    null,
    `<span class="chip"><b>${fmt(d.question.length)}</b> chars</span>`,
    `<p class="question">${esc(d.question)}</p>`,
  )}

  ${step(
    8,
    'Embed the question',
    'The same embedding model turns the question into the same kind of vector. It has to be the same model: vectors from different models aren’t comparable.',
    'const queryVector = await embeddings.embedQuery(question);',
    `<span class="chip">→ <b>${fmt(d.queryVector.length)} numbers</b></span><span class="chip"><b>${fmt(d.embedMs)}</b> ms</span>`,
    vectorBlock('query', d.queryVector, 'Question vector'),
  )}

  ${step(
    9,
    'Search for the nearest chunks',
    `Chroma compares the question vector with all ${fmt(d.store.count)} stored vectors and returns the closest ones. It reports cosine <em>distance</em> (1 − similarity), so lower is closer. Only the top ${d.k} go on to the prompt.`,
    `const results = await vectorStore.similaritySearchVectorWithScore(queryVector, ${d.k});`,
    `<span class="chip">${fmt(d.store.count)} vectors → <b>top ${d.k}</b></span><span class="chip"><b>${fmt(search.searchMs)}</b> ms</span>`,
    `<div class="table-wrap"><table>
  <thead><tr><th class="tnum">#</th><th>Artist</th><th>Chunk</th><th class="tnum">Distance</th><th>Similarity (1 − distance)</th></tr></thead>
  <tbody>${resultRows}</tbody>
</table></div>
<h3>Where #1’s score comes from</h3>
<p>Multiply the two vectors number by number, then add up all ${fmt(d.queryVector.length)} products. That sum is the cosine similarity. No single dimension decides it: the score is many small agreements (red) minus disagreements (blue).</p>
${vectorBlock('query', d.queryVector, 'Question vector (step 8)')}
${vectorBlock('chunk', d.chunkVector, `Chunk ${esc(top?.id ?? '')} (step 5)`)}
${vectorBlock(
  'product',
  d.queryVector.map((n, i) => n * d.chunkVector[i]),
  'Question × chunk, number by number',
)}
<p class="equation">sum of products = <b>${search.dot.toFixed(4)}</b> = cosine similarity → Chroma’s distance = 1 − ${search.dot.toFixed(4)} = <b>${(1 - search.dot).toFixed(4)}</b> (reported: ${top?.distance.toFixed(4)})</p>`,
  )}

  ${step(
    10,
    'Fill the prompt',
    `The ${d.k} retrieved chunks are numbered and pasted into a fixed template, together with the question. This is everything the LLM will know about our data.`,
    'const messages = await ragPrompt.formatMessages({ context: formatContext(docs), question });',
    `<span class="chip">template + ${d.k} chunks + question → <b>${fmt(promptChars)} chars</b></span>`,
    `<div class="key"><span><mark class="overlap">filled in</mark> the retrieved chunks; the rest is the fixed template</span></div>
<p class="label">system message</p>
<pre>${esc(rules)}<mark class="context">${esc(context)}</mark></pre>
<p class="label">user message</p>
<pre>${esc(d.prompt.human)}</pre>`,
  )}

  ${step(
    11,
    'Call the LLM',
    'The model reads the prompt and generates an answer, token by token. It has no access to Chroma or the CSVs, only to the text in step 10.',
    'const response = await model.invoke(messages);',
    `<span class="chip"><b>${esc(d.chatModel)}</b></span>`,
    `<div class="stats">
  <div class="stat"><b>${(llm.ms / 1000).toFixed(1)} s</b><span>response time</span></div>
  ${llm.inputTokens !== undefined ? `<div class="stat"><b>${fmt(llm.inputTokens)}</b><span>input tokens</span></div>` : ''}
  ${llm.outputTokens !== undefined ? `<div class="stat"><b>${fmt(llm.outputTokens)}</b><span>output tokens</span></div>` : ''}
  ${llm.reasoningTokens ? `<div class="stat"><b>${fmt(llm.reasoningTokens)}</b><span>of those spent reasoning (not shown)</span></div>` : ''}
</div>`,
  )}

  ${step(
    12,
    'The answer',
    'Check it against step 9: everything it says should come from the chunks that were retrieved.',
    null,
    `<span class="chip"><b>${fmt(llm.answer.length)}</b> chars</span>`,
    `<pre class="answer">${esc(llm.answer)}</pre>`,
  )}
</main>
</div>
<div class="tooltip" id="tooltip"></div>

<script id="data" type="application/json">${data}</script>
<script>
(() => {
  const vectors = JSON.parse(document.getElementById('data').textContent);
  vectors.product = vectors.query.map((n, i) => n * vectors.chunk[i]);
  const NS = 'http://www.w3.org/2000/svg';
  const tooltip = document.getElementById('tooltip');

  // One cell per number: red for positive, blue for negative, stronger for
  // larger values, over the grey midpoint
  for (const svg of document.querySelectorAll('svg.strip')) {
    const values = vectors[svg.dataset.vec];
    const max = Math.max(...values.map(Math.abs));
    values.forEach((value, i) => {
      const cell = document.createElementNS(NS, 'rect');
      cell.setAttribute('x', i);
      cell.setAttribute('y', 0);
      cell.setAttribute('width', 1.05);
      cell.setAttribute('height', 1);
      cell.setAttribute('fill', value >= 0 ? 'var(--div-pos)' : 'var(--div-neg)');
      cell.setAttribute('fill-opacity', (Math.abs(value) / max).toFixed(3));
      svg.appendChild(cell);
    });
    svg.addEventListener('mousemove', (event) => {
      const rect = svg.getBoundingClientRect();
      const i = Math.min(values.length - 1, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * values.length)));
      tooltip.textContent = 'dimension ' + i + ': ' + values[i].toFixed(5);
      tooltip.style.left = event.clientX + 12 + 'px';
      tooltip.style.top = event.clientY + 12 + 'px';
      tooltip.style.display = 'block';
    });
    svg.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
  }
})();
</script>
</body>
</html>
`;
}
