// lib/design.test.ts
//
// THE DESIGN SYSTEM, MACHINE-CHECKED.
//
// ═════════════════════════════════════════════════════════════════════════════════════
// WHY A TEST AND NOT A STYLE GUIDE
// ═════════════════════════════════════════════════════════════════════════════════════
// A design system written down in a document survives exactly as long as everybody
// remembers to read it. The rules below are the ones where forgetting has a consequence, so
// they are assertions instead:
//
//   • RED MEANS FLAGGED, AND NOTHING ELSE. The moment red also means "delete" or "heads up",
//     it stops meaning "flagged", and the one screen where it has to land hardest is the one
//     that loses. This is the rule most likely to erode, because a red warning always feels
//     locally correct.
//   • NO GREEN, ANYWHERE. Not as a success tone, not as a tick, not as a "you're fine". See
//     CLAUDE.md → THE HARD RULE. The single exception is the GO stimulus on the two timed
//     pads, which is a physical target and never appears on a results screen.
//   • THE COLOUR LIST AND THE TYPE SIZES ARE EXACT. Counted here so the claim in
//     SESSION-REPORT.md stays true rather than becoming a thing that was true once.
//   • ONE FONT FAMILY, EVERYWHERE. Replaced 2026-09-23 — this app used to carry a serif
//     reading face and a monospace figures face on its reading screens. Both are gone; every
//     screen, reading or instrument, now renders in the one system-UI stack.
//   • THE SIX MODULES ARE DARK INSTRUMENTS and every one shows where you are in the battery.
//
// These are source-text guards, the same technique and the same limitation as the structural
// guards in lib/regression.test.ts: they prove the rule is written in the file, not that it
// renders correctly. That is still enough to fail the moment somebody reverts one.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every .tsx under app/ and components/, as [repo-relative path, contents]. */
function allComponentFiles(): Array<[string, string]> {
  const found: Array<[string, string]> = [];

  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const full = join(directory, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.endsWith('.tsx')) {
        found.push([relative(REPO, full).replace(/\\/g, '/'), readFileSync(full, 'utf8')]);
      }
    }
  };

  walk(join(REPO, 'app'));
  walk(join(REPO, 'components'));
  return found;
}

const FILES = allComponentFiles();
const GLOBALS = readFileSync(join(REPO, 'app', 'globals.css'), 'utf8');
const UI = readFileSync(join(REPO, 'components', 'ui.tsx'), 'utf8');

/** The six test modules. Everything in here is an instrument screen. */
const MODULE_PAGES = [
  'app/tests/symptom/page.tsx',
  'app/tests/words/page.tsx',
  'app/tests/digits/page.tsx',
  'app/tests/pattern/page.tsx',
  'app/tests/gonogo/page.tsx',
  'app/tests/words/recall/page.tsx',
];

function sourceOf(path: string): string {
  const found = FILES.find(([name]) => name === path);
  if (!found) throw new Error(`Expected ${path} to exist. Did a module move?`);
  return found[1];
}

