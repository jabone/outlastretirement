// Every drop-down in the app draws the same chevron. Plan -> Household showed
// the browser's own arrow on State of Residence beside the custom chevron on
// Filing Status, because the chevron hung off an opt-in class that half the
// selects lacked. The rule now keys on the element, and a select's own
// right padding never undercuts the room the chevron needs (Large Text
// grows it with the font).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const src = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(src, 'index.css'), 'utf8');

const jsxFiles = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  if (statSync(p).isDirectory()) return name === '__tests__' ? [] : jsxFiles(p);
  return p.endsWith('.jsx') ? [p] : [];
});

const selectTags = jsxFiles(src).flatMap((file) => {
  const text = readFileSync(file, 'utf8');
  // A JSX tag ends at the first '>' outside braces (an onChange arrow's
  // '=>' sits inside them).
  return [...text.matchAll(/<select\b/g)].map((m) => {
    let depth = 0;
    let i = m.index;
    for (; i < text.length; i++) {
      const c = text[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    return { file: file.slice(src.length + 1), tag: text.slice(m.index, i + 1) };
  });
});

const ruleFor = (selector) => {
  const re = new RegExp(`(^|[},\\s])${selector.replace(/[.[\]"=]/g, '\\$&')}\\s*(?:,[^{]*)?\\{([^}]*)\\}`, 'm');
  const m = css.match(re);
  return m ? m[2] : null;
};

describe('one select style', () => {
  it('styles every select.form-input with the custom chevron, in both themes', () => {
    const base = ruleFor('select.form-input');
    expect(base).toMatch(/appearance:\s*none/);
    expect(base).toMatch(/background-image:\s*url\("data:image\/svg\+xml/);
    expect(base).toMatch(/padding-right:\s*calc\(1\.25em/);
    expect(ruleFor('[data-theme="light"] select.form-input')).toMatch(/background-image:\s*url\("data:image\/svg\+xml/);
  });

  it('gives every select in the app the form-input class the rule keys on', () => {
    expect(selectTags.length).toBeGreaterThan(30);
    const missing = selectTags.filter(({ tag }) => !/className="[^"]*\bform-input\b/.test(tag)).map(({ file }) => file);
    expect(missing).toEqual([]);
  });

  it('never sets a fixed right padding the chevron could run into', () => {
    const offenders = selectTags.filter(({ tag }) => {
      const style = tag.match(/style=\{\{([\s\S]*?)\}\}/)?.[1] || '';
      if (/paddingRight:\s*'\d/.test(style)) return true;
      const pad = style.match(/padding:\s*'([^']*)'/)?.[1];
      if (!pad) return false;
      // One value, or a right value in plain px, undercuts the chevron.
      const parts = pad.match(/calc\([^)]*\)|\S+/g);
      return parts.length === 1 || /^\d/.test(parts[1]);
    }).map(({ file, tag }) => `${file}: ${tag.match(/style=\{\{[\s\S]*?\}\}/)?.[0]}`);
    expect(offenders).toEqual([]);
  });
});

describe('Year by Year row heights', () => {
  it('keeps a ledger cell and its inline markers on one line', () => {
    expect(ruleFor('.year-ledger-table td')).toMatch(/white-space:\s*nowrap/);
  });
});
