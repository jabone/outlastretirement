// @vitest-environment jsdom
// The disclaimer footer is on every printout (changelog 333), wherever the
// print started, and the packet's header names what is in it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_CHOICES } from '../components/printPacketChoices';
import { packetTitle } from '../utils/packetTitle';
import { whenImagesReady } from '../utils/imagesReady';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(SRC, 'App.jsx'), 'utf8');

describe('print footer', () => {
  it('sits outside .app-container, which the packet and spending review hide when they print', () => {
    const footer = app.indexOf('<div className="print-disclaimer-footer">');
    expect(footer).toBeGreaterThan(-1);
    // Straight after the footer's own closing tag comes the context
    // provider's close: nothing of the app container wraps it.
    const after = app.slice(footer).replace(/^[\s\S]*?<\/div>/, '');
    expect(after.trimStart().startsWith('</SimulationContext.Provider>')).toBe(true);
    // And the container closed before it.
    expect(app.slice(footer - 400, footer)).toMatch(/<\/div>\s*\{\/\* Outside \.app-container/);
  });
});

describe('packet header title', () => {
  it('names the one page, or calls several a packet', () => {
    expect(packetTitle({ ...DEFAULT_CHOICES, report: true, estate: true })).toBe('Estate Documents Checklist');
    expect(packetTitle({ ...DEFAULT_CHOICES, estate: true, lifeplan: true })).toBe('Retirement Planning Packet');
    expect(packetTitle({ ...DEFAULT_CHOICES, spending: true })).toBe('Spending Review');
  });
});

describe('whenImagesReady', () => {
  it('waits for a loading image, and gives up after the timeout', async () => {
    const root = document.createElement('div');
    const img = document.createElement('img');
    Object.defineProperty(img, 'complete', { value: false });
    root.appendChild(img);
    let done = false;
    const p = whenImagesReady(root, 50).then(() => { done = true; });
    await new Promise((r) => setTimeout(r, 10));
    expect(done).toBe(false);
    img.dispatchEvent(new Event('load'));
    await p;
    expect(done).toBe(true);
    const img2 = document.createElement('img');
    Object.defineProperty(img2, 'complete', { value: false });
    const r2 = document.createElement('div'); r2.appendChild(img2);
    const t0 = Date.now(); await whenImagesReady(r2, 60);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(50);
  });
});

describe('report-only print', () => {
  it('mounts no packet sheet, so no empty header page follows the report', () => {
    const src = readFileSync(join(SRC, 'components', 'PrintPacket.jsx'), 'utf8');
    expect(src).toMatch(/\{printing && OPTIONS\.some\(\(o\) => o\.id !== 'report' && printing\[o\.id\]\) && createPortal\(/);
  });
});

