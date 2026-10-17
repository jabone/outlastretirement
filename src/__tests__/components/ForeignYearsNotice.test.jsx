// @vitest-environment jsdom
//
// Changelog 196: the extra disclaimer for years abroad. The wording was
// approved by the owner on 2026-09-18 (RELOCATION_SPEC.md section 8.1a); these
// tests pin WHEN each line shows, and that domestic moves never trigger it.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ForeignYearsNotice from '../../components/ForeignYearsNotice.jsx';
import { foreignYearsNoticeLines } from '../../components/foreignYearsNoticeLines';
import ForeignYearsNoticeLoader from '../../components/ForeignYearsNoticeLoader.jsx';
import { hasYearsAbroad } from '../../components/hasYearsAbroad';
import { DEFAULT_INPUTS, planHorizonYear } from '../../calculator';

afterEach(cleanup);
const PLAN = DEFAULT_INPUTS.planYear;
const base = { ...DEFAULT_INPUTS, stateOfResidence: 'CA', stateTaxState: 'ca' };
const pt = (over = {}, foreign = {}) => ({
  id: 'pt', fromYear: PLAN + 7, kind: 'foreign', countryName: 'Portugal',
  foreign: { ordinaryRate: 25, roth: 'taxableAccount', ...foreign }, ...over,
});
const lines = (timeline) => foreignYearsNoticeLines({ ...base, residencyTimeline: timeline });
const texts = (n) => n.conditional.map((c) => c.text).join(' | ');

describe('the foreign-years disclaimer', () => {
  it('says nothing for a plan with no move abroad -- including domestic moves', () => {
    expect(lines([])).toBe(null);
    expect(lines([{ fromYear: PLAN + 3, stateOfResidence: 'TX' }])).toBe(null);
    render(<ForeignYearsNotice inputs={{ ...base, residencyTimeline: [{ fromYear: PLAN + 3, stateOfResidence: 'TX' }] }} />);
    expect(screen.queryByTestId('foreign-years-notice')).toBeNull();
  });

  it('names the year and the country the user entered, and always carries the US line', () => {
    const n = lines([pt()]);
    expect(n.title).toBe('Years abroad use your own figures.');
    expect(n.body).toMatch(`From ${PLAN + 7} this plan treats you as a resident of Portugal`);
    expect(n.body).toMatch('handles both US and Portugal tax');
    expect(n.always).toMatch('3.8% tax on investment income');
  });

  it('warns when the user says the Roth is respected, and only then', () => {
    expect(texts(lines([pt({}, { roth: 'respect' })]))).toMatch('does not tax your Roth');
    expect(texts(lines([pt({}, { roth: 'taxableAccount' })]))).not.toMatch('Roth');
    expect(texts(lines([pt({}, { roth: 'rate', rothRate: 10 })]))).not.toMatch('Roth');
  });

  it('warns that the old state keeps taxing, unless ties are cut or it has no income tax', () => {
    expect(texts(lines([pt()]))).toMatch('California can keep taxing a former resident');
    expect(texts(lines([pt({ stateDomicileSevered: true })]))).not.toMatch('California');
    expect(texts(lines([{ fromYear: PLAN + 2, stateOfResidence: 'TX' }, pt()]))).not.toMatch('keep taxing');
  });

  it('flags foreign inheritance tax when the plan ends abroad', () => {
    expect(texts(lines([pt()]))).toMatch('Foreign inheritance or estate tax is not included');
    expect(texts(lines([pt({}, { estateRate: 12 })]))).toMatch('your estimate of 12% of the estate');
    // Back in the US before the end: no estate line.
    const back = [pt(), { fromYear: planHorizonYear(base) - 2, stateOfResidence: 'TX' }];
    expect(texts(lines(back))).not.toMatch('inheritance');
  });

  it('renders as a note that cannot be dismissed', () => {
    render(<ForeignYearsNotice inputs={{ ...base, residencyTimeline: [pt()] }} />);
    const note = screen.getByTestId('foreign-years-notice');
    expect(note.getAttribute('role')).toBe('note');
    expect(note.querySelector('button')).toBeNull();
  });
});

