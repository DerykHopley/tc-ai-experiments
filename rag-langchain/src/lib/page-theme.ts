// Colour tokens shared by the generated pages, light and dark.
// Colour roles. Blue, orange and aqua were checked with the dataviz skill's palette
// validator (all pairs, light and dark). Aqua is
// under 3:1 on the light surface, so the highlighted artist also gets a
// name label and an outer ring. The diverging pair (blue <-> red around a grey
// midpoint) is the dataviz skill's reference pair, for signed vector values.
// The 5-step blue ramp (--seq-*) is for scores, with ink colours that stay
// readable on each step; it was validated in embedding-model-comparison.
export const THEME_CSS = `  .viz-root {
    color-scheme: light;
    --page: #f9f9f7;
    --surface-1: #fcfcfb;
    --text-primary: #0b0b0b;
    --text-secondary: #52514e;
    --text-muted: #898781;
    --hairline: #e1e0d9;
    --border: rgba(11, 11, 11, 0.1);
    --wash: rgba(11, 11, 11, 0.06);
    --muted-mark: #c3c2b7;
    --series-1: #2a78d6;
    --series-2: #eb6834;
    --series-3: #1baf7a;
    --div-neg: #2a78d6;
    --div-pos: #e34948;
    --div-mid: #f0efec;
    --code-bg: rgba(11, 11, 11, 0.04);
    --mark-bg: rgba(42, 120, 214, 0.16);
    --mark-alt-bg: rgba(235, 104, 52, 0.16);
    --seq-1: #86b6ef; --seq-2: #5598e7; --seq-3: #2a78d6; --seq-4: #1c5cab; --seq-5: #0d366b;
    --seq-ink-1: #0b0b0b; --seq-ink-2: #0b0b0b; --seq-ink-3: #ffffff; --seq-ink-4: #ffffff; --seq-ink-5: #ffffff;
  }
  @media (prefers-color-scheme: dark) {
    :root:where(:not([data-theme="light"])) .viz-root {
      color-scheme: dark;
      --page: #0d0d0d;
      --surface-1: #1a1a19;
      --text-primary: #ffffff;
      --text-secondary: #c3c2b7;
      --text-muted: #898781;
      --hairline: #2c2c2a;
      --border: rgba(255, 255, 255, 0.1);
      --wash: rgba(255, 255, 255, 0.08);
      --muted-mark: #4a4a46;
      --series-1: #3987e5;
      --series-2: #d95926;
      --series-3: #199e70;
      --div-neg: #3987e5;
      --div-pos: #e66767;
      --div-mid: #383835;
      --code-bg: rgba(255, 255, 255, 0.05);
      --mark-bg: rgba(57, 135, 229, 0.28);
      --mark-alt-bg: rgba(217, 89, 38, 0.3);
      --seq-1: #184f95; --seq-2: #256abf; --seq-3: #3987e5; --seq-4: #6da7ec; --seq-5: #9ec5f4;
      --seq-ink-1: #ffffff; --seq-ink-2: #ffffff; --seq-ink-3: #0b0b0b; --seq-ink-4: #0b0b0b; --seq-ink-5: #0b0b0b;
    }
  }
  :root[data-theme="dark"] .viz-root {
    color-scheme: dark;
    --page: #0d0d0d;
    --surface-1: #1a1a19;
    --text-primary: #ffffff;
    --text-secondary: #c3c2b7;
    --text-muted: #898781;
    --hairline: #2c2c2a;
    --border: rgba(255, 255, 255, 0.1);
    --wash: rgba(255, 255, 255, 0.08);
    --muted-mark: #4a4a46;
    --series-1: #3987e5;
    --series-2: #d95926;
    --series-3: #199e70;
    --div-neg: #3987e5;
    --div-pos: #e66767;
    --div-mid: #383835;
    --code-bg: rgba(255, 255, 255, 0.05);
    --mark-bg: rgba(57, 135, 229, 0.28);
    --mark-alt-bg: rgba(217, 89, 38, 0.3);
    --seq-1: #184f95; --seq-2: #256abf; --seq-3: #3987e5; --seq-4: #6da7ec; --seq-5: #9ec5f4;
    --seq-ink-1: #ffffff; --seq-ink-2: #ffffff; --seq-ink-3: #0b0b0b; --seq-ink-4: #0b0b0b; --seq-ink-5: #0b0b0b;
  }
`;
