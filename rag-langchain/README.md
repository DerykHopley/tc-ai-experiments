# Semantic search + RAG prototype (LangChain)

A learning prototype for the parts of a semantic search engine, built on a music dataset of 51 artists and about 4.9k releases from MusicBrainz. The data is in `data/`; see [data/README.md](data/README.md) for its source and licence.

## See the results

These pages come from the latest run. They're committed in `output/` and published with GitHub Pages, so you can open them without running anything:

- **[Walkthrough](https://derykhopley.github.io/tc-ai-experiments/rag-langchain/output/walkthrough.html)**: one question followed through all 12 steps, from CSV row to answer, with the real data at each step.
- **[Embedding map](https://derykhopley.github.io/tc-ai-experiments/rag-langchain/output/embedding-map.html)**: every chunk on a 2D t-SNE map, with genre and artist highlights and what each query retrieves.
- **[Evaluation](https://derykhopley.github.io/tc-ai-experiments/rag-langchain/output/eval-runs/comparison.html)**: 13 test questions scored with an LLM as judge, comparing three retrieval strategies. Each run has its own page, listing every claim and the judge's verdict on it:
  - [top-k-a](https://derykhopley.github.io/tc-ai-experiments/rag-langchain/output/eval-runs/top-k-a.html) (the first run)
  - [top-k-b](https://derykhopley.github.io/tc-ai-experiments/rag-langchain/output/eval-runs/top-k-b.html) (same settings again, to measure noise)
  - [two-per-artist](https://derykhopley.github.io/tc-ai-experiments/rag-langchain/output/eval-runs/two-per-artist.html)
  - [one-per-artist](https://derykhopley.github.io/tc-ai-experiments/rag-langchain/output/eval-runs/one-per-artist.html)
  - [long-context-a](https://derykhopley.github.io/tc-ai-experiments/rag-langchain/output/eval-runs/long-context-a.html) and [long-context-b](https://derykhopley.github.io/tc-ai-experiments/rag-langchain/output/eval-runs/long-context-b.html) (no retrieval: the baseline)

## Setup

- Node 22 or later
- `npm install`. `.npmrc` sets `legacy-peer-deps`, because an optional peer of `@langchain/community` (`@getzep/zep-cloud`) still pins `@langchain/core` 0.3.
- Copy `.env.example` to `.env` and add an [OpenRouter](https://openrouter.ai) key. Stages 1 and 2 run without one.
- Stages 3 and 4 need the Chroma server: run `npm run chroma` in a second terminal. It stores vectors in `./chroma-data` and listens on port 8001, so it doesn't clash with another Chroma server on the default port 8000.

## Stages

Run the stages in order. Each one reuses the earlier stages from `src/lib/pipeline.ts` and prints what its own step produces.

| Script | Concept | What you see |
| --- | --- | --- |
| `npm run 1-load` | Document loaders | `CSVLoader` returns one Document per row (4,931 release rows). These are reshaped into 51 artist profile Documents. |
| `npm run 2-split` | Text splitters | `RecursiveCharacterTextSplitter` (800 characters, 100 overlap) turns the 51 profiles into 179 chunks. Metadata is copied to every chunk. Chunks that lost the artist name get it added back. |
| `npm run 3-search` | Embeddings + vector store | One raw 1536-number vector, then Chroma similarity search (cosine distance, lower is closer), a check against `music_ground_truths.json`, and a `where`-filtered search. |
| `npm run 4-rag -- "question"` | RAG | Retrieve 6 chunks, fill a `ChatPromptTemplate`, then `gpt-5-mini` answers using only that context. |
| `npm run 5-visualize` | Looking at embeddings | Writes `output/embedding-map.html`: every chunk on a 2D t-SNE map, with genre or artist highlights, each query's top 6 retrieved chunks, and a nearest-neighbour check on the full vectors. |
| `npm run 6-walkthrough -- "question"` | The whole pipeline, one question | Writes `output/walkthrough.html`. It follows one real question through all 12 steps, with the data each step produced: CSV row, Document, chunks (overlap marked), the vector as a colour strip, the search with the cut-off, how the #1 score adds up, the filled prompt, token counts and the answer. |
| `npm run 7-evaluate` | Evaluating the pipeline | Runs the 13 questions in `data/eval_questions.json` through the pipeline and scores retrieval (context recall and precision, no LLM) and answers (faithfulness, answer relevancy, correctness, refusal) with `gemini-2.5-flash` as judge. Choose how chunks are picked with `-- --strategy top-k`, `two-per-artist` or `one-per-artist`, or skip retrieval with `long-context`, and name the run with `-- --name`. Each run is saved as `output/eval-runs/<name>.json` with its own page. `-- --render` rebuilds the pages without API calls. |
| `npm run 8-compare` | Comparing runs | Writes `output/eval-runs/comparison.html` from every saved run: average scores as a dot plot with a noise band, a question-by-question grid, and which artists each strategy retrieved. No API calls. |
| `npm run reindex` | Rebuild the index | Drops the collection and embeds everything again. |

## How it flows

The pipeline runs in two phases. **Indexing** turns the CSVs into vectors in Chroma. It runs on the first stage 3/4 run that finds the collection empty, and again on `npm run reindex`. **Query time** runs for every question. The numbers on the boxes are the stage scripts.

```mermaid
flowchart TB
  subgraph indexing["Indexing"]
    direction TB
    csv[("artists.csv + releases.csv<br/>51 + 4,931 rows")]
    load["<b>1 · Load</b><br/>CSVLoader: one Document per row"]
    shape["<b>Reshape</b><br/>one profile Document per artist: 51"]
    split["<b>2 · Split</b><br/>RecursiveCharacterTextSplitter<br/>800 chars, 100 overlap: 179 chunks"]
    embedChunks["<b>3 · Embed</b><br/>OpenAIEmbeddings, text-embedding-3-small<br/>each chunk becomes 1,536 numbers"]
    store[("<b>Chroma</b> collection music-artists<br/>vector + text + metadata per chunk<br/>saved in ./chroma-data")]
    csv --> load --> shape --> split --> embedChunks --> store
  end

  subgraph querying["Query time"]
    direction TB
    question["Question"]
    embedQuestion["<b>Embed the question</b><br/>same model: 1 vector"]
    search["<b>Similarity search</b><br/>6 nearest chunks by cosine distance<br/>optional where filter on metadata"]
    prompt["<b>4 · Prompt</b><br/>ChatPromptTemplate:<br/>rules + numbered chunks + question"]
    llm["<b>LLM</b><br/>gpt-5-mini via OpenRouter"]
    answer["Answer, naming the artists it used"]
    question --> embedQuestion --> search --> prompt --> llm --> answer
    question -.-> prompt
  end

  store --> search
  store -. "5 · Visualize: all vectors, t-SNE to 2D" .-> map["output/embedding-map.html"]
```

The same thing as a UML sequence diagram for one `npm run 4-rag` run: who calls whom, and in what order. The `alt` block only happens on the first run.

```mermaid
sequenceDiagram
  actor You
  participant Script as 4-rag.ts
  participant Chroma as Chroma server :8001
  participant Embed as OpenRouter embeddings
  participant LLM as OpenRouter gpt-5-mini

  You->>Script: npm run 4-rag -- "question"
  Script->>Chroma: get or create collection, count chunks
  alt collection is empty (first run)
    Script->>Script: load CSVs, reshape, split into 179 chunks
    Script->>Embed: embed 179 chunk texts
    Embed-->>Script: 179 vectors of 1,536 numbers
    Script->>Chroma: upsert ids, vectors, texts, metadata
  end
  Script->>Embed: embed the question
  Embed-->>Script: 1 vector of 1,536 numbers
  Script->>Chroma: query 6 nearest vectors
  Chroma-->>Script: 6 chunks with distances
  Script->>Script: fill the prompt template
  Script->>LLM: system message (rules + chunks) and question
  LLM-->>Script: answer text
  Script-->>You: print chunks, prompt and answer
```

## Persistence

The first stage 3 or 4 run that finds the `music-artists` collection empty embeds the 179 chunks and stores them. Later runs reuse the stored vectors and only embed the query. Chunk ids are stable (`<artist_mbid>-<n>`), so re-adding a chunk updates it instead of duplicating it.

Stored vectors don't change when the code does. After changing the loader, splitter or embedding model, run `npm run reindex`. Otherwise you're searching vectors from the old pipeline.

Models: `openai/text-embedding-3-small` and `openai/gpt-5-mini`, both through OpenRouter.

## Things the output shows

- **Shaping Documents matters more than the loader.** Searching raw release rows would mostly match album titles. One profile per artist matches what questions are actually about.
- **Chunks lose context.** A chunk from the middle of a discography is just a list of titles. Without the `Artist: X (continued)` header, neither the embedding nor the LLM knows whose albums they are.
- **Retrieval returns chunks, not artists.** One artist can fill several of the top-k slots. In "Indian film music…", 15 chunks covered only 4 artists. In the RAG example, JAŸ-Z took 3 of the 6 slots.
- **RAG is capped by retrieval.** For Beyoncé, only the tags chunk was retrieved, so the model correctly says it can't list her albums, even though they're in the data.
- **Facts are better as filters.** "Female singers from the UK" works best as a metadata filter (`gender`, `country`) plus a semantic query.
- **The prompt controls refusal.** For a question the data can't answer, the model replies "I don't know based on the data."
- **Chunks group by artist, not by genre.** In the full 1,536 dimensions, every discography chunk's nearest neighbour is another chunk by the same artist. 91% of the time it's another discography chunk. The `Artist: X (continued)` header ties them together. Genre shows up a level above that: on the map, artists with hip hop tags occupy one region.
- **Profile chunks carry the meaning.** The nearest neighbour of 92% of profile chunks is the same artist's own discography chunk. Only 8% sit closest to another artist's profile. Genre search therefore relies on the tags in the profile chunk.
- **Queries sit at the edge of the map.** A short question is about 0.5–0.6 cosine distance from even its best match, which is further than chunks of the same artist are from each other. That's normal for question-to-document search, and it's why scores are only meaningful compared with each other.

The genre families on the map are regex matches on MusicBrainz tags (`GENRES` in `src/5-visualize.ts`), so they're approximate. An artist can be in several families, and the tags are crowd-sourced.

## What the first evaluation showed

From the run on 2026-10-08 (13 questions; answers by `gpt-5-mini`, judged by `gemini-2.5-flash`): context recall 0.90, context precision 1.00, faithfulness 0.97, answer relevancy 0.63, correctness 0.83. It refused exactly when it should on 13 of 13.

- **Every retrieval miss was crowding.** Shakira, Stevie Wonder, Kishore Kumar and Diljit Dosanjh were all missing because other artists took several of the 6 slots: J Balvin took 4, and Marvin Gaye and Aretha Franklin 3 each. Per-artist dedupe or MMR is the obvious next experiment.
- **Faithful but incomplete.** Those answers stuck to what was retrieved (faithfulness 1.0), so correctness came out as "partial". The answer can't be better than retrieval.
- **Answer relevancy measured the metric more than the answers.**
  - The Afrobeat answer is complete and correct, but it ends with "I don't know … about any other artists". The judge called it noncommittal, and the Ragas rule turns that into 0.
  - Short correct answers ("Stromae — Country: BE (Belgium).") score low, because the judge can't reconstruct the question from them.
- **The judge is strict, and arguable.** It marked "Marvin Gaye is a classic soul / Motown singer" as not backed, although his tags include "motown" and "soul". Read the claim tables before trusting a faithfulness score.
- **Context precision told us nothing here.** The relevant chunks were always at the top, so it was 1.00 everywhere. It would only become informative with noisier retrieval.
- **The trap worked.** For "How many Grammys has Beyoncé won?", the data only has a "grammy winner" tag, and the model correctly declined to give a number.

The judge would ideally be Claude, a different model family from the answering model. This OpenRouter workspace's guardrails block Anthropic models, so the judge is Gemini (`JUDGE_MODEL` in `src/lib/evaluate.ts`).

## Capping chunks per artist

The first evaluation showed that every retrieval miss came from one artist filling several of the 6 slots. Stage 7 can now cap that: fetch 30 candidates, then keep the nearest ones while allowing at most 2 (`two-per-artist`) or 1 (`one-per-artist`) chunks per artist. All four runs below were made on 2026-10-08 with the same 13 questions and the same judge. top-k was run twice to see how much the scores move with nothing changed.

| Run | Recall | Faithfulness | Relevancy | Correctness | Refusal right |
| --- | --- | --- | --- | --- | --- |
| top-k (a) | 0.90 | 0.97 | 0.63 | 0.83 | 13/13 |
| top-k (b) | 0.90 | 1.00 | 0.66 | 0.83 | 13/13 |
| two-per-artist | 0.96 | 1.00 | 0.69 | **0.89** | 12/13 |
| one-per-artist | **1.00** | 0.90 | 0.66 | 0.83 | 12/13 |

- **The noise is real but small.** The two top-k runs retrieved exactly the same chunks, yet the judge scored the soul answer's faithfulness 0.75 once and 1.00 the other time.
- **Two per artist was the best balance.** Shakira came back and the Latin answer became correct, while every artist still had room for a second chunk.
- **One per artist found every expected artist, but the answers didn't get better.** It's a trade of depth for breadth:
  - **Soul:** each artist's single chunk was a release list without genre tags. The model named the right artists anyway, so faithfulness was 0: nothing in the context said they were soul singers. Recall 1.00, faithfulness 0.
  - **Afrobeat:** the extra variety brought in Prince (tagged "afro house; african"). The model included him, and the judge marked the answer incorrect against our narrower reference.
- **Breadth cost the open question.** With either cap, JAŸ-Z's album chunks were dropped. The hip hop + R&B answer then named only Beyoncé and said it didn't know her albums, which the refusal check flags.
- **What the numbers point to next:** the cap decides how many chunks an artist gets, but not which ones. Always pairing the artist's profile chunk (the one with the tags) with the best-matching detail chunk, a form of parent-document retrieval, might keep both breadth and grounding.

## Long context: no retrieval at all

All 51 artist profiles come to about 111,000 characters (roughly 28k tokens), which fits easily in `gpt-5-mini`'s context. The `long-context` strategy skips the search and puts every profile in the prompt, in the CSV's order, with the same prompt, model and judge. It's the baseline: what does retrieval add? Two runs on 2026-10-09, next to the earlier four:

| Run | Recall | Faithfulness | Relevancy | Correctness | Refusal right |
| --- | --- | --- | --- | --- | --- |
| top-k (a) | 0.90 | 0.97 | 0.63 | 0.83 | 13/13 |
| top-k (b) | 0.90 | 1.00 | 0.66 | 0.83 | 13/13 |
| two-per-artist | 0.96 | 1.00 | 0.69 | 0.89 | 12/13 |
| one-per-artist | 1.00 | 0.90 | 0.66 | 0.83 | 12/13 |
| long-context (a) | – | 1.00 | 0.58 | **1.00** | 12/13 |
| long-context (b) | – | 1.00 | 0.78 | 0.89 | 13/13 |

Retrieval isn't scored for long-context: with every artist in the prompt, recall is 1 by definition.

- **On data this small, retrieval costs answers.** Every retrieval miss disappeared: Shakira, Stevie Wonder and all the Bollywood artists came back, and the soul and Latin answers became correct. The hip hop + R&B answer went from JAŸ-Z's albums alone to nine artists with albums.
- **Its lower scores are the judge, not the answers.** Run b's two "partial" verdicts were for leaving out "all from Nigeria" (the question doesn't ask) and Diljit Dosanjh (a borderline artist in our reference). Run a's refusal failure was the hip hop answer: nine artists with albums, plus a caveat that the data doesn't say which releases are fusions, which the judge read as declining. The relevancy zeros are the "noncommittal" rule again.
- **It stayed faithful.** With 28k tokens to draw on, every claim in both runs was backed by the profiles.
- **The cost is input, not time.** Each question sends about 111k characters instead of about 4k, roughly 28 times the input tokens. Answers took about as long (5.7 s on average, against 5.0 s for top-k).
- **When retrieval wins instead:** when the data doesn't fit in the context, when the cost per question matters, or when the answer is buried in the middle of a long prompt. At 28k tokens, none of these showed up in these 13 questions, though the position of a profile in the prompt wasn't tested directly. Retrieval here is worth learning for data that doesn't fit, not for this dataset.