// Changelog 197: the preset banner (also approved in 8.1a) and the lines
// that go with our country summaries.
describe('the disclaimer for a country summary', () => {
  const ours = (id, name, foreign = {}, over = {}) => ({
    id: id.toLowerCase(), fromYear: PLAN + 7, kind: 'foreign', countryName: name, stateDomicileSevered: true,
    foreign: { presetId: id, roth: 'respect', estateRate: 0, ...foreign }, ...over,
  });
  const NOW = new Date(2026, 8, 20);
  const linesAt = (timeline, now = NOW) => foreignYearsNoticeLines({ ...base, residencyTimeline: timeline }, now);

  it('uses the "estimates" banner, naming the month it was checked', () => {
    const n = linesAt([ours('PA', 'Panama')]);
    expect(n.title).toBe('Years abroad are estimates.');
    expect(n.body).toMatch(`From ${PLAN + 7} this plan treats you as a resident of Panama, using our summary of its rules, last checked September 2026.`);
    expect(n.body).toMatch('has not been reviewed by a cross-border tax professional');
    expect(n.always).toMatch('3.8%');
  });

  it('falls back to "your own figures" once the user edits our summary, and says so', () => {
    const n = linesAt([ours('PT', 'Portugal', { presetEdited: true, roth: 'earnings' })]);
    expect(n.title).toBe('Years abroad use your own figures.');
    expect(texts(n)).toMatch('You changed some of our Portugal figures');
  });

  it('falls back to "your own figures" when any move abroad is Custom Country', () => {
    const n = linesAt([ours('PA', 'Panama'), pt({ fromYear: PLAN + 12 })]);
    expect(n.title).toBe('Years abroad use your own figures.');
  });

  // The lines that come from a summary itself (our Roth answer, the
  // warning behind an assumption, our estate note) are snapshotted onto the
  // move as foreign.presetNotes when the relocation module adds it -- the
  // summaries are Premium and not in this app. The notice shows exactly
  // what was snapshotted; the Premium repo's tests pin what each summary
  // snapshots.
  it('uses our own Roth line when the move carries one, else the user\'s-answer warning', () => {
    const notes = { rothLine: 'Our Panama summary does not tax your Roth.', estateNote: null, estateKept: false, warnings: [] };
    expect(texts(linesAt([ours('PA', 'Panama', { presetNotes: notes })]))).toMatch('Our Panama summary does not tax your Roth');
    // No snapshot (a move added before it existed, or a summary with no
    // Roth answer the user kept): "respected" gets the warning.
    expect(texts(linesAt([ours('MX', 'Mexico', { roth: 'respect' })]))).toMatch('You told this plan Mexico does not tax your Roth');
    expect(texts(linesAt([ours('MX', 'Mexico', { roth: 'respect', presetNotes: { ...notes, rothLine: null } })]))).toMatch('You told this plan Mexico does not tax your Roth');
  });

  it('carries the warning behind each assumption the move switched on', () => {
    const warning = 'You applied Mexico’s pension exemption.';
    expect(texts(linesAt([ours('MX', 'Mexico', { roth: 'taxableAccount' })]))).not.toMatch('pension exemption');
    expect(texts(linesAt([ours('MX', 'Mexico', { roth: 'taxableAccount', presetNotes: { rothLine: null, estateNote: null, estateKept: false, warnings: [warning] } })]))).toMatch(warning);
  });

  it('gives the summary’s own estate line when the plan ends there and keeps our estate rules', () => {
    const notes = { rothLine: null, estateNote: 'Our Portugal summary finds no tax on US assets.', estateKept: true, warnings: [] };
    expect(texts(linesAt([ours('PT', 'Portugal', { roth: 'earnings', estateRate: null, presetNotes: notes })]))).toMatch('Our Portugal summary finds no tax on US assets');
    // A user figure replaces it with the estimate line.
    expect(texts(linesAt([ours('PT', 'Portugal', { roth: 'earnings', estateRate: 5, presetEdited: true, presetNotes: { ...notes, estateKept: false } })]))).toMatch('uses your estimate of 5%');
  });

  it('flags a summary more than 18 months old', () => {
    expect(texts(linesAt([ours('PA', 'Panama')]))).not.toMatch('may be out of date');
    expect(texts(linesAt([ours('PA', 'Panama')], new Date(2028, 3, 1)))).toMatch('last checked September 2026, more than 18 months ago');
  });

  // The Dashboard, Year by Year, Tax & Estate and the printable report load
  // the notice (and the country summaries behind it) only for a plan with a
  // year abroad (review 2026-09-30, H3).
  it('the loader shows the same notice for a plan abroad, and nothing otherwise', async () => {
    const home = { ...base, residencyTimeline: [{ fromYear: PLAN + 3, stateOfResidence: 'TX' }] };
    expect(hasYearsAbroad(home)).toBe(false);
    expect(foreignYearsNoticeLines(home)).toBe(null);
    const { container } = render(<ForeignYearsNoticeLoader inputs={home} />);
    expect(container.innerHTML).toBe('');
    cleanup();
    const abroad = { ...base, residencyTimeline: [pt()] };
    expect(hasYearsAbroad(abroad)).toBe(true);
    render(<ForeignYearsNoticeLoader inputs={abroad} />);
    const note = await screen.findByTestId('foreign-years-notice');
    expect(note.textContent).toMatch('From ' + (PLAN + 7) + ' this plan treats you as a resident of Portugal');
  });
});
