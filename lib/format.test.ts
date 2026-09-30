// lib/format.test.ts
//
// Covers `initials`, added for the printable report (CLAUDE.md Task 4). The other functions in
// lib/format.ts were already untested before this pass; this file stays scoped to what this
// pass added rather than retroactively testing pre-existing code.

import { describe, expect, it } from 'vitest';
import { initials } from './format';

describe('initials', () => {
  it('takes the first letter of each word, capitalised', () => {
    expect(initials('Jordan Smith')).toBe('JS');
    expect(initials('jordan smith')).toBe('JS');
  });

  it('handles a single name', () => {
    expect(initials('Jordan')).toBe('J');
  });

  it('caps at three letters for a long name, first + last + one middle', () => {
    expect(initials('Jordan Michael Alexander Smith')).toBe('JMS');
  });

  it('collapses repeated whitespace and trims the ends', () => {
    expect(initials('  Jordan   Smith  ')).toBe('JS');
  });

  it('falls back to a placeholder for an empty or blank name rather than throwing', () => {
    expect(initials('')).toBe('?');
    expect(initials('   ')).toBe('?');
  });
});
