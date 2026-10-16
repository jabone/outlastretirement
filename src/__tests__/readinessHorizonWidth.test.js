// The "How long the plan has to last" card spans the page like the question
// cards below it (changelog 334).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'components', 'tabs', 'ReadinessTab.jsx'), 'utf8');

describe('Readiness horizon card', () => {
  it('has no narrower max width than the cards under it', () => {
    const line = src.split('\n').find((l) => l.includes('data-testid="horizon-card"'));
    expect(line).toBeTruthy();
    expect(line).not.toMatch(/maxWidth/);
  });

  it('the intro and closing lines are full width too, and the intro leaves room before the first card', () => {
    const intro = src.split('\n').find((l) => l.includes('data-testid="readiness-intro"'));
    const outro = src.split('\n').find((l) => l.includes('data-testid="readiness-outro"'));
    expect(intro).not.toMatch(/maxWidth/);
    expect(intro).toMatch(/marginBottom: '14px'/);
    expect(outro).not.toMatch(/maxWidth/);
  });
});
