// Colour tokens shared by the pages, light and dark. The series blue and the
// sequential ramp were checked with the dataviz skill's palette validator.
export const THEME_CSS = `  .viz-root {
    color-scheme: light;
    --page: #f9f9f7;
    --surface-1: #fcfcfb;
    --text-primary: #0b0b0b;
    --text-secondary: #52514e;
    --text-muted: #898781;
    --hairline: #e1e0d9;
    --baseline: #c3c2b7;
    --border: rgba(11, 11, 11, 0.1);
    --wash: rgba(11, 11, 11, 0.04);
    --series-1: #2a78d6;
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
      --baseline: #383835;
      --border: rgba(255, 255, 255, 0.1);
      --wash: rgba(255, 255, 255, 0.05);
      --series-1: #3987e5;
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
    --baseline: #383835;
    --border: rgba(255, 255, 255, 0.1);
    --wash: rgba(255, 255, 255, 0.05);
    --series-1: #3987e5;
    --seq-1: #184f95; --seq-2: #256abf; --seq-3: #3987e5; --seq-4: #6da7ec; --seq-5: #9ec5f4;
    --seq-ink-1: #ffffff; --seq-ink-2: #ffffff; --seq-ink-3: #0b0b0b; --seq-ink-4: #0b0b0b; --seq-ink-5: #0b0b0b;
  }
`;
