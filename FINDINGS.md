# Findings and history

Results so far, how we got here, and open ideas. Numbers are from the run on 2026-10-07 with all five models; embeddings vary slightly between API calls, so expect small drift on rerun.

## How the project grew

1. Exercise 26 in `../1-2-development-environment-api` (embedding-based search) embedded the 68 biographies with `text-embedding-3-small` and printed nearest neighbours.
2. Added a t-SNE scatter plot. Found that `@thi.ng/tsne` does not reduce dimensions (see `CLAUDE.md`), so `tsne2d` restarts the layout in 2D.
3. The user asked why Marie Curie sits far from Einstein on the map. Analysis (below) led to comparing models.
4. Added `text-embedding-3-large`, then Qwen, Mistral and Gemini. Five stacked maps were hard to compare, so the page became four views: agreement heatmap, field/gender scores, a "who changes most" ranking with a per-person comparison, and a single map with a model switcher.
5. Moved out of the course repo into this project. Exercise 26 no longer exists in the course repo.
6. Added a perplexity switcher to the map (results under Marie Curie below).
7. Every heatmap cell had the same colour: all pairs share 1.9–2.3 of 3 neighbours, which fell into one step of a 0–3 scale. The colour scale now spans the observed range instead, and cells show two decimals so cells with the same rounded value don't get different shades.
8. Added a "What we found" card (findings computed from the data, interpretations marked as untested) and a "Limits" card to the page, for presenting to the class.
9. Asked whether a 3D map would help. Measured it first, then built a separate experiment page (`npm run map3d`, `output/map-3d.html`). Results under "2D or 3D maps" below.

## Method choices

- **Neighbours:** 3 closest by cosine similarity (`findNearestNeighbors(..., 3)` in `src/lib/embeddings.ts`).
- **Agreement between two models:** how many of a person's 3 neighbours both models share, averaged over all people (0–3).
- **Per-person agreement:** the same overlap averaged over every pair of models, as a fraction (0–100%).
- **Field / gender score:** share of a person's 3 neighbours with the same tag, averaged over people, shown against the chance of a random other person sharing it.
- **Heatmap colours:** five steps spread from the lowest to the highest agreement in the grid (not 0–3), with those endpoints on the legend. A dark cell means high *for this grid*; every pair still shares about 2 of 3 neighbours.
- **t-SNE:** 1000 iterations, seed 42, laid out at perplexity 10 (default), 15, 20 and 30; the page switches between them.

## Results (five models)

Agreement (shared neighbours of 3), from 1.9 to 2.3. The two OpenAI models are most alike (2.28); Qwen is least like the others (1.9–2.0).

| Model | Dimensions | Same field | Same gender |
|---|---|---|---|
| chance | | 13% | 59% |
| text-embedding-3-small | 1536 | 60% | 88% |
| text-embedding-3-large | 3072 | 63% | 84% |
| qwen3-embedding-8b | 4096 | 56% | 90% |
| mistral-embed-2312 | 1024 | 63% | 83% |
| gemini-embedding-2 | 3072 | 55% | 82% |

**Every model groups people by gender far above chance, as well as by field.** The likely cause is the text: many women's biographies are framed around being "the first woman to…".

People the models disagree on most: Marie Curie (33%), William Shakespeare (40%), Catherine the Great, Fyodor Dostoevsky, Napoleon Bonaparte (43% each). Only 3 people have identical neighbours in every model.

### Marie Curie

- Her biography stresses "first woman" three times plus Paris, so she relates weakly and evenly to pioneering women, French women and physicists. Her closest similarity (0.40 with the small model) is below the median person's closest (0.48).
- Einstein is her 3rd closest (small model), but she is only his 7th: the link is one-sided.
- t-SNE puts 73% of her neighbour weight on a group of women and 14% on scientists, so the map places her with the women, far from Einstein.
- Across models, Einstein is in her top 3 for four of five models; the other places go mostly to women (Mother Teresa, Nightingale, Simone Weil, Beauvoir, Chanel). Gemini alone gives her Tesla instead of Einstein.
- **Perplexity (small model, seed 42):** raising it shifts her t-SNE weight from women to scientists (women 83% → 78% → 73% → 66%, scientists 17% → 20% → 22% → 24% at perplexity 10/15/20/30; here "women" is every woman in the tags file and "scientists" the Science & invention field, so the baseline differs from the 73%/14% above). She does not move towards the middle: her nearest people on the map stay Chanel, Nightingale and Beauvoir. Instead the whole scientist group moves next to the women's group, so Einstein goes from her 58th nearest on the map (of 67) at perplexity 10 to 38th–43rd at 15–30. These ranks are for seed 42 only; see "2D or 3D maps" for how much they change with the seed.

