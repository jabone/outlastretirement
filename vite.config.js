import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const __dirname = dirname(fileURLToPath(import.meta.url))

// The Content-Security-Policy also ships INSIDE the app page as a <meta>
// (S6). vercel.json's header covers the hosted site, but a copy served any
// other way -- the Capacitor apps, a mirror, a local `vite preview` -- had
// no policy at all. The meta is built from vercel.json's header so the two
// cannot drift; frame-ancestors is dropped because browsers ignore it in a
// meta tag (the header keeps it). Production builds only: the dev server
// injects an inline React-refresh script that script-src 'self' would block.
export function cspMetaContent() {
  const vercel = JSON.parse(readFileSync(resolve(__dirname, 'vercel.json'), 'utf8'))
  const rule = (vercel.headers || []).find((h) => h.source === '/(.*)')
  const header = rule && rule.headers.find((h) => h.key.toLowerCase() === 'content-security-policy')
  if (!header) throw new Error('vercel.json has no Content-Security-Policy header to mirror')
  return header.value.split(';').map((d) => d.trim()).filter((d) => d && !d.startsWith('frame-ancestors')).join('; ')
}
const cspMeta = {
  name: 'outlast-csp-meta',
  apply: 'build',
  transformIndexHtml: {
    order: 'pre',
    handler(html, ctx) {
      if (!/[\\/]app[\\/]index\.html$/.test(ctx.filename || '')) return html
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${cspMetaContent()}" />`)
    },
  },
}

// The landing page's three small stylesheets (tokens, theme, fonts: about
// 7 KB together) each cost a render-blocking request (PageSpeed, 2026-10-07).
// The built page carries them inline instead. index.html keeps the <link>
// tags, so the source and the other static pages still share the files;
// style-src already allows inline styles. Production builds only.
export function inlineLandingCss(html) {
  return html.replace(/<link rel="stylesheet" href="\/(brand\/[\w.-]+\.css)" \/>/g, (tag, file) => {
    const css = readFileSync(resolve(__dirname, 'public', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*\n/g, '\n').trim()
    return `<style data-from="/${file}">\n${css}\n</style>`
  })
}
const landingCss = {
  name: 'outlast-landing-css',
  apply: 'build',
  transformIndexHtml: {
    order: 'pre',
    handler(html, ctx) {
      if (/[\\/]app[\\/]index\.html$/.test(ctx.filename || '')) return html
      return inlineLandingCss(html)
    },
  },
}

// The brand marks the app itself shows (utils/brandMarkProps.js), precached
// on their own because the rest of public/brand is the marketing page's.
const BRAND_MARKS = ['outlast-full-dark', 'outlast-full-light', 'or-short-dark', 'or-short-light']
  .flatMap((n) => [`/brand/${n}-h96.png`, `/brand/${n}.png`])
// Revision for those unhashed files: the combined content, so the service
// worker re-fetches them when one changes.
const BRAND_MARK_REVISION = createHash('md5')
  .update(BRAND_MARKS.map((u) => readFileSync(resolve(__dirname, 'public' + u))).reduce((a, b) => Buffer.concat([a, b]), Buffer.alloc(0)))
  .digest('hex').slice(0, 12)

const BUILD_DATE = new Date().toISOString().slice(0, 10)
const BUILD_ID = (() => {
  // Vercel exposes the commit being built; locally, ask git.
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)
  }
})()

