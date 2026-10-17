// Review 2026-09-30 (H13): Capacitor's webDir was 'dist', whose index.html
// is the marketing page, so the native app opened on the brochure.
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareMobileWeb } from '../../scripts/prepareMobileWeb.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mobileweb-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('prepareMobileWeb', () => {
  it('makes the app the entry page, keeps the assets, and drops the service worker', () => {
    const dist = path.join(tmp, 'dist');
    fs.mkdirSync(path.join(dist, 'app'), { recursive: true });
    fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), '<title>landing</title>');
    fs.writeFileSync(path.join(dist, 'app', 'index.html'), '<script type="module" src="/assets/app-x.js"></script>');
    fs.writeFileSync(path.join(dist, 'assets', 'app-x.js'), '');
    fs.writeFileSync(path.join(dist, 'terms.html'), 'terms');
    fs.writeFileSync(path.join(dist, 'sw.js'), '');
    fs.writeFileSync(path.join(dist, 'workbox-abc.js'), '');
    const out = prepareMobileWeb(dist, path.join(tmp, 'dist-mobile'));
    expect(fs.readFileSync(path.join(out, 'index.html'), 'utf8')).toContain('/assets/app-x.js');
    expect(fs.existsSync(path.join(out, 'assets', 'app-x.js'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'terms.html'))).toBe(true);
    expect(fs.existsSync(path.join(out, 'sw.js'))).toBe(false);
    expect(fs.existsSync(path.join(out, 'workbox-abc.js'))).toBe(false);
  });
  it('capacitor.config.json loads that folder, under the product name, with the store id unchanged', () => {
    const cfg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../capacitor.config.json'), 'utf8'));
    expect(cfg.webDir).toBe('dist-mobile');
    expect(cfg.appName).toBe('OutlastRetirement');
    expect(cfg.appId).toBe('com.jabone.retireplan');
  });
});
