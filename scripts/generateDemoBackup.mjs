// Regenerates outlastretirement_demo.json (the committed recording fixture)
// from src/config/demoPlan.js + src/utils/demoMode.js. Run with:
//   npx vite-node scripts/generateDemoBackup.mjs
// Re-run whenever demoPlan.js changes. Guarded by
// src/__tests__/demoBackupFixture.test.js, which deep-equals the committed
// file against what demoPlan.js builds today and fails until you re-run
// this. (An earlier version of this comment pointed at a shape test in
// demoMode.test.js that never existed, which is how the fixture drifted two
// commits behind through changelog 144.)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildLoadableDemoPayload } from '../src/utils/demoPayload';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const payload = buildLoadableDemoPayload();
const out = path.join(root, 'outlastretirement_demo.json');
fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n');
console.log(`Wrote ${out} (${fs.statSync(out).size} bytes, ${payload.savedScenarios.length} scenarios)`);
