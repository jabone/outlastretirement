// The last few results of a slow computation, by the plan they belong to
// (performance audit 2026-11-13). Undo, a scenario switch or toggling a
// setting back used to redo everything: about 4,700 projections in the
// heavy worker and 1,000 lifetimes of Monte Carlo, for a plan the app had
// just finished with. Both are deterministic (the Monte Carlo is seeded),
// so the remembered result is exactly what a new run would give.
//
// In memory only: nothing is written to the browser's storage, and a
// reload starts empty. The oldest entry goes first when full.
export function recentResults(limit = 4) {
  const map = new Map();
  return {
    get(key) {
      if (key == null || !map.has(key)) return undefined;
      const value = map.get(key);
      map.delete(key);
      map.set(key, value); // now the most recent
      return value;
    },
    set(key, value) {
      if (key == null || value == null) return;
      map.delete(key);
      map.set(key, value);
      while (map.size > limit) map.delete(map.keys().next().value);
    },
    get size() { return map.size; },
  };
}
