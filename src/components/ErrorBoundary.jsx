import React from 'react';
import { snapshotAppStorage, listAppKeys } from '../utils/storageKeys';

// The crash screen's two ways out when Try Again does not help (a corrupt
// or crafted value in storage fails the same way on every render):
//   * Download my data -- every app key exactly as stored, as one JSON
//     file, WITHOUT interpreting any of it (the data may be why the app
//     cannot render). Nothing is lost by pressing it.
//   * Reset this app's storage -- after a confirm, removes every app key
//     and reloads to the first-run state.
function downloadRawAppData() {
  const data = { exportedAt: new Date().toISOString(), note: 'Raw copy of everything OutlastRetirement kept in this browser, saved from the error screen.', storage: snapshotAppStorage() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `outlastretirement_raw_data_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function resetAppStorage() {
  try {
    for (const key of listAppKeys()) localStorage.removeItem(key);
  } catch (e) {
    console.error('Could not reset storage', e);
  }
}

// Generic React error boundary -- catches render-time exceptions in
// whatever it wraps and shows a recoverable in-app message instead of
// letting React unmount the whole tree, which otherwise reads as a fully
// blank white page with no way back short of a hard browser reload. That's
// exactly what got reported 2026-08-17: adding FXAIX as a holding triggered
// some downstream render error, and because nothing in the app caught it,
// the entire UI vanished rather than just the one broken panel, and only a
// full page reload (not the in-app refresh) brought it back -- losing
// whatever hadn't been persisted to localStorage yet in the process.
//
// Used three ways: around the whole app (main.jsx, with `recovery` so the
// crash screen offers Download my data / Reset this app's storage), around
// the tab outlet in App.jsx (so one tab's crash keeps the navigation), and
// around PortfolioTab.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Deliberately still logged even though the UI below now shows
    // something -- this is what turns "the UI went blank" into an actual
    // stack trace, instead of needing to catch it live to diagnose it.
    console.error('[ErrorBoundary] Caught a render error:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0, color: 'var(--danger)' }}>Something went wrong here</h2>
          <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', maxWidth: '640px', lineHeight: '1.5' }}>
            {this.props.fallbackMessage ||
              "This panel hit an unexpected error and stopped rendering. The rest of the app should still work — switch tabs, or use Try Again below."}
            {' '}
            <span style={{ fontFamily: 'monospace', fontSize: 'var(--fs-xs)' }}>({error.message})</span>
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <button
              type="button"
              className="btn-outline"
              onClick={() => this.setState({ error: null })}
            >
              Try Again
            </button>
            {this.props.recovery && (
              <>
                <button type="button" className="btn-outline" onClick={() => downloadRawAppData()}>
                  Download my data
                </button>
                <button
                  type="button"
                  className="btn-outline"
                  style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                  onClick={() => {
                    // Native confirm on purpose: the app's own dialog is part
                    // of the tree that just failed to render.
                    if (window.confirm("Reset this app's storage? This removes your plan, scenarios, holdings and everything else OutlastRetirement keeps in this browser, then reloads. Download my data first if you may want any of it.")) {
                      resetAppStorage();
                      window.location.replace(window.location.pathname);
                    }
                  }}
                >
                  Reset this app&rsquo;s storage
                </button>
              </>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