// https://vite.dev/config/
export default defineConfig({
  // `@host/...` is how a Premium module names host code it is allowed to
  // use (PREMIUM_MODULE_CONTRACT.md 2.8). Here, inside the host repo, it is
  // simply this tree; in the Premium repo the same specifier resolves to
  // window.__OR_HOST__ at build time, so module source is identical in both.
  resolve: {
    alias: [
      { find: /^@host\/scripts\//, replacement: resolve(__dirname, 'scripts') + '/' },
      { find: /^@host\//, replacement: resolve(__dirname, 'src') + '/' },
    ],
  },
  // Two pages, not one. `/` is a static marketing page a cold visitor can
  // read without downloading the calculator; `/app` is the application.
  // Before this, the domain served the SPA directly, so the only pitch a
  // first-time visitor got was the <meta description>.
  build: {
    rolldownOptions: {
      input: {
        landing: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app/index.html'),
      },
      output: {
        // Stable vendor chunks: their content (and so their hashed file
        // names) only changes when a dependency is upgraded, so an ordinary
        // deploy leaves them in every visitor's HTTP and service-worker
        // cache instead of re-downloading React and the chart library.
        // pdfjs-dist already has its own chunk (it is imported dynamically).
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 20 },
            { name: 'vendor-charts', test: /[\\/]node_modules[\\/](recharts|d3-[a-z-]+|victory-vendor|internmap)[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  // Shown in Preferences so a support question can name the exact build:
  // the short git commit when there is one, else the build time.
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __BUILD_DATE__: JSON.stringify(BUILD_DATE),
  },
  plugins: [
    react(),
    cspMeta,
    landingCss,
    // PWA / offline support (changelog 115). The whole point is the
    // privacy demonstration: after one visit, every asset the free app uses
    // -- including the lazy tab and chart chunks that used to 404 offline --
    // is precached by a service worker, so the app keeps working with the
    // network off, through hard refreshes, and days later. The Premium-only
    // PDF reader and Detailed Holdings chunks are cached on first use
    // instead (see runtimeCaching below). registerType 'prompt' means
    // Deploy note, since it has nowhere else to live (vercel.json takes no
    // comments): /app is served by an explicit REWRITE in vercel.json, not
    // by cleanUrls. cleanUrls would answer /app/index.html with a redirect
    // to /app -- and that exact URL is a precache entry below, which
    // Workbox treats as a failed precache when the response is redirected.
    // That would break offline for everyone, so the rewrite serves the file
    // at both spellings with no redirect anywhere in the path.
    //
    // a new deploy does NOT silently replace running code: the waiting
    // worker sits until the user accepts the UpdateToast (or closes every
    // tab), which matters for a tax app that ships figure corrections --
    // users must be nudged onto new versions, never stranded, hence the
    // toast in src/components/UpdateToast.jsx. Registration itself lives
    // in src/utils/pwa.js (dynamic import so vitest never resolves the
    // virtual module).
    VitePWA({
      registerType: 'prompt',
      // Everything the app can ever load must be in the precache manifest,
      // or the airplane-mode test fails exactly where it used to: on the
      // first visit to a lazily-loaded chunk. jpg included for the social
      // icon; woff2 for any future self-hosted font; mjs for the PDF.js
      // worker, without which statement import failed offline.
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,jpg,svg,woff2}'],
        // What every visitor does NOT need stored for offline use (review
        // 2026-09-30, H12 / S10):
        // - The marketing side's documents and scripts. The worker's
        //   navigation fallback only answers /app, but a precached
        //   terms.html was still served from the cache for /terms (Workbox
        //   maps clean URLs onto precached .html files), so an installed
        //   user read the Terms as they were at install time. The marketing
        //   pages come fresh from the CDN, and offline they are not needed.
        // - brand/: the marketing page's fonts (duplicates of the app's own
        //   bundled copies), its stylesheets, screenshots and social image.
        //   The app's own brand marks stay (the sidebar and print header
        //   show them), re-included through the list below.
        // - Unreferenced icons (icons.svg, icon-1024.jpg).
        // - The PDF reader and Detailed Holdings: Premium-only, 1.9 MB
        //   together. They are cached on first use instead (runtimeCaching).
        // Paths are relative to the build output, so app/index.html stays.
        globIgnores: [
          'index.html', '404.html', 'privacy.html', 'verify.html', 'terms.html', 'premium.html', 'accessibility.html', 'changelog.html', 'how-the-math-works.html', 'pricing-script.html',
          // The Learn lessons are the website's, read online: never stored.
          'learn.html', 'learn/**',
          'home-installed.js', 'home-returning.js', 'pricing-script.js', 'mailto-fallback.js',
          'brand/**',
          'icons.svg', 'icon-1024.jpg',
          'assets/pdf-*.js', 'assets/pdf.worker*', 'assets/PortfolioTab-*.js',
        ],
        additionalManifestEntries: BRAND_MARKS.map((url) => ({ url, revision: BRAND_MARK_REVISION })),
        // Headroom over the largest chunk; a silently skipped chunk would
        // break offline for that tab.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Vercel Analytics / Speed Insights beacons are external and
        // optional -- never intercept or cache them.
        navigateFallbackDenylist: [/^\/_vercel\//],
        // The service worker's job is the APP, which must work offline.
        // The worker is registered at /sw.js, so its scope is the whole
        // origin, but only /app navigations fall back to the app shell: a
        // cached brochure is worth nothing offline, and letting the
        // fallback answer for '/' would serve the app shell to someone who
        // asked for the landing page (or the Terms).
        navigateFallback: '/app/index.html',
        navigateFallbackAllowlist: [/^\/app/],
        // The chunks left out of the precache above, cached the first time
        // they load so they then work offline too. Their names carry a
        // content hash, so a cached copy never goes stale; old versions age
        // out.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && /^\/assets\/(pdf-[^/]+\.js|pdf\.worker[^/]*|PortfolioTab-[^/]+\.js)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'on-demand-chunks',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 90 },
            },
          },
        ],
      },
      manifest: {
        name: 'OutlastRetirement',
        short_name: 'OutlastRetirement',
        description: 'Local-first retirement education. Your numbers never leave your device.',
        theme_color: '#0F2744',
        background_color: '#0F2744',
        display: 'standalone',
        // Installed copies open the app, not the marketing page. Anyone who
        // installed before this change still has '/' baked into their
        // install, which is why the landing page redirects standalone
        // launches to /app rather than showing them a pitch for software
        // they already use.
        start_url: '/app',
        scope: '/app',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    exclude: ['node_modules', 'tests/e2e/**'],
    // Default stays 'node' -- the existing calculator.js/actionPlan.js tests
    // are pure-function tests with no DOM, and 'node' is faster / has less
    // startup overhead per file than spinning up a jsdom document for each
    // of them. Component tests (see UI_TEST_COVERAGE_PLAN.md) live under
    // src/__tests__/components/ and opt into jsdom via the glob below,
    // rather than paying the jsdom cost globally.
    environment: 'node',
    environmentMatchGlobs: [
      ['src/__tests__/components/**', 'jsdom'],
    ],
    // @testing-library/jest-dom's matchers (toBeInTheDocument, etc.) are
    // just expect() extensions -- safe to load in every test file,
    // including the node-environment ones, since they only touch `document`
    // when a matcher actually runs against a DOM node.
    setupFiles: ['./src/__tests__/setupTests.js'],
    // A few tests run several full Monte Carlos (1,000 trials each) and
    // take 3-4 s here; on a loaded CI runner they crossed vitest's 5 s
    // default and failed a release for nothing. 20 s is still a hang
    // detector, not a budget.
    testTimeout: 20000,
  },
})
