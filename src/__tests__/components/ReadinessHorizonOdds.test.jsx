// @vitest-environment jsdom
//
// U14: the Readiness intro, the spend-to-zero life-table rows and the
// printed report stated the plan's horizon three ways on the demo plan:
// "age 92 for Sam and 94 for Riley" beside a 2063 row "(age 92 / 95)", a
// 28% chance someone is here in 2063 beside 2063 labeled "25% still here",
// and Riley at 13% on screen but 11% in print.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ReadinessTab from '../../components/tabs/ReadinessTab';
import { renderWithSimulation } from '../testUtils';
import { DEFAULT_INPUTS, runProjection, dieWithZeroByLongevity } from '../../calculator';
import { buildDemoInputs } from '../../config/demoPlan';
import { planHorizon } from '../../utils/retirementReadiness';
import { probAliveAt } from '../../utils/mortality';

afterEach(cleanup);
const demo = { ...DEFAULT_INPUTS, ...buildDemoInputs() };
const projection = runProjection(demo);
const longevity = dieWithZeroByLongevity(demo);
const pct = (x) => `${Math.round(x * 100)}%`;

describe('one horizon, stated the same way everywhere', () => {
  const h = planHorizon(demo, projection);

  it('says whose plan ends when', () => {
    expect(h.lastYear).toBe(projection.years[projection.years.length - 1].year);
    const [sam, riley] = h.people;
    expect(sam.name).toBe('Sam');
    expect(sam.endYear).toBe(h.lastYear);
    // Riley's plan ends a year before the household's.
    expect(riley.endYear).toBe(demo.birthYear2 + demo.lifeExpectancy2);
    expect(riley.endYear).toBeLessThan(h.lastYear);
    // Each person's odds are of reaching their own planned age.
    expect(riley.reachPlanTo).toBe(probAliveAt(demo.sex2, riley.age, demo.lifeExpectancy2));
  });

  it('the intro names each person’s own end year and the odds the print uses', () => {
    renderWithSimulation(<ReadinessTab />, { inputs: demo, projection, setActiveTab: vi.fn(), dieWithZeroLongevityData: longevity }, { isPremium: false });
    const intro = screen.getByTestId('horizon-card').textContent.replace(/\s+/g, ' ');
    const [sam, riley] = h.people;
    expect(intro).toContain(`Sam to age ${demo.lifeExpectancy1} (${sam.endYear})`);
    expect(intro).toContain(`Riley to age ${demo.lifeExpectancy2} (${riley.endYear})`);
    expect(intro).toContain(`has a ${pct(riley.reachPlanTo)} chance of reaching ${demo.lifeExpectancy2}`);
    expect(intro).toContain(`still here in ${h.lastYear}, when the plan ends, is ${pct(h.anyAliveAtEnd)}`);
  });

  it('the life-table rows state their ages, and the one-in-four row agrees with the intro', () => {
    renderWithSimulation(<ReadinessTab />, { inputs: demo, projection, setActiveTab: vi.fn(), dieWithZeroLongevityData: longevity }, { isPremium: false });
    const table = screen.getByTestId('spending-ceiling').textContent.replace(/\s+/g, ' ');
    expect(table).toContain(`${longevity.planned.endYear} (age ${demo.lifeExpectancy1} / ${demo.lifeExpectancy2})`);
    const quarter = longevity.levels.find((l) => l.id === 'oneInFour');
    expect(quarter.endYear).toBe(h.lastYear);
    expect(table).toContain('(at least 25% still here)');
    expect(table).not.toMatch(/\(25% still here\)/);
    // The intro's figure for that same year is at least the row's level.
    expect(h.anyAliveAtEnd).toBeGreaterThanOrEqual(quarter.prob);
    expect(table).toMatch(/can still differ from it: your plan has one of you leaving it earlier/);
  });

  it('the printed report reads the same helper, not its own odds', () => {
    const app = readFileSync(path.resolve(__dirname, '../../App.jsx'), 'utf8');
    expect(app).toMatch(/const horizon = planHorizon\(inputs, projection\);/);
    expect(app).toMatch(/pctOf\(b\.reachPlanTo\)/);
    expect(app).not.toMatch(/chance of being alive then/);
    expect(app).not.toMatch(/probAliveAt\(/);
  });
});
