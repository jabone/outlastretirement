export const getPossessive = (name) => {
  if (!name) return '';
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
};
