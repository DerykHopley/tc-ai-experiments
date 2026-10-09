/**
 * Rebuild the Chroma collection from scratch
 * npm run reindex
 * ---
 * The stored vectors don't update themselves. After changing the loader,
 * the splitter or the embedding model, run this to embed everything again.
 */
import { rebuildVectorStore } from './lib/pipeline.ts';

await rebuildVectorStore();
