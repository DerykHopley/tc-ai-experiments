# Data

The CSVs are the [Global Music Popularity & Cultural Attention](https://www.kaggle.com/datasets/blixture/global-music-popularity-and-cultural-attention) dataset by Blixture on Kaggle. It covers 51 artists with their MusicBrainz metadata and releases, plus Wikipedia pageviews. It's published under the MIT licence, copied below, and the files are unchanged.

`music_ground_truths.json` is ours. It holds test queries with the artists each one should find, generated with Claude from `artists.csv` and the data dictionaries. The expected artists are judgement calls, and the `notes` field explains the borderline ones, so treat it as a rough check rather than a gold standard. `npm run 3-search` uses it to check retrieval.

## Licence (CSV files)

MIT License

Copyright (c) Blixture

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
