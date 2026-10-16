import { Skull, Feather, HeartPulse, Sailboat, Rocket, TreePalm, Landmark, MapPin, Plane, Flag } from 'lucide-react';

// Event markers are lucide icons drawn inside the chart's SVG (changelog
// 274) -- emoji rendered differently on every OS and could not follow the
// theme. A move abroad is a plane, a move between states a flag.
export const MARKER_ICONS = Object.freeze({
  survivor: Skull, lifeExpectancy: Feather, ltc: HeartPulse, coastFire: Sailboat, fiCrossover: Rocket,
  retirement: TreePalm, ssClaim: Landmark, milestone: MapPin, moveAbroad: Plane, moveState: Flag,
});
