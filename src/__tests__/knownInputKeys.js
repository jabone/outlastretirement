// sanitizeInputs() drops unknown input keys silently, so a test that sets a
// misspelled or invented key runs against the DEFAULT and passes while
// testing nothing (DEVELOPMENT.md, "Writing tests that actually test something").
// Call this on every plan object a test builds by hand: it throws, naming
// the keys, when any of them is not a real input.
import { DEFAULT_INPUTS } from '../calculator';

export function unknownInputKeys(obj) {
  return Object.keys(obj).filter((k) => !Object.prototype.hasOwnProperty.call(DEFAULT_INPUTS, k));
}

export function assertKnownInputKeys(obj) {
  const unknown = unknownInputKeys(obj);
  if (unknown.length) {
    throw new Error(`Not input keys (not in DEFAULT_INPUTS): ${unknown.join(', ')}`);
  }
  return obj;
}
