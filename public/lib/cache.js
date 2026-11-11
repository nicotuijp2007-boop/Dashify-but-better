// The last good response body, kept on the device for offline use.
// `storage` is window.localStorage in the app and a stub in tests.

export const LIMITS_KEY = "limieten:last-response";
export const NETLIFY_KEY = "limieten:last-netlify";

export function saveSnapshot(storage, body, savedAt = new Date(), key = LIMITS_KEY) {
  try {
    storage.setItem(key, JSON.stringify({ v: 1, savedAt: savedAt.toISOString(), body }));
    return true;
  } catch {
    return false;
  }
}

/** Returns { body, savedAt } or null when missing or unreadable. */
export function loadSnapshot(storage, key = LIMITS_KEY) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const savedAt = new Date(parsed.savedAt);
    if (parsed.v !== 1 || !parsed.body || Number.isNaN(savedAt.getTime())) return null;
    return { body: parsed.body, savedAt };
  } catch {
    return null;
  }
}

export function clearSnapshot(storage, key = LIMITS_KEY) {
  try {
    storage.removeItem(key);
  } catch {
    // Storage blocked: nothing to clear.
  }
}
