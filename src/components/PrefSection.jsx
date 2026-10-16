// A titled card section of the Preferences tab. Its own file so the Premium
// host API can hand it to modules (PREMIUM_MODULE_CONTRACT.md 2.7) without
// pulling the lazy PreferencesTab chunk into the startup bundle.
import React from 'react';

export const PrefSection = ({ icon: Icon, title, description, children, accent }) => (
  <div className="glass-panel" style={{ padding: '24px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: description ? '6px' : '16px' }}>
      <Icon size={20} style={{ color: accent || 'var(--accent-text)' }} />
      <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>{title}</h2>
    </div>
    {description && (
      <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.5, maxWidth: '760px' }}>
        {description}
      </p>
    )}
    {children}
  </div>
);

export default PrefSection;
