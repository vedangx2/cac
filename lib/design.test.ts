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
//   • TEN COLOURS AND FIVE TYPE SIZES. Counted here so the claim in SESSION-REPORT.md stays
//     true rather than becoming a thing that was true once.
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

  it('has exactly one accent colour defined in the theme', () => {
    // 'flag' is the accent. 'pad-go' is a stimulus, not an accent — it is a target to hit and
    // never appears on a screen that reports anything.
    const accents = [...GLOBALS.matchAll(/--color-([a-z-]+):/g)]
      .map((match) => match[1])
      .filter((name) => !['paper', 'surface', 'ink', 'ink-soft', 'instrument', 'instrument-panel', 'instrument-ink', 'instrument-ink-soft', 'pad-go'].includes(name));

    expect(accents).toEqual(['flag']);
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
   COUNT THE TOKENS AND THE TYPE SIZES
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('the palette and the type scale are the size we say they are', () => {
  it('defines exactly ten colours', () => {
    const colours = [...GLOBALS.matchAll(/^\s*(?:\/\* \d+ \*\/ )?--color-([a-z-]+):/gm)].map(
      (match) => match[1],
    );

    expect(colours.sort()).toEqual(
      [
        'flag',
        'ink',
        'ink-soft',
        'instrument',
        'instrument-ink',
        'instrument-ink-soft',
        'instrument-panel',
        'pad-go',
        'paper',
        'surface',
      ].sort(),
    );
  });

  it('defines exactly five type sizes', () => {
    // Only the size declarations, not the paired --line-height / --letter-spacing lines.
    const sizes = [...GLOBALS.matchAll(/^\s*--text-([a-z]+):/gm)].map((match) => match[1]);

    expect(sizes.sort()).toEqual(['body', 'display', 'meta', 'stimulus', 'title']);
  });

  it('deletes the built-in palettes and type steps, so nothing else can be used', () => {
    // Without these two resets a stray `text-blue-500` or `text-xs` would silently work and
    // the counts above would describe a wish rather than the app.
    expect(GLOBALS).toMatch(/--color-\*:\s*initial;/);
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
});

/* ═══════════════════════════════════════════════════════════════════════════════════
   THE SIX MODULES
   ═══════════════════════════════════════════════════════════════════════════════════ */

describe('all six test modules are dark instruments', () => {
  for (const path of MODULE_PAGES) {
    it(`${path} renders on the instrument surface`, () => {
      const source = sourceOf(path);
      expect(source).toMatch(/<InstrumentShell>/);
      // The document shell is for screens you READ. A test module is a screen you PERFORM.
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
  it('the shared button is 56px tall', () => {
    // A mis-hit on a test screen is not a mis-hit — it is recorded as an answer.
    const ui = readFileSync(join(REPO, 'components', 'ui.tsx'), 'utf8');
    expect(ui).toMatch(/min-h-14/);
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
});
