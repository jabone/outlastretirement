// The host publishes a named list of icons to Premium modules, not all of
// lucide-react (which put every icon in the startup download). These pin
// the list to what the built Premium modules actually use.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as lucide from 'lucide-react';
import * as hostIcons from '../premium/hostIcons';
import { HOST_PACKAGES } from '../premium/hostLib';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('icons published to Premium modules', () => {
  it('publishes the named list, each a real lucide icon', () => {
    const names = Object.keys(hostIcons);
    expect(names.length).toBeGreaterThan(30);
    expect(names.length).toBeLessThan(80);
    for (const n of names) expect(hostIcons[n], n).toBe(lucide[n]);
    expect(HOST_PACKAGES['lucide-react']).toBe(hostIcons);
  });

  it('covers every icon the built Premium modules use', () => {
    const used = new Set();
    for (const f of readdirSync(FIXTURES).filter((n) => n.endsWith('.built.js'))) {
      const src = readFileSync(join(FIXTURES, f), 'utf8');
      // The Premium build checks each host import by name at load time.
      for (const m of src.matchAll(/host lib \\"lucide-react\\" has no export \\"(\w+)\\"/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(10);
    expect([...used].filter((n) => !(n in hostIcons))).toEqual([]);
  });
});
