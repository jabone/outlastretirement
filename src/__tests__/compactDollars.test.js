// Axis and grid labels past a million (changelog 293).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { compactDollars, gridCompactDollars } from '../utils/compactDollars';

describe('compactDollars', () => {
  it('reads thousands as k and millions as M, never "$1000k"', () => {
    expect(compactDollars(0)).toBe('$0');
    expect(compactDollars(750)).toBe('$750');
    expect(compactDollars(750000)).toBe('$750k');
    expect(compactDollars(1000000)).toBe('$1M');
    expect(compactDollars(3019000)).toBe('$3.02M');
    expect(compactDollars(2500000)).toBe('$2.5M');
    expect(compactDollars(12_340_000)).toBe('$12.3M');
    expect(compactDollars(-45_000)).toBe('-$45k');
  });

  it('no component divides by 1000 and appends k by hand any more', () => {
    const dir = path.resolve(__dirname, '../components');
    const offenders = [];
    const walk = (d) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        if (f.isDirectory()) walk(p);
        else if (/\.jsx?$/.test(f.name) && /\/\s?1000\)\.toFixed\(0\)\}k/.test(fs.readFileSync(p, 'utf8'))) offenders.push(path.relative(dir, p));
      }
    };
    walk(dir);
    expect(offenders).toEqual([]);
  });
});

// One precision per grid: neighbors never differ in how many digits they show.

describe('gridCompactDollars', () => {
  it('prints every million-plus cell of a grid at the same precision', () => {
    const fmt = gridCompactDollars([2750000, 2800000, 3000000]);
    expect([2750000, 2800000, 3000000].map(fmt)).toEqual(['$2.75M', '$2.80M', '$3.00M']);
  });
  it('takes its digits from the largest cell', () => {
    const fmt = gridCompactDollars([6790000, 11100000]);
    expect([6790000, 11100000].map(fmt)).toEqual(['$6.8M', '$11.1M']);
  });
  it('leaves thousands in k', () => {
    expect(gridCompactDollars([500000, 2000000])(500000)).toBe('$500k');
  });
});
