// Optional per-entry background tones for a broadcast message (changelog
// 150). rgba over the app's accent colors so each reads correctly in both
// themes; `tone` omitted leaves the entry unstyled (the default look).
export const CHANGELOG_TONES = {
  notice: { background: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.35)' },
  action: { background: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.45)' },
  success: { background: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.35)' },
};
