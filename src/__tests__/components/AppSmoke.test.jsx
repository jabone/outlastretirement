// @vitest-environment jsdom
//
// The whole app mounts (changelog 277 follow-up). Every other component
// test renders one tab inside a stubbed context, so a mistake in App.jsx
// itself -- a const read before its declaration, which the build turns
// into "Cannot access 'K' before initialization" -- reached production
// without a single test failing. This mounts the real App with an empty
// browser and checks it drew something rather than the error boundary.
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import App from '../../App';

afterEach(cleanup);

describe('App', () => {
  // Full-App cold mount: see KpiCompact.test.jsx on the timeout.
  it('mounts on a fresh browser without tripping the error boundary', { timeout: 60000 }, async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<App />);
      await new Promise((r) => setTimeout(r, 300));
      const text = document.body.textContent;
      expect(text).not.toMatch(/Something went wrong here/);
      expect(text).not.toMatch(/before initialization/);
      expect(text.length).toBeGreaterThan(200);
      const tdz = errors.mock.calls.flat().map(String).filter((m) => /before initialization/.test(m));
      expect(tdz).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });
});
