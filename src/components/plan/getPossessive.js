// An unnamed first person is "Primary" in the data; on screen they are the
// reader, so the label reads "Your Birth Year", not "Primary's Birth Year"
// (novice review 2026-11-01).
export const getPossessive = (name) => {
  if (!name) return '';
  if (name === 'Primary') return 'Your';
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
};
