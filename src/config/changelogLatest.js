// The newest changelog entry's id, on its own so the app shell can ask
// "is there anything new?" without downloading the whole changelog (a
// ~460 kB chunk). changelog.js re-exports it, and changelogLatest.test.js
// fails whenever it is not the highest id in CHANGELOG -- bump it with
// every new entry.
export const LATEST_CHANGELOG_ID = 445;
