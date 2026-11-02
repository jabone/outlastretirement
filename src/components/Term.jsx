import React from 'react';
import Tooltip from './Tooltip';
import { glossaryEntry } from '../config/glossary';

// A retirement word on screen, explained where it stands (first-time user
// review, round C): hover, tap or focus shows its plain-words definition
// from the glossary, with a link to the full entry under Help → What does
// this mean? An unknown id renders the words alone.
export default function Term({ id, children, position }) {
  const entry = glossaryEntry(id);
  if (!entry) return <>{children}</>;
  return (
    <Tooltip text={entry.plain} glossary={id} position={position}>
      {children}
    </Tooltip>
  );
}
