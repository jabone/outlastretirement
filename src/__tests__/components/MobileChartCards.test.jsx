// Phone layout guards from John's Detailed Holdings screenshots (changelog 295).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '../..', rel), 'utf8');
const phoneCss = () => { const css = read('index.css'); return css.slice(css.indexOf('@media screen and (max-width: 768px)')); };

describe('phone: nothing drags the page sideways', () => {
  it('the content area clips sideways (its overflow-y: auto would otherwise make it scroll sideways)', () => {
    expect(phoneCss()).toMatch(/\.main-content \{\s*overflow-x: hidden;/);
  });

  it('every chart hover card is capped to the chart width on a phone', () => {
    expect(phoneCss()).toMatch(/\.recharts-tooltip-wrapper > \* \{[^}]*max-width: calc\(100vw - 72px\) !important;[^}]*min-width: 0 !important;/);
  });

  it('every row of sub-tab buttons sits in the scrolling tab row', () => {
    const dir = path.resolve(__dirname, '../../components');
    const bad = [];
    const walk = (d) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, f.name);
        if (f.isDirectory()) { walk(p); continue; }
        if (!/\.jsx$/.test(f.name)) continue;
        const src = fs.readFileSync(p, 'utf8');
        // A .map() that renders sub-tab buttons must be inside a sub-tab-container.
        for (const m of src.matchAll(/\{[A-Z_]+\.map\(\(\w+\) => \(\s*<button[^>]*sub-tab-button/g)) {
          const before = src.slice(Math.max(0, m.index - 600), m.index);
          const lastDiv = before.lastIndexOf('<div');
          if (!before.slice(lastDiv).includes('sub-tab-container')) bad.push(path.relative(dir, p));
        }
      }
    };
    walk(dir);
    expect(bad).toEqual([]);
  });
});
