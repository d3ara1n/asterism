/** Appearance, language, and update settings become available after host storage is ready; earlier stages and recovery views use in-memory defaults. UI state is a cache outside this switch. */
let ready = false;
export function enableSettings(): void { ready = true; }
export function settingsReady(): boolean { return ready; }
