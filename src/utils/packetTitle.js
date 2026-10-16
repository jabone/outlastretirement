// The page header's title for the packet pages (changelog 333). It used to
// be the report's own title even when the report was not in the packet.
const PAGE_TITLES = { details: 'Plan Settings', accounts: 'Account Summary', spending: 'Spending Review', questions: 'For Your Planner', estate: 'Estate Documents Checklist', lifeplan: 'Life Plan' };
export function packetTitle(choices) {
  const pages = Object.keys(PAGE_TITLES).filter((k) => choices[k]);
  return pages.length === 1 ? PAGE_TITLES[pages[0]] : 'Retirement Planning Packet';
}
