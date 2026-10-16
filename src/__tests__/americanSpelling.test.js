// The app is written in American English (John, 2026-09-24, after "Enrol at
// 65" shipped in a Medicare setting). Changelog 246 converted the British
// spellings that had built up -- colour, grey, cheque, recognise, modelled,
// licence and the rest -- and this keeps new ones out. It scans every file a
// user can read text from: the app's source (strings and comments alike, so
// nothing needs judging) and the public pages.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const BRITISH = [
  'colour', 'colours', 'coloured', 'colouring', 'grey', 'greys', 'greyed', 'cheque', 'cheques',
  'recognise', 'recognised', 'recognises', 'recognising', 'organise', 'organised', 'organises', 'organising',
  'organisation', 'organisations', 'favour', 'favours', 'favourite', 'favoured', 'favourable',
  'behaviour', 'behaviours', 'centre', 'centres', 'centred', 'licence', 'licences', 'labelled', 'labelling',
  'travelled', 'travelling', 'traveller', 'travellers', 'modelled', 'modelling', 'cancelled', 'cancelling',
  'analyse', 'analysed', 'analysing', 'programme', 'programmes', 'defence', 'realise', 'realised', 'realises',
  'realising', 'penalise', 'penalised', 'penalises', 'finalise', 'finalised', 'judgement', 'judgements',
  'acknowledgement', 'acknowledgements', 'instalment', 'instalments', 'enrol', 'enrols', 'enrolment', 'enrolments',
];
// Found by the 2026-09-30 copy review. Checked everywhere except the two
// files other hands own right now (the changelog, and the engine's
// comments); the lead drops this exemption once those are converted.
const BRITISH_2 = [
  'unrecognised', 'categorisation', 'categorise', 'categorised', 'paycheque', 'paycheques', 'unlabelled',
  'mislabelled', 'honour', 'honours', 'honoured', 'honouring', 'itemise', 'itemises', 'itemised', 'itemising',
  'neighbour', 'neighbours', 'neighbourhood',
];
const pattern2 = new RegExp(`\\b(${BRITISH_2.join('|')})\\b`, 'gi');
const EXEMPT_2 = ['src/config/changelog.js', 'src/calculator.js'];
const pattern = new RegExp(`\\b(${BRITISH.join('|')})\\b`, 'gi');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === '__tests__' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(jsx?|html|css)$/.test(name)) out.push(p);
  }
  return out;
}

describe('the app is spelled in American English', () => {
  const files = [...walk(join(root, 'src')), ...walk(join(root, 'public')), join(root, 'index.html')];

  it('scans the source and the public pages', () => {
    expect(files.some((f) => f.endsWith('changelog.js'))).toBe(true);
    expect(files.some((f) => f.endsWith('terms.html'))).toBe(true);
    expect(files.length).toBeGreaterThan(100);
  });

  it('has no British spellings in them', () => {
    const found = [];
    for (const f of files) {
      const lines = readFileSync(f, 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const m of line.matchAll(pattern)) found.push(`${relative(root, f)}:${i + 1} ${m[0]}`);
      });
    }
    expect(found).toEqual([]);
  });

  it('has none of the spellings the copy review found either', () => {
    const found = [];
    for (const f of files) {
      if (EXEMPT_2.includes(relative(root, f))) continue;
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        for (const m of line.matchAll(pattern2)) found.push(`${relative(root, f)}:${i + 1} ${m[0]}`);
      });
    }
    expect(found).toEqual([]);
  });
});
