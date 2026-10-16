// Light / dark theme (changelog 368). Until someone picks a theme in
// Preferences the app follows the device, and keeps following it if it
// changes; only an actual choice is saved, so a visitor who never chose is
// never pinned to whatever the device said on their first visit. A saved
// choice wins everywhere, the public pages included (/brand/theme.js reads
// the same key).
import { useCallback, useEffect, useState } from 'react';
import { safeSetItem } from './safeStorage';

export const THEME_KEY = 'retire_plan_theme';
const QUERY = '(prefers-color-scheme: light)';

function readChoice() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch { return null; }
}

function deviceTheme() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia(QUERY).matches ? 'light' : 'dark';
}

export function useThemePreference() {
  const [choice, setChoice] = useState(readChoice);
  const [device, setDevice] = useState(deviceTheme);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(QUERY);
    const onChange = () => setDevice(mq.matches ? 'light' : 'dark');
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
    return () => { if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', onChange); };
  }, []);
  const theme = choice ?? device;
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setChoice(next);
    safeSetItem(THEME_KEY, next);
  }, [theme]);
  return { theme, toggleTheme };
}
