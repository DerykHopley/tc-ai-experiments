/**
 * Stage 1: Document loaders
 * npm run 1-load
 * ---
 * A loader reads a source (file, web page, PDF, database...) and returns
 * Documents: { pageContent: string, metadata: object }. Everything later in
 * the pipeline works on Documents, so this is where you decide what a
 * "searchable unit" is.
 */
import { loadArtistDocuments, loadCsv } from './lib/pipeline.ts';

// 1. The raw loader output: one Document per CSV row
const rawArtists = await loadCsv('artists.csv');
const rawReleases = await loadCsv('releases.csv');
console.log(`CSVLoader: artists.csv -> ${rawArtists.length} Documents`);
console.log(`CSVLoader: releases.csv -> ${rawReleases.length} Documents\n`);

console.log('A raw release Document:');
console.log(rawReleases[0]);

// 2. Reshaped: one profile Document per artist, releases folded in.
// Searching 4,900 release rows would mostly match album titles; one profile
// per artist matches what questions are about.
const docs = await loadArtistDocuments();
console.log(`\nReshaped into ${docs.length} artist profile Documents.`);

const lengths = docs.map((doc) => doc.pageContent.length);
console.log(
  `Profile length: min ${Math.min(...lengths)}, max ${Math.max(...lengths)} characters\n`,
);

const sample = docs.find((doc) => doc.metadata.artist_name === 'Fela Kuti')!;
console.log('A profile Document:');
console.log('metadata:', sample.metadata);
console.log(sample.pageContent);
