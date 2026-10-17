import { readResidencyTimeline, planWideResidence } from '../calculator';

export function hasYearsAbroad(inputs) {
  return readResidencyTimeline(inputs.residencyTimeline, planWideResidence(inputs)).some((m) => m.kind === 'foreign');
}