/* ═══════════════════════════════════════════════════════════════════════════════════
   ONE ACCENT, ONE MEANING
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('red means flagged and appears nowhere else', () => {
  it('is used only on the results screen', () => {
    const offenders = FILES.filter(
      ([name, source]) =>
        name !== 'app/results/[id]/page.tsx' && /\b(?:bg|text|border|decoration)-flag\b/.test(source),
    ).map(([name]) => name);

    // A destructive action, an error, a refusal and a "switched off" notice are all real
    // things that want to look urgent. None of them is a flag. They use a heavy ink panel.
    expect(offenders).toEqual([]);
  });

  it('has exactly one SIGNAL colour defined in the theme', () => {
    // 'flag' is the one colour that means something. 'pad-go' is a stimulus, not a signal —
    // it is a target to hit and never appears on a screen that reports anything. 'action'
    // and 'link' are UI colours (what a button or a live link looks like), not signals.
    const signals = [...GLOBALS.matchAll(/--color-([a-z-]+):/g)]
      .map((match) => match[1])
      .filter(
        (name) =>
          ![
            'canvas',
            'surface',
            'ink',
            'ink-secondary',
            'hairline',
            'action',
            'link',
            'instrument',
            'instrument-panel',
            'instrument-ink',
            'instrument-ink-soft',
            'pad-go',
          ].includes(name),
      );

    expect(signals).toEqual(['flag']);
  });
});

describe('there is no success green and no checkmark anywhere', () => {
  it('defines no green token other than the go stimulus', () => {
    const greens = [...GLOBALS.matchAll(/--color-([a-z-]+):/g)]
      .map((match) => match[1])
      .filter((name) => /green|emerald|lime|teal|success|ok|safe|clear/.test(name));

    expect(greens).toEqual([]);
  });

  it('uses no green utility class in any screen', () => {
    const offenders = FILES.filter(([, source]) =>
      /\b(?:bg|text|border|from|to|via|ring|decoration)-(?:green|emerald|lime|teal)\b/.test(source),
    ).map(([name]) => name);

    expect(offenders).toEqual([]);
  });

  it('uses no tick glyph in any screen', () => {
    const offenders = FILES.filter(([, source]) => /[✓✔☑]/.test(source)).map(
      ([name]) => name,
    );

    expect(offenders).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   COLOUR — Apple's reading palette, exactly, plus the unchanged instrument/signal set
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('the palette is exactly the Apple spec plus the unchanged instrument and signal tokens', () => {
  it('defines exactly thirteen colours', () => {
    // Replaced 2026-09-23: the warm/serif/`clinic` system is gone. Seven reading tokens
    // (canvas, surface, ink, ink-secondary, hairline, action, link) from the spec, plus
    // `flag` (the one signal, unchanged), the four instrument tokens (unchanged names, new
    // dark values) and `pad-go` (unchanged). See app/globals.css for every value.
    const colours = [...GLOBALS.matchAll(/^\s*--color-([a-z-]+):/gm)].map((match) => match[1]);

    expect(colours.sort()).toEqual(
      [
        'canvas',
        'surface',
        'ink',
        'ink-secondary',
        'hairline',
        'action',
        'link',
        'flag',
        'instrument',
        'instrument-panel',
        'instrument-ink',
        'instrument-ink-soft',
        'pad-go',
      ].sort(),
    );
  });

  it('names none of the deleted 2026-09-22 tokens', () => {
    // `paper`, `ink-soft` (the reading-world one) and `clinic` are gone outright, not
    // renamed with a fallback — a stray reference to any of them is a leftover, not a style
    // choice, since the whole point of this pass was removing them.
    const offenders = FILES.filter(([, source]) =>
      /\b(?:bg|text|border|decoration|ring|from|to|via)-(?:paper|clinic)\b/.test(source),
    ).map(([name]) => name);

    expect(offenders).toEqual([]);
  });

  it('sets the flagged red to the unchanged value', () => {
    // The brief that replaced this system said keep the flag colour byte-for-byte. Pinned
    // here so nobody "improves" it while touching the rest of the palette.
    expect(GLOBALS).toMatch(/--color-flag:\s*#c8102e;/);
  });

  it('deletes the built-in palette, so nothing else can be used', () => {
    expect(GLOBALS).toMatch(/--color-\*:\s*initial;/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   TYPE — one family everywhere, and the exact size list
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('the type scale is the size we say it is', () => {
  it('defines exactly six type sizes', () => {
    // `hero` (48px) is new 2026-09-23: the largest headline on a reading screen. The other
    // five are unchanged in name AND pixel value from before this pass — only which world
    // uses which of them changed (see the comment above the @theme block in globals.css).
    const sizes = [...GLOBALS.matchAll(/^\s*--text-([a-z]+):/gm)].map((match) => match[1]);

    expect(sizes.sort()).toEqual(['body', 'display', 'hero', 'meta', 'stimulus', 'title'].sort());
  });

  it('deletes the built-in type steps, so nothing else can be used', () => {
    expect(GLOBALS).toMatch(/--text-\*:\s*initial;/);
  });

  it('uses no built-in Tailwind type step in any screen', () => {
    const offenders = FILES.filter(([, source]) =>
      /\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b/.test(source),
    ).map(([name]) => name);

    expect(offenders).toEqual([]);
  });

  it('keeps body text at 17px, above the 16px floor for a phone in daylight', () => {
    expect(GLOBALS).toMatch(/--text-body:\s*1\.0625rem;/);
  });

  it('keeps the instrument stimulus size (64px) unchanged by this pass', () => {
    expect(GLOBALS).toMatch(/--text-stimulus:\s*4rem;/);
  });

  it('the new hero size is 48px, the spec number', () => {
    expect(GLOBALS).toMatch(/--text-hero:\s*3rem;/);
  });
});

describe('there is exactly one font family, everywhere', () => {
  // Replaced 2026-09-23: the results-screen-only serif/monospace pair from 2026-09-20 is
  // gone outright — not narrowed, removed. Every screen, reading or instrument, renders in
  // Apple's system-UI stack.

  it('declares the same one stack on the root and on the body', () => {
    const stack = /font-family:\s*-apple-system, BlinkMacSystemFont/;
    const htmlBlock = GLOBALS.slice(GLOBALS.indexOf('html {'), GLOBALS.indexOf('body {'));
    const bodyBlock = GLOBALS.slice(GLOBALS.indexOf('body {'));

    expect(htmlBlock).toMatch(stack);
    expect(bodyBlock).toMatch(stack);
  });

  it('declares no other font-family anywhere in the stylesheet', () => {
    // Two declarations total (html, body), both the same stack. A third declaration would
    // mean a second family crept back in.
    const declarations = [...GLOBALS.matchAll(/font-family:\s*([^;]+);/g)];
    expect(declarations).toHaveLength(2);
    for (const [, value] of declarations) {
      expect(value).toMatch(/^-apple-system, BlinkMacSystemFont/);
    }
  });

  it('names no serif or monospace stack anywhere', () => {
    expect(GLOBALS).not.toMatch(/ui-serif|ui-monospace/);
  });

  it('uses no font-read or font-figure class anywhere — both were deleted, not narrowed', () => {
    const offenders = FILES.filter(([, source]) => /\bfont-(?:read|figure)\b/.test(source)).map(
      ([name]) => name,
    );
    expect(offenders).toEqual([]);
  });

  it('uses tabular figures, not a monospace face, for numbers that must align', () => {
    expect(GLOBALS).toMatch(/font-variant-numeric:\s*tabular-nums;/);
  });
});

describe('reading-screen typography follows the spec: sentence case, no tracked eyebrows', () => {
  it('PageHeader and Kicker — the shared eyebrow components — are never uppercase', () => {
    // "SIDELINE CONCUSSION SCREENING AID" becomes small semibold sentence case, not a
    // shouted, letter-spaced kicker. Checked on the shared components so every caller
    // inherits the rule instead of each page having to remember it.
    const pageHeaderAndKicker = UI.slice(UI.indexOf('export function PageHeader'), UI.indexOf('/* ─', UI.indexOf('export function Kicker')));
    expect(pageHeaderAndKicker).not.toMatch(/uppercase/);
    expect(pageHeaderAndKicker).not.toMatch(/tracking-widest/);
  });

  it('headlines use weight 600 (font-semibold), not font-black', () => {
    // font-black (900) was the old system's headline weight. The spec is 600 — semibold —
    // everywhere on a reading screen.
    const READING_HEADLINE_FILES = [
      'app/page.tsx',
      'app/athletes/page.tsx',
      'app/athletes/[id]/page.tsx',
      'app/practice/page.tsx',
      'app/practice/summary/page.tsx',
      'app/results/[id]/page.tsx',
    ];
    for (const path of READING_HEADLINE_FILES) {
      expect(sourceOf(path), path).not.toMatch(/font-black/);
    }
    expect(UI).not.toMatch(/font-black.*PageHeader|PageHeader[\s\S]{0,200}font-black/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   BUTTONS — pill on reading screens, unchanged geometry on instrument screens
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('reading-screen buttons are pill-shaped; instrument buttons are unchanged by this pass', () => {
  it('the reading-screen variants are rounded-full and at least 44px tall', () => {
    const primary = UI.slice(UI.indexOf('primary:'), UI.indexOf('secondary:'));
    const secondary = UI.slice(UI.indexOf('secondary:'), UI.indexOf('instrument:'));
    for (const variant of [primary, secondary]) {
      expect(variant).toMatch(/rounded-full/);
      expect(variant).toMatch(/min-h-11/);
    }
  });

  it('the instrument variants keep their 56px, rounded-rectangle geometry', () => {
    const instrumentBlock = UI.slice(UI.indexOf("'instrument-quiet'") - 400);
    expect(instrumentBlock).toMatch(/min-h-14/);
    expect(instrumentBlock).toMatch(/rounded-xl/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   THE SIX MODULES
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('all six test modules are dark instruments', () => {
  for (const path of MODULE_PAGES) {
    it(`${path} renders on the instrument surface`, () => {
      const source = sourceOf(path);
      expect(source).toMatch(/<InstrumentShell>/);
      // The reading shell is for screens you READ. A test module is a screen you PERFORM.
      expect(source).not.toMatch(/<PageShell>/);
    });
  }
});

describe('every module tells the athlete where they are in the battery', () => {
  for (const path of MODULE_PAGES) {
    it(`${path} passes the battery position to its header`, () => {
      expect(sourceOf(path)).toMatch(/step=\{battery\.loaded \? battery\.stepLabel : undefined\}/);
    });
  }

  it('the position is the position even in practice mode', () => {
    // It used to read "Practice" instead of "Step 5 of 6", which removed the one thing every
    // test screen must show from exactly the screens somebody sees for the first time.
    const battery = readFileSync(join(REPO, 'components', 'battery.tsx'), 'utf8');
    expect(battery).toMatch(/stepLabel: stepPosition\(step\),/);
    expect(battery).not.toMatch(/stepLabel: session \? stepPosition\(step\) : 'Practice'/);
  });
});

describe('every module states its instruction in one line', () => {
  for (const path of MODULE_PAGES) {
    it(`${path} passes a single instruction string`, () => {
      const source = sourceOf(path);
      expect(source).toMatch(/instruction=/);
    });
  }
});

describe('the design bans hold', () => {
  it('uses no decorative gradient', () => {
    const offenders = FILES.filter(([, source]) =>
      /\bbg-gradient-|\bbg-linear-|\bfrom-\[|\bvia-\[/.test(source),
    ).map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  it('uses no glassmorphism or backdrop blur', () => {
    const offenders = FILES.filter(([, source]) => /\bbackdrop-(?:blur|filter)/.test(source)).map(
      ([name]) => name,
    );
    expect(offenders).toEqual([]);
  });

  it('uses no drop shadow', () => {
    // Shadows here would be decoration, not elevation — nothing in this app floats.
    const offenders = FILES.filter(([, source]) =>
      /\bshadow-(?:sm|md|lg|xl|2xl)\b|\bdrop-shadow\b/.test(source),
    ).map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  it('uses no emoji in any screen', () => {
    const offenders = FILES.filter(([, source]) =>
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(source),
    ).map(([name]) => name);
    expect(offenders).toEqual([]);
  });

  it('uses no arbitrary spacing or size values in the six modules', () => {
    const offenders = MODULE_PAGES.filter((path) =>
      /(?:^|[\s"'`])(?:[a-z-]+)-\[[0-9.]+(?:px|rem|em)\]/.test(sourceOf(path)),
    );
    expect(offenders).toEqual([]);
  });

  it('never says AI, smart, or powered by', () => {
    const offenders = FILES.filter(([, source]) => {
      // Strip comments first — the disclosure comments legitimately discuss what AI wrote.
      const visible = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      return /\bpowered by\b|\bsmart\b|\bAI-powered\b/i.test(visible);
    }).map(([name]) => name);

    expect(offenders).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   TAP TARGETS
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('anything you tap in a test module is big enough to hit', () => {
  it('the instrument button variants are 56px tall', () => {
    // A mis-hit on a test screen is not a mis-hit — it is recorded as an answer.
    expect(UI).toMatch(/min-h-14/);
  });

  it('the symptom rating chips are 56px tall', () => {
    expect(sourceOf('app/tests/symptom/page.tsx')).toMatch(/flex min-h-14 flex-1/);
  });

  it('the word grid tiles are at least 56px tall', () => {
    // min-h-16 is 64px.
    expect(sourceOf('app/tests/words/page.tsx')).toMatch(/min-h-16/);
    expect(sourceOf('app/tests/words/recall/page.tsx')).toMatch(/min-h-16/);
  });

  it('the digit keypad keys are at least 56px tall', () => {
    expect(sourceOf('app/tests/digits/page.tsx')).toMatch(/min-h-16/);
  });

  it('the links in the chrome and the practice banner are at least 44px tall too', () => {
    const layout = readFileSync(join(REPO, 'app', 'layout.tsx'), 'utf8');
    const battery = readFileSync(join(REPO, 'components', 'battery.tsx'), 'utf8');

    expect(layout).toMatch(/inline-flex min-h-14 items-center[^"]*Sideline|Sideline/);
    expect((layout.match(/inline-flex min-h-14 items-center/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(battery).toMatch(/inline-flex min-h-14 items-center/);
  });
});
