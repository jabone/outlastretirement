#!/usr/bin/env python3
"""Rebuild src/config/rmdJointLifeTable.js from IRS Publication 590-B.

Usage:
  pdftotext -f <first Table II page> -l <last Table II page> -layout p590b.pdf tableII.txt
  python3 scripts/parseJointLifeTable.py tableII.txt > src/config/rmdJointLifeTable.js

Table II (Joint and Last Survivor Life Expectancy) is printed as a square
matrix in ten-column blocks, each block headed "Ages 20 21 ... 29" and each
row starting with the row age. The script keeps every cell, checks the
matrix is symmetric, and emits only what the engine reads: owner ages 73 to
120, spouse ages 20 to owner - 11 (a spouse more than 10 years younger).
Run it again whenever the IRS republishes the tables.
"""
import re
import sys

lines = open(sys.argv[1], encoding='utf-8').read().split('\n')
table = {}
cols = None
for line in lines:
    s = line.strip()
    if 'Table III' in s:
        break
    m = re.match(r'^Ages\s+((?:\d+\+?\s*)+)$', s)
    if m:
        cols = [int(c.rstrip('+')) for c in m.group(1).split()]
        continue
    if cols is None:
        continue
    toks = s.split()
    if len(toks) == len(cols) + 1 and re.match(r'^\d+\+?$', toks[0]) and all(re.match(r'^\d+\.\d$', t) for t in toks[1:]):
        r = int(toks[0].rstrip('+'))
        for c, v in zip(cols, toks[1:]):
            table[(r, c)] = float(v)

def get(r, c):
    return table.get((r, c), table.get((c, r)))

for (r, c), v in table.items():
    if (c, r) in table and abs(table[(c, r)] - v) > 1e-9:
        sys.exit(f'asymmetric cell {r},{c}')
for r in range(73, 121):
    for c in range(20, r - 10):
        if get(r, c) is None:
            sys.exit(f'missing cell {r},{c}')

MIN = 20
print('// IRS Publication 590-B (2025), Appendix B, Table II (Joint and Last Survivor')
print('// Life Expectancy), the part the engine needs: for an IRA owner aged 73 to')
print('// 120 whose spouse is the sole beneficiary and more than 10 years younger,')
print('// the joint life expectancy for each spouse age from 20 up to owner - 11.')
print('// Parsed from the publication\'s own text by scripts/parseJointLifeTable.py')
print('// (changelog 416); every cell checked symmetric, and the owner / owner-10')
print('// diagonal reproduces Table III (the Uniform Lifetime Table), as the')
print('// regulations define it, at every age but 112, where the publication\'s own')
print('// two tables differ by a tenth (3.2 against 3.3). A spouse younger than 20')
print('// reads as 20; a gap of 10 years or less uses Table III (getRMDDivisor).')
print('//')
print('// JOINT_LIFE_TABLE_II[ownerAge][spouseAge - 20] = life expectancy.')
print(f'export const JOINT_LIFE_TABLE_II_SPOUSE_MIN_AGE = {MIN};')
print('export const JOINT_LIFE_TABLE_II = {')
for o in range(73, 121):
    vals = [get(o, s) for s in range(MIN, o - 10)]
    print(f'  {o}: [' + ', '.join(f'{v:.1f}' for v in vals) + '],')
print('};')
