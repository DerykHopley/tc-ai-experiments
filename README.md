# tc-ai-experiments

Experiments from learning AI engineering at Turing College. Each folder is an independent project with its own dependencies, README and findings. They're here to share what turned up and to discuss it with other learners.

## Projects

| Project | The question | What turned up | Pages |
| --- | --- | --- | --- |
| [embedding-model-comparison](embedding-model-comparison/) | Do different embedding models relate the same people in the same way? | The models mostly agree, but every one groups people by gender more than by field. Marie Curie is where they disagree most. | [Comparison](https://derykhopley.github.io/tc-ai-experiments/embedding-model-comparison/output/model-comparison.html) · [3D map](https://derykhopley.github.io/tc-ai-experiments/embedding-model-comparison/output/map-3d.html) |
| [rag-langchain](rag-langchain/) | What happens at each step of a semantic search + RAG pipeline (LangChain, Chroma), and how do you evaluate it? | Chunks group by artist, not by genre. Answers are capped by what retrieval finds. In an LLM-as-judge evaluation, capping chunks per artist found every expected artist, but answers only improved at 2 per artist: breadth costs depth. | [Walkthrough](https://derykhopley.github.io/tc-ai-experiments/rag-langchain/output/walkthrough.html) · [Embedding map](https://derykhopley.github.io/tc-ai-experiments/rag-langchain/output/embedding-map.html) · [Evaluation](https://derykhopley.github.io/tc-ai-experiments/rag-langchain/output/eval-runs/comparison.html) |

The pages are self-contained HTML from each project's latest run, so you can open them without installing anything or needing an API key.

## Running a project

Each project runs on its own:

```sh
cd rag-langchain
npm install
cp .env.example .env   # then add your OpenRouter key
```

Then follow that project's README. The projects use [OpenRouter](https://openrouter.ai) for models, and runs cost a fraction of a cent.

## Discussing

Questions, ideas and your own results go in [Discussions](https://github.com/DerykHopley/tc-ai-experiments/discussions). Found a bug or a wrong number? Open an issue.

## Adding a project

- **Use a new top-level folder** with its own `package.json`. Don't depend on another project's files; copy what you need and note where it came from.
- **Lead the README with the findings**, then how to see the results, then setup.
- **Commit generated pages** in `output/`, so they're published with GitHub Pages, and link them from the README and the table above.
- **Never commit keys.** The root `.gitignore` covers `.env`, `node_modules/` and `chroma-data/` for every project. Ship a `.env.example` instead.
- **Only publish your own work and data you're allowed to share.** No course material. Note each dataset's source and licence in the project, like [rag-langchain/data/README.md](rag-langchain/data/README.md).
