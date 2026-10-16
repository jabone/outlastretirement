// Year-specific dollar figures in the Guide and the Input Dictionary.
//
// Where the engine exports the constant, the prose imports it
// (src/utils/copyFigures.js), so the two cannot disagree. Where it does not,
// this pins each figure the prose quotes to the literal in calculator.js: the
// yearly tax update that changes one without the other fails here.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACA_CLIFF_COUPLE, ACA_CLIFF_SINGLE, TOP_RATE_START_MFS, TOP_RATE_START_SINGLE, usd } from '../utils/copyFigures';
import { ACA_SUBSIDY_CLIFF_FPL_MULTIPLE, getFederalPovertyLevel } from '../calculator';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(SRC, f), 'utf8');
const guide = read('components/tabs/GuideTab.jsx');
const dict = read('components/InputReference.jsx');
const engine = read('calculator.js');

describe('figures the prose quotes but the engine does not export', () => {
  const PINS = [
    // [what the prose says, where, the engine literal it must match]
    ['$98,900 of joint taxable', guide, /\(status === 'MFJ' \? 98900 : 49450\)/],
    ['income ($49,450 single)', guide, /\(status === 'MFJ' \? 98900 : 49450\)/],
    ['a $32,200 standard deduction', guide, /const DEDUCTION_MFJ = 32200;/],
    ['$24,500 base for {TAX_YEAR}', dict, /const ELECTIVE_DEFERRAL_LIMIT_2026 = 24500;/],
    ['$7,500 base for {TAX_YEAR}', dict, /const IRA_LIMIT_2026 = 7500;/],
    ['IRA limit, $7,500', dict, /const IRA_LIMIT_2026 = 7500;/],
  ];
  for (const [phrase, text, literal] of PINS) {
    it(`"${phrase}" matches the engine`, () => {
      expect(text).toContain(phrase);
      expect(engine).toMatch(literal);
    });
  }
});

describe('figures the prose reads from the engine', () => {
  it('the ACA cliff is 400% of the poverty line for one and for two', () => {
    expect(ACA_CLIFF_COUPLE).toBe(ACA_SUBSIDY_CLIFF_FPL_MULTIPLE * getFederalPovertyLevel(2));
    expect(ACA_CLIFF_SINGLE).toBe(ACA_SUBSIDY_CLIFF_FPL_MULTIPLE * getFederalPovertyLevel(1));
    for (const text of [guide, dict]) {
      expect(text).toContain('{usd(ACA_CLIFF_COUPLE)}');
      // The old hand-typed figures, which disagreed with the engine.
      expect(text).not.toMatch(/\$84,600|\$62,600/);
    }
  });

  it('the 37% bracket starts later for a single filer than a separate one', () => {
    expect(TOP_RATE_START_SINGLE).toBeGreaterThan(TOP_RATE_START_MFS);
    expect(usd(1234567.4)).toBe('$1,234,567');
  });

  it('no hand-typed copy of an exported figure is left in the prose', () => {
    for (const text of [guide, dict]) {
      expect(text).not.toMatch(/\$24,480|\$65,160|\$2,050|\$1,650 per|\$111,000|\$15,000,000|\$15M|\$70,100|\$90,100|\$384,350|\$640,600|\$19,000/);
    }
  });
});
