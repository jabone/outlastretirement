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
