import React from 'react';

// The items are authored with markdown-style **bold** spans. They used to
// be rendered as raw text, asterisks and all; this renders them as real
// bold. Only ** is supported on purpose -- entries are plain sentences
// with occasional emphasis, not markdown documents.
export const renderBold = (text) => {
  const parts = String(text).split('**');
  if (parts.length < 3) return text;
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i} style={{ color: 'var(--text-primary)' }}>{part}</strong> : part));
};
