// The event that focuses the "Find a setting" box. Its own module so the
// app shell can send it without importing FindSetting, which carries the
// whole field index.
export const FOCUS_EVENT = 'cfe:find-setting';
