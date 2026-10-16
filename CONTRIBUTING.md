# Contributing

Thank you for looking. This is a small project with a particular shape, and
the shape matters more than the volume of code: every figure the app shows
is one the engine already produced, every tax rule has a source, and the
privacy promise is enforced in code rather than stated in copy.

## Before you start

- Read `DEVELOPMENT.md`. It is short and it is the rule book: the
  documentation checklist, American English, what a test has to do to count,
  how Premium and privacy are handled.
- For anything touching the engine, read the relevant specification first
  (`TAX_RULES_SPEC.md`, `SPENDING_RULES_SPEC.md`, `RETIREMENT_SPENDING_SPEC.md`,
  `RELOCATION_SPEC.md`) and `KNOWN_ISSUES.md`. They usually already say why
  the current shape is the current shape.
- A tax figure or rule needs a citation. `src/config/sources.js` is where
  sources live; `scripts/checkSources.mjs` checks them.

## What a change looks like

1. Open an issue first for anything beyond a small fix, so the direction can
   be agreed before the work.
2. Keep the engine pure: `src/calculator.js` takes inputs and returns a
   projection, with no React, no storage and no network.
3. Add or change tests with the code. A test that passes against a broken
   build is worse than none; `DEVELOPMENT.md` says what that means here.
4. Run `npm run lint` and the tests that cover what you touched, then the
   whole suite once before opening the pull request (`npx vitest run`; it is
   slow).
5. User-visible changes get a changelog entry (`src/config/changelog.js`) and
   follow the documentation checklist.
6. Commit subjects read `Area: what changed in plain English`.

## What is out of scope here

- The Premium modules. Their source is a separate, closed repository. The
  interface they are built against, `PREMIUM_MODULE_CONTRACT.md`, is in this
  one, and a change to the contract is welcome as a proposal.
- Anything that sends a user's plan anywhere. The privacy tests will fail,
  and they are right to.

## License

By contributing you agree that your contribution is licensed under the same
license as the project, the GNU Affero General Public License v3 (`LICENSE`).