### Shakespeare

The OpenAI models and Gemini group him mostly with writers (Dante, Cervantes). Qwen pairs him with Bach, Leonardo and Newton, closer to "famous genius" than "writer". Mistral mixes the two.

## 2D or 3D maps

Measure: the share of each person's 3 true closest people (cosine similarity on the full embeddings) who are also among their 3 nearest points on the t-SNE map, averaged over everyone. Placing people at random would keep about 4%.

| Model | 2D p10 | 3D p10 | 2D p30 | 3D p30 |
|---|---|---|---|---|
| text-embedding-3-small | 70% | 69% | 66% | 73% |
| text-embedding-3-large | 65% | 68% | 62% | 71% |
| qwen3-embedding-8b | 68% | 68% | 58% | 65% |
| mistral-embed-2312 | 68% | 70% | 62% | 67% |
| gemini-embedding-2 | 64% | 65% | 63% | 68% |

- **The 2D map is already fairly faithful:** it keeps about two thirds of everyone's 3 closest neighbours.
- **3D only helps at higher perplexity:** about the same as 2D at perplexity 10 (−1 to +3 points), 5–9 points better at 30. One seed per cell; with text-embedding-3-small, seeds 42, 7 and 1234 moved these by 1–3 points.
- **3D doesn't fix Marie Curie.** Einstein is her 3rd closest in the embeddings, but in all 12 small-model layouts tried (2D/3D × perplexity 10/30 × 3 seeds) her 3 nearest points on the map are women.
- **The main page's "Einstein is her #59 nearest at perplexity 10" depends on the seed:** across seeds 42, 7 and 1234 it was 58th, 33rd and 42nd. That her map neighbours are women holds for every seed, and raising perplexity doesn't reliably bring Einstein closer (seed 7: 33rd at perplexity 10, 43rd at 30). The page's findings card now states only the seed-independent part.

## Limits

Also shown on the page.

- **Hand-assigned tags.** One field per person, with judgement calls (Leonardo = art, Franklin = science); the field scores depend on them.
- **Drift between runs.** The size of this noise hasn't been measured, so small differences (around 0.1 in the agreement grid) may not be real.
- **Small sample.** For one person and one pair of models, agreement is 0, 1, 2 or 3 shared neighbours. Per-person agreement averages 10 model pairs, so it moves in steps of about 3.3 percentage points.
- **One short biography per person, all from one source.** Results describe how these texts are written as much as how the models behave.

## Open ideas

- **Test the "first woman" hypothesis:** rewrite a few biographies (starting with Curie's) without "first woman to…", re-embed them, and see whether the gender grouping and Curie's neighbours change. Turns the likely cause into a tested one.
- **Measure the noise:** run each model 3–5 times and compare each model with its own earlier runs. If a model shares only 2.8 of 3 neighbours with itself, gaps of 0.1 between models mean little.
- **Hubs:** count how often each person appears in someone else's top 3. Some people are everyone's neighbour and some are no one's ("hubness" in high-dimensional data); explains one-sided links like Curie → Einstein. Needs no API calls: the neighbour lists are in the page data.
- **Search queries:** embed queries such as "a physicist" or "fought for civil rights" and compare the top results across models. Shows what model differences mean for search, the original point of exercise 26.
- **Score distributions:** a histogram of all pairwise similarities per model, to show why raw scores aren't comparable across models.
- **Fewer dimensions:** OpenAI's embedding-3 models can return shorter vectors (e.g. 256 instead of 1536). Do the neighbours survive? Check first that OpenRouter passes the `dimensions` setting through.
- **Input text:** embed only each biography's first sentence, or a one-line summary of the person's field, to separate the effect of the text from the effect of the model.
- **Per-field breakdown:** field scores per field (e.g. do models keep composers together better than philosophers?).
- **More neighbours:** k = 5 or 10 to see whether disagreement is only at the margins.
