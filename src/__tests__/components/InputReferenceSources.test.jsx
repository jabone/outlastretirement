// @vitest-environment jsdom
//
// Rendering half of the methodology-sources work; the data-shape half lives
// in src/__tests__/sources.test.js, which needs no DOM and runs in the
// default node environment. Split because JSX only gets transformed in
// .jsx files -- a .js test file containing JSX fails to parse outright.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import InputReference from '../../components/InputReference';
import { SOURCES } from '../../config/sources';

describe('sources rendering', () => {
  it('renders every source as a safely-opened external link', () => {
    render(<InputReference />);
    expect(screen.getByRole('heading', { name: /Where these figures come from/i })).toBeInTheDocument();

    for (const src of SOURCES) {
      expect(screen.getByText(src.label)).toBeInTheDocument();
    }
    const hrefs = SOURCES.map((s) => s.url);
    const rendered = screen.getAllByRole('link').filter((a) => hrefs.includes(a.getAttribute('href')));
    expect(rendered).toHaveLength(SOURCES.length);
    for (const a of rendered) {
      expect(a).toHaveAttribute('target', '_blank');
      expect(a.getAttribute('rel')).toContain('noopener');
    }
    // One getByText per source over the whole Dictionary: slow on a busy
    // machine once the list passed sixty rows.
  }, 60000);

  it('shows the uncited list, so the coverage does not read as complete', () => {
    render(<InputReference />);
    expect(screen.getByText(/Not yet cited/i)).toBeInTheDocument();
  });
});
