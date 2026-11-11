// The last good response body, kept on the device for offline use.
// `storage` is window.localStorage in the app and a stub in tests.

const KEY = "limieten:last-response";

export function saveSnapshot(storage, body, savedAt = new Date()) {
  try {
    storage.setItem(KEY, JSON.stringify({ v: 1, savedAt: savedAt.toISOString(), body }));
    return true;
  } catch {
    return false;
  }
}

/** Returns { body, savedAt } or null when missing or unreadable. */
export function loadSnapshot(storage) {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const savedAt = new Date(parsed.savedAt);
    if (parsed.v !== 1 || !parsed.body || Number.isNaN(savedAt.getTime())) return null;
    return { body: parsed.body, savedAt };
  } catch {
    return null;
  }
}

export function clearSnapshot(storage) {
  try {
    storage.removeItem(KEY);
  } catch {
    // Storage blocked: nothing to clear.
  }
}
