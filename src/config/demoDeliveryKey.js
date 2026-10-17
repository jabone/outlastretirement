// The demo delivery key: how Demo Mode shows the read-only Detailed
// Holdings view to a visitor who has no Premium key.
//
// Since the open-core split a Premium module only arrives from
// premium.outlastretirement.com, which serves it to a valid key. The demo
// (`/app/#/demo`) promises a read-only look at Detailed Holdings with the
// fictional household's lots, so the app carries this one key for that
// purpose. It is NOT a Premium key: its claims are `{ demo: true }` and an
// expiry, never `premium: true`, so pasting it into Preferences unlocks
// nothing (utils/premiumJwt.js requires `premium: true`), and the module
// server hands out only the areas listed in DEMO_AREAS to it. What it
// exposes is the holdings module's code, which any Premium holder receives
// anyway; it exposes no entitlement and no data.
//
// The app sends it only while Demo Mode is on and no valid Premium key is
// present (host.entitlement.preview). A Premium user in the demo uses their
// own key as everywhere else.
//
// Minted with `node scripts/mint-premium-jwt.mjs --demo` (OPERATIONS.md);
// this one on 2026-10-16, signed by k1, expiring 2036-10-14. null would
// make the demo show the locked card on the holdings tab instead.
export const DEMO_DELIVERY_KEY = 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImsxIn0.eyJkZW1vIjp0cnVlLCJleHAiOjIxMDc1NTUyMDB9.g46PQaGNq8KeDmGhXs7uISNMti6RbaGNrqq4x3ZZGLZPvKjSLd4J_-QRSQ4k284oSAmMkqLw-zBhCTGGPmMvtCmciUDXpqZ3_Thxn_lwCFCfJcFxOejmj97WfHr5iK0aKv2hS92nvDANDI3w58B97zYjv7Fi6DqeD6PgmZvg0siKk-fDM-vQUoBDkVn7CrtuvhHuiugd32IjD9skA0SPKFqZ5FG_ua-ApqkC2NytqSXRhrTEzl7Bm0MaHsf6JGHd0jkut8iJZBFNphPS_Appf6p-wZ_MglPwEwogkYP_r89fcMfxGRKbVyEyYekWyD_tF6QbJrkDbJJsDbZA5VI1Ig';

// The Premium areas the demo may load with the delivery key. The module
// server enforces the same list; adding one here without the server does
// nothing.
export const DEMO_AREAS = ['holdings'];
