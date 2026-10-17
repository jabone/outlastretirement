// config/estateChecklist.js -- the estate paperwork tracker's data layer.
//
// The bug class worth guarding here is silent data loss. Ticks carry dates
// that a user may rely on a year later ("I checked beneficiaries in 2026"),
// so a rename, a bad merge, or a storage failure that quietly drops them is
// worse than a visible crash. These tests pin the storage contract and the
// toggle semantics; EstateChecklist.test.jsx covers the rendering.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CHECKLIST_CATEGORIES, ALL_CHECKLIST_ITEMS, CHECKLIST_ITEM_COUNT, CHECKLIST_STORAGE_KEY,
  readChecklistState, writeChecklistState, toggleChecklistItem, checklistProgress,
} from '../config/estateChecklist';

// Minimal in-memory localStorage so these run without jsdom.
function makeStorage(initial = {}) {
  const map = { ...initial };
  return {
    getItem: (k) => (k in map ? map[k] : null),
    setItem: (k, v) => { map[k] = String(v); },
    _map: map,
  };
}

describe('estate checklist data', () => {
  it('has unique item ids across every category', () => {
    const ids = ALL_CHECKLIST_ITEMS.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Titles are allowed to be short -- "A will" is the clearest possible
  // label for that item. What must never be empty is the `detail`, because
  // an item with no stated reason is just a chore.
  it('gives every item a title and a reason', () => {
    for (const item of ALL_CHECKLIST_ITEMS) {
      expect(item.title.trim().length, item.id).toBeGreaterThan(3);
      expect(item.detail.trim().length, item.id).toBeGreaterThan(40);
    }
  });

  it('keeps the flattened count in step with the categories', () => {
    const summed = CHECKLIST_CATEGORIES.reduce((n, c) => n + c.items.length, 0);
    expect(CHECKLIST_ITEM_COUNT).toBe(summed);
    expect(ALL_CHECKLIST_ITEMS).toHaveLength(summed);
  });

  // This list is prompts to go verify something, never instructions about
  // what to choose. If an item ever starts telling the reader what they
  // should do, that is a product decision to make deliberately, not one to
  // slip in through a copy edit.
  it('does not tell the reader what to decide', () => {
    for (const item of ALL_CHECKLIST_ITEMS) {
      expect(item.title, item.id).not.toMatch(/\byou should\b|\bwe recommend\b|\byou must\b/i);
    }
  });
});

describe('checklist storage', () => {
  let storage;
  beforeEach(() => { storage = makeStorage(); });

  it('returns an empty state when nothing is stored', () => {
    expect(readChecklistState(storage)).toEqual({});
  });

  it('round-trips a state through storage', () => {
    const state = { 'doc-will': { done: true, completedAt: '2026-08-20' } };
    expect(writeChecklistState(state, storage)).toBe(true);
    expect(readChecklistState(storage)).toEqual(state);
  });

  it('reads back what a different session wrote', () => {
    writeChecklistState({ 'doc-poa': { done: true, completedAt: '2026-01-02' } }, storage);
    const fresh = makeStorage({ [CHECKLIST_STORAGE_KEY]: storage.getItem(CHECKLIST_STORAGE_KEY) });
    expect(readChecklistState(fresh)['doc-poa'].completedAt).toBe('2026-01-02');
  });

  it('survives corrupt or unexpected stored values instead of throwing', () => {
    for (const bad of ['not json', '[]', 'null', '"a string"', '42']) {
      const s = makeStorage({ [CHECKLIST_STORAGE_KEY]: bad });
      expect(() => readChecklistState(s)).not.toThrow();
      expect(readChecklistState(s)).toEqual({});
    }
  });

  it('does not throw when storage itself is unavailable', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(readChecklistState(broken)).toEqual({});
    expect(writeChecklistState({ a: 1 }, broken)).toBe(false);
  });
});

describe('toggling', () => {
  it('stamps the date when ticked', () => {
    const s = toggleChecklistItem({}, 'doc-will', '2026-08-20');
    expect(s['doc-will']).toEqual({ done: true, completedAt: '2026-08-20' });
  });

  // Leaving a stale completedAt behind would make the next tick appear to
  // have happened on the old date.
  it('clears the entry entirely when unticked', () => {
    let s = toggleChecklistItem({}, 'doc-will', '2026-08-20');
    s = toggleChecklistItem(s, 'doc-will', '2026-09-01');
    expect(s['doc-will']).toBeUndefined();
    expect(Object.keys(s)).toHaveLength(0);
  });

  it('does not mutate the state it is given', () => {
    const before = {};
    const after = toggleChecklistItem(before, 'doc-will', '2026-08-20');
    expect(before).toEqual({});
    expect(after).not.toBe(before);
  });

  it('leaves other items alone', () => {
    let s = toggleChecklistItem({}, 'doc-will', '2026-08-20');
    s = toggleChecklistItem(s, 'doc-poa', '2026-08-21');
    s = toggleChecklistItem(s, 'doc-will', '2026-08-22');
    expect(s['doc-poa']).toEqual({ done: true, completedAt: '2026-08-21' });
  });
});

describe('progress', () => {
  it('counts only real items, ignoring ids that no longer exist', () => {
    const state = {
      [ALL_CHECKLIST_ITEMS[0].id]: { done: true, completedAt: '2026-08-20' },
      'an-item-that-was-renamed-away': { done: true, completedAt: '2020-01-01' },
    };
    expect(checklistProgress(state).done).toBe(1);
    expect(checklistProgress(state).total).toBe(CHECKLIST_ITEM_COUNT);
  });

  it('reports 0% empty and 100% full', () => {
    expect(checklistProgress({}).pct).toBe(0);
    const all = Object.fromEntries(ALL_CHECKLIST_ITEMS.map(i => [i.id, { done: true, completedAt: '2026-08-20' }]));
    expect(checklistProgress(all).pct).toBe(100);
  });
});
