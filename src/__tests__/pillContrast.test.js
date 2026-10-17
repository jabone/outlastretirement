// Changelog 215: the selected filter pill was white text on cream.
//
// The rule this guards is narrow and mechanical: a CSS rule that declares
// `color` twice keeps the LAST one, so a duplicate silently throws away
// the color that was chosen for contrast. That is exactly what happened
// to `.month-filter-pill.active` -- `color: var(--or-navy)` followed by
// `color: #ffffff`, on a cream background, on every filter row in the app
// (the payout chart's months and quarters, and the Retirement Readiness
// "work N more years" choices).
//
// Nothing here measures contrast ratios; a duplicate declaration inside
// one rule is a mistake on its own terms, and that is cheap to check.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Comments stripped first: a rule that EXPLAINS the bug it fixed would
// otherwise fail the check against it.
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

// Every rule in the stylesheet, as { selector, body }.
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selector: m[1].trim().replace(/\s+/g, ' '),
  body: m[2],
}));

const declarations = (body, prop) => (body.match(new RegExp(`(^|;|\\n)\\s*${prop}\\s*:`, 'g')) || []).length;

describe('the selected filter pill', () => {
  const rule = rules.find((r) => r.selector.includes('.month-filter-pill.active'));

  it('exists, and sets one text color against its own background', () => {
    expect(rule, '.month-filter-pill.active is styled somewhere').toBeTruthy();
    expect(declarations(rule.body, 'color')).toBe(1);
    expect(rule.body).toMatch(/background:\s*var\(--or-paper\)/);
    // Cream background, so the text has to be the dark ink, never white.
    expect(rule.body).toMatch(/color:\s*var\(--or-navy\)/);
    expect(rule.body).not.toMatch(/color:\s*#fff/i);
  });
});

describe('no rule in the stylesheet sets the same color twice', () => {
  it('because the second one silently wins', () => {
    const offenders = rules
      .filter((r) => !r.selector.startsWith('@'))
      .filter((r) => declarations(r.body, 'color') > 1)
      .map((r) => r.selector);
    expect(offenders).toEqual([]);
  });
});

// Changelog 225: the amount box on a budget line clipped "10000" to
// "1000C". The browser's number spinner takes about twenty pixels of a
// field that has to hold six figures, and it is only removable from CSS --
// so this is the one place that can guard it.
describe('the budget line amount box', () => {
  it('hides the number spinner in both engines', () => {
    expect(css).toMatch(/\.amount-input\b[^}]*appearance:\s*textfield/);
    expect(css).toMatch(/\.amount-input::-webkit-(outer|inner)-spin-button[^}]*-webkit-appearance:\s*none/);
  });

  it('sets money right-aligned and in figures that line up', () => {
    const rule = css.slice(css.indexOf('.amount-input {'));
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/text-align:\s*right/);
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });
});

// Changelog 232: a wide table at a larger text size ran its last columns --
// the row's own actions, usually -- off the edge of the panel, with no way
// to reach them. The fix is one CSS class the tables are wrapped in, and
// CSS is the one place a component test cannot look.
describe('wide tables scroll rather than clip', () => {
  it('gives .table-scroll a horizontal scrollbar and a width it cannot exceed', () => {
    const rule = css.slice(css.indexOf('.table-scroll {'));
    const body = rule.slice(0, rule.indexOf('}'));
    expect(body).toMatch(/overflow-x:\s*auto/);
    expect(body).toMatch(/max-width:\s*100%/);
  });
});
