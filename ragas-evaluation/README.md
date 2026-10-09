# RAG evaluation with RAGAS

A follow-up to [rag-langchain](../rag-langchain/). That project evaluates its pipeline with metrics reimplemented in TypeScript, following the ideas in [RAGAS](https://docs.ragas.io). This project runs the real RAGAS library (Python, v0.4.3) on the same pipeline and the same music data, and writes a page that shows every judge step.

It's a separate project because the data changed: the artist profiles here label `begin_date` differently (see the first finding), so its runs can't be compared one-to-one with rag-langchain's published runs.

## Key findings

From the run on 2026-10-09: 12 questions, answers by `gpt-5-mini`, judged by `gpt-4o-mini`. 12 of 12 answered or declined as expected. Mean faithfulness 0.96 over the 7 answers.

- **Faithful isn't the same as correct.** rag-langchain's profiles show `begin_date` as `Active since:`. For a person, MusicBrainz's `begin_date` is the birth date. Asked when classic soul singers started their careers, the model answered "Aretha Franklin — Active since: 1942-03-25", her birthday, and faithfulness scored it fully supported. Faithfulness checks the answer against the retrieved text, not against the world, so a misleading label in your own Documents passes every time. Here the profiles say `Born:` for people and `Formed:` for groups. The model now answers from the earliest releases (Aretha 1956, Marvin Gaye 1964), and says it doesn't know of anything earlier.
- **The judge contradicts itself.** It marked "BTS released WINGS in 2016" as unsupported, with the reason "it was released in 2016, not explicitly stated in the context". The chunk says `- WINGS (2016)`. The same K-pop answer scored 0.75, 0.5 and 0.75 across reruns with nothing changed. A single score is a pointer to a claim worth reading, not a verdict.
- **RAGAS faithfulness scores "I don't know" at random.** An answer like "Artists used: BTS. I don't know based on the data." gets split into claims like "The artists used are BTS", which the judge then scores 0, 0.5 or 1. Here faithfulness only runs on answers that answered. rag-langchain's TypeScript version avoids the same problem by telling its claim extractor to skip such statements.
- **Don't ask a small judge what a rule can decide.** Asked "answered or refused?", `gpt-4o-mini` kept counting the "Artists used: …" line as an answer, a different question each run, even with worked examples in the prompt. Answers that are only the refusal sentence (plus the artists line) are now marked refused by a rule, with no LLM call. The judge only sees answers with real content. (rag-langchain's Gemini judge got these right, so this is about small judges, not a general rule.)
- **Ask the questions the model could answer from memory.** Three of the five "should say I don't know" questions ask for things the model knows but the data doesn't hold: BTS's members, Beyoncé's Grammy count, Daft Punk's best seller. It declined all three. Off-topic questions alone wouldn't have tested whether it sticks to the data.

## See the results

**[Open the walkthrough](https://derykhopley.github.io/tc-ai-experiments/ragas-evaluation/output/eval-walkthrough.html)**, the page from the latest run, committed in `output/` and published with GitHub Pages. It follows one answer through each judge step: the refusal check, splitting the answer into claims, each claim's verdict with the closest line in the retrieved chunks (to check the judge yourself), and the score. Then it lists every question and what to check by hand. Each judge prompt can be expanded to see exactly what was sent.

The raw data is in `output/eval/`: `samples.jsonl` (the questions, retrieved chunks and answers, in RAGAS's field names) and `results.json` (scores, claims, verdicts and the judge prompts).

## How it works

| Step | Runs in | What it does |
| --- | --- | --- |
| `src/1-export.ts` | TypeScript | Runs each question in `eval/questions.json` through the pipeline (top 6 chunks, `gpt-5-mini`) and writes `output/eval/samples.jsonl`. |
| `eval/2_score.py` | Python | Scores each sample. **Refusal**: a rule for plain "I don't know based on the data.", otherwise a RAGAS `DiscreteMetric` (answered or refused) compared with the question's label. **Faithfulness**, for answers only: RAGAS splits the answer into claims, then checks each claim against the chunks. Score = supported ÷ all. Writes `output/eval/results.json`. |
| `src/3-walkthrough.ts` | TypeScript | Writes `output/eval-walkthrough.html` from the results. No API calls. |

The pipeline is split across two languages because RAGAS is Python-only and the pipeline is TypeScript. One file sits between them.

The script calls RAGAS's two faithfulness steps itself instead of `metric.ascore()`, so it can keep the claims and verdicts. The score still comes from RAGAS's own `_compute_score`. RAGAS sends usage analytics by default; the script turns that off.

The 12 questions were written with Claude from the dataset. Each is labelled `answer` (7) or `refuse` (5), with a note on why it's in the set.

## Setup

- Node 22 or later, then `npm install`. `.npmrc` sets `legacy-peer-deps`, because an optional peer of `@langchain/community` still pins `@langchain/core` 0.3.
- [uv](https://docs.astral.sh/uv/) for the Python step. `uv run` reads the dependencies from the top of `eval/2_score.py` and installs them into a cached environment with Python 3.12 or 3.13. RAGAS doesn't install on 3.14 yet: its dependency scikit-network has no build for it.
- Copy `.env.example` to `.env` and add an [OpenRouter](https://openrouter.ai) key. Both the pipeline and the judge go through OpenRouter.
- Run `npm run chroma` in a second terminal. It stores vectors in `./chroma-data` on port 8001.

Then:

```sh
npm run eval          # answer the 12 questions, then score them (embeds the data on the first run)
npm run walkthrough   # build the page; add -- 6 to follow question 6
npm run score         # rescore the same answers, to see how much the judge moves
```

A full run costs a few cents. After changing anything in `src/lib/pipeline.ts` that affects the chunks, run `npm run reindex`.

The data is in `data/`; see [data/README.md](data/README.md) for its source and licence.
