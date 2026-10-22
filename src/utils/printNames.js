// "Leave out names" for printed pages (changelog 298). Printing is for
// handing the plan to someone else -- a planner, an accountant -- and the
// person printing decides whether first names travel with it. Masks the
// spouses and the heirs; nothing else in the plan identifies anyone.
export const maskNames = (inputs) => ({
  ...inputs,
  spouse1Name: 'Spouse 1',
  spouse2Name: 'Spouse 2',
  heirs: Array.isArray(inputs?.heirs) ? inputs.heirs.map((h, i) => ({ ...h, name: `Heir ${i + 1}` })) : inputs?.heirs,
});

export const printInputsFor = (inputs, hideNames) => (hideNames ? maskNames(inputs) : inputs);

export const heirLabel = (heir, index, hideNames) => (hideNames ? `Heir ${index + 1}` : (heir?.name || `Heir ${index + 1}`));

// The same masking for free text the household wrote (the plan's three
// answers, a scenario's name): each spouse's and heir's name, as a whole
// word and in any case, becomes its label. Possessives follow ("Ray's" ->
// "Spouse 1's").
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function maskNamesInText(text, inputs, hideNames) {
  if (!hideNames || typeof text !== 'string' || !text) return text;
  const pairs = [
    [inputs?.spouse1Name, 'Spouse 1'],
    [inputs?.spouse2Name, 'Spouse 2'],
    ...(Array.isArray(inputs?.heirs) ? inputs.heirs.map((h, i) => [h?.name, `Heir ${i + 1}`]) : []),
  ].filter(([name]) => typeof name === 'string' && name.trim().length >= 2)
    // Longest first, so "Ann Marie" is masked before "Ann".
    .sort((a, b) => b[0].trim().length - a[0].trim().length);
  let out = text;
  for (const [name, label] of pairs) {
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(name.trim())}(?![\\p{L}\\p{N}])`, 'giu'), label);
  }
  return out;
}
