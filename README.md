# Embedding model comparison

How do different embedding models relate the same people? This project embeds 68 short biographies of historical figures with several models, finds each person's 3 closest neighbours under each model, and writes an interactive page comparing them.

## Key findings

From the run on 2026-10-07 with five models (`text-embedding-3-small`, `text-embedding-3-large`, `qwen3-embedding-8b`, `mistral-embed-2312`, `gemini-embedding-2`).

- **The models mostly agree.** Any two models share about 2 of each person's 3 closest neighbours (1.9–2.3). The two OpenAI models are the most alike, and Qwen is the least like the others.
- **Every model groups people by gender, not just by field.** 82–90% of neighbours share the person's gender, against 59% by chance. The likely cause, not yet tested, is that many women's biographies are framed around being "the first woman to…".
- **The models disagree most about Marie Curie** (33% agreement). Her biography is only weakly similar to anyone else's. Einstein is her 3rd closest, but she is only his 7th. On every t-SNE map tried, her nearest points are women.
- **A 2D map keeps about two thirds of each person's true neighbours.** 3D only helps at higher perplexity, and it doesn't change Curie's placement.
- **Side test on music search:** Qwen was again the odd one out. For questions about numbers ("born before 1945"), adding a metadata filter made more difference than which model you pick.

Method, full results, the project's history and open ideas: [FINDINGS.md](FINDINGS.md).

## See the results

**[Open the comparison page](https://derykhopley.github.io/tc-embedding-model-comparison/output/model-comparison.html)** (and the [3D map experiment](https://derykhopley.github.io/tc-embedding-model-comparison/output/map-3d.html)). These are the pages from the latest run, committed in `output/` and published with GitHub Pages.

- **What we found**: four findings written out in plain language (gender, Marie Curie on the list and on the map, Shakespeare). The numbers are computed from the data, so they stay correct after a rerun; the findings themselves are coded for these people in `src/lib/model-comparison-page.ts`.

1. **Which models agree**: a heatmap of how many of each person's 3 closest neighbours two models share, averaged over everyone.
2. **What the closest neighbours have in common**: how often a person's neighbours share their field or gender, compared with picking neighbours at random.
3. **Who changes most between models**: everyone ranked by how much the models agree on their neighbours. Select a person to see their neighbours under every model.
4. **One model's map**: a 2D t-SNE layout of one model's embeddings, with switchers for the model and the t-SNE perplexity (10, 15, 20 or 30, set in `src/compare-models.ts`).

- **Limits**: hand-assigned tags, drift between runs, small sample, single source, per-model scores.

## Setup

Requires Node 22 or later.

```sh
npm install
cp .env.example .env   # then add your OpenRouter API key
```

## Run

```sh
npm start
```

This embeds every biography with each model listed in `src/lib/embeddings.ts`, prints a summary to the console and writes `output/model-comparison.html`, replacing the committed copy. Open that file in a browser.

A model that fails (for example, one blocked by an [OpenRouter guardrail](https://openrouter.ai/workspaces/default/guardrails)) is skipped with a warning and listed at the top of the page.

## Experiment: maps in 3D

```sh
npm run map3d
```

Writes `output/map-3d.html` (also committed). It lays each model's embeddings out with t-SNE in 2D and in 3D and measures how many of each person's 3 true closest people are also nearest on each map. The page shows that comparison as a table and has a 3D map you can rotate, which lists each person's true closest next to their nearest on the 2D and 3D maps.

## Files

| Path | Contents |
|---|---|
| `src/compare-models.ts` | Entry point for the main page: neighbours, comparison, console output |
| `src/map-3d.ts` | Entry point for the 3D experiment page |
| `src/lib/embeddings.ts` | The models to compare, the embeddings API call and nearest-neighbour search |
| `src/lib/model-comparison.ts` | Agreement, stability and field/gender scores |
| `src/lib/model-comparison-page.ts` | The main HTML page |
| `src/lib/map-3d-page.ts` | The 3D experiment page (rotation and perspective drawn in SVG, no 3D library) |
| `src/lib/page-theme.ts` | Colour tokens shared by both pages, light and dark |
| `src/lib/tsne-scatter.ts` | t-SNE layout in 2D or 3D (see the note in the file about `@thi.ng/tsne`) |
| `data/historical_figures.json` | The biographies (from the course) |
| `data/historical_figures_tags.json` | One field and a gender per person, used for section 2. Hand-assigned and editable. |

## Caveats

- **Similarity scores are only comparable within one model.** Compare rankings across models, not raw scores.
- **The field tags are judgement calls**, one field per person (e.g. Leonardo is tagged as art, Franklin as science).
- **Embeddings vary slightly between API calls**, so neighbour lists and layouts can shift a little between runs.
- **t-SNE maps are laid out independently** per model: compare who is near whom, not where on the page.
