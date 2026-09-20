// Centralized Progress & Timestamp Synchronization Engine
// The ONLY deciding factor between database and local storage progress is the newest date-time timestamp.

/**
 * Parse any date-time representation into epoch milliseconds.
 * Supports Date objects, numeric epoch seconds, numeric epoch milliseconds,
 * ISO-8601 strings, and nested response objects.
 *
 * @param {*} val
 * @returns {number} Epoch milliseconds, or 0 if missing/invalid
 */
export function parseDateTimeToEpoch(val) {
  if (val === null || val === undefined) return 0;

  if (typeof val === "number") {
    if (val <= 0 || isNaN(val)) return 0;
    // If value is in seconds (e.g. 1.7e9), convert to milliseconds
    if (val < 1e11) return Math.round(val * 1000);
    return Math.round(val);
  }

  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return 0;
    const num = Number(trimmed);
    if (!isNaN(num) && num > 0) {
      if (num < 1e11) return Math.round(num * 1000);
      return Math.round(num);
    }
    const t = new Date(trimmed).getTime();
    return isNaN(t) ? 0 : t;
  }

  if (val instanceof Date) {
    const t = val.getTime();
    return isNaN(t) ? 0 : t;
  }

  if (typeof val === "object") {
    return (
      parseDateTimeToEpoch(val.timestamp) ||
      parseDateTimeToEpoch(val.lastPlayedTimestamp) ||
      parseDateTimeToEpoch(val.updatedAt) ||
      parseDateTimeToEpoch(val.lastPlayedAt) ||
      parseDateTimeToEpoch(val.getLastPlayedAt) ||
      parseDateTimeToEpoch(val.last_played_at) ||
      parseDateTimeToEpoch(val.updated_at) ||
      (val.progressResponse ? parseDateTimeToEpoch(val.progressResponse) : 0) ||
      0
    );
  }

  return 0;
}

/**
 * Parse position in seconds from any representation or nested object.
 *
 * @param {*} val
 * @returns {number} Non-negative position in seconds
 */
export function parsePosition(val) {
  if (val === null || val === undefined) return 0;

  if (typeof val === "number") {
    return isNaN(val) ? 0 : Math.max(0, val);
  }

  if (typeof val === "string") {
    if (val.includes(":")) {
      const parts = val.split(":").map(p => parseFloat(p));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return Math.max(0, parts[0] * 60 + parts[1]);
      }
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
      }
    }
    const p = parseFloat(val);
    return isNaN(p) ? 0 : Math.max(0, p);
  }

  if (typeof val === "object") {
    if (val.position !== undefined && val.position !== null) {
      const p = parseFloat(val.position);
      if (!isNaN(p)) return Math.max(0, p);
    }
    if (val.positionSeconds !== undefined && val.positionSeconds !== null) {
      const p = parseFloat(val.positionSeconds);
      if (!isNaN(p)) return Math.max(0, p);
    }
    if (val.progressSeconds !== undefined && val.progressSeconds !== null) {
      const p = parseFloat(val.progressSeconds);
      if (!isNaN(p)) return Math.max(0, p);
    }
    if (val.progressResponse) {
      return parsePosition(val.progressResponse);
    }
  }

  return 0;
}

/**
 * Read and parse progress record from localStorage.
 *
 * @param {string|number|null} bookId
 * @returns {object|null} Parsed record with normalized position and timestamp
 */
export function getLocalStorageProgress(bookId = null) {
  try {
    const key = bookId ? `aura_progress_${bookId}` : "aura_last_played_state";
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed) return null;
    const pos = parsePosition(parsed);
    const ts = parseDateTimeToEpoch(parsed);
    return {
      ...parsed,
      position: pos,
      positionSeconds: pos,
      timestamp: ts,
      updatedAt: parsed.updatedAt || (ts ? new Date(ts).toISOString() : new Date().toISOString())
    };
  } catch (e) {
    return null;
  }
}

/**
 * Reconcile audiobook progress between database and local storage.
 * 
 * STRICT RULE:
 * The only deciding factor that determines who wins is the newest date-time timestamp.
 * If the database date-time is newer, localStorage is updated IMMEDIATELY.
 *
 * @param {string|number} bookId
 * @param {object} dbData Server response (CatalogAudiobookResponse, UserAudiobookProgressResponse, or book object)
 * @returns {object} { position, completed, timestamp, updatedAt, source, isNewer }
 */
export function reconcileBookProgress(bookId, dbData) {
  if (!bookId) {
    return { position: 0, completed: false, timestamp: 0, updatedAt: new Date().toISOString(), source: "none", isNewer: false };
  }

  const normalizedId = String(bookId);
  const dbTime = parseDateTimeToEpoch(dbData);
  const dbPos = parsePosition(dbData);
  const dbCompleted = !!(dbData?.completed ?? dbData?.progressResponse?.completed);

  const localRecord = getLocalStorageProgress(normalizedId);
  const localTime = localRecord ? parseDateTimeToEpoch(localRecord) : 0;
  const localPos = localRecord ? parsePosition(localRecord) : 0;
  const localCompleted = !!localRecord?.completed;

  // STRICT TIMESTAMP COMPARISON:
  if (dbTime > localTime) {
    // Database is strictly newer: IMMEDIATELY overwrite localStorage with database data
    const dbIso = new Date(dbTime).toISOString();
    const updateRecord = {
      bookId: normalizedId,
      position: dbPos,
      positionSeconds: dbPos,
      completed: dbCompleted,
      chapterIndex: localRecord?.chapterIndex || 0,
      timestamp: dbTime,
      updatedAt: dbIso
    };

    try {
      localStorage.setItem(`aura_progress_${normalizedId}`, JSON.stringify(updateRecord));

      // If this book is also stored in aura_last_played_state, keep it in sync
      const lastPlayedRaw = localStorage.getItem("aura_last_played_state");
      if (lastPlayedRaw) {
        const lastPlayed = JSON.parse(lastPlayedRaw);
        if (lastPlayed && String(lastPlayed.bookId || lastPlayed.book?.id) === normalizedId) {
          const lastPlayedTime = parseDateTimeToEpoch(lastPlayed);
          if (dbTime > lastPlayedTime) {
            localStorage.setItem("aura_last_played_state", JSON.stringify({
              ...lastPlayed,
              position: dbPos,
              positionSeconds: dbPos,
              completed: dbCompleted,
              timestamp: dbTime,
              updatedAt: dbIso
            }));
          }
        }
      }
    } catch (e) {
      console.warn("[Aura Progress] Could not update localStorage:", e);
    }

    return {
      position: dbPos,
      completed: dbCompleted,
      timestamp: dbTime,
      updatedAt: dbIso,
      source: "database",
      isNewer: true
    };
  }

  if (localTime > dbTime) {
    // Local storage is strictly newer: retain local storage
    const localIso = localRecord?.updatedAt || (localTime ? new Date(localTime).toISOString() : new Date().toISOString());
    return {
      position: localPos,
      completed: localCompleted,
      timestamp: localTime,
      updatedAt: localIso,
      source: "local",
      isNewer: false
    };
  }

  // Timestamps are equal or both are missing
  if (dbTime > 0) {
    // Both timestamps equal and valid: ensure localStorage is consistent
    const iso = new Date(dbTime).toISOString();
    const updateRecord = {
      bookId: normalizedId,
      position: dbPos,
      positionSeconds: dbPos,
      completed: dbCompleted,
      chapterIndex: localRecord?.chapterIndex || 0,
      timestamp: dbTime,
      updatedAt: iso
    };
    try {
      localStorage.setItem(`aura_progress_${normalizedId}`, JSON.stringify(updateRecord));
    } catch (e) {}

    return {
      position: dbPos,
      completed: dbCompleted,
      timestamp: dbTime,
      updatedAt: iso,
      source: "database",
      isNewer: false
    };
  }

  // Neither had a timestamp: fallback to non-zero position
  if (dbPos > 0) {
    const now = Date.now();
    const updateRecord = {
      bookId: normalizedId,
      position: dbPos,
      positionSeconds: dbPos,
      completed: dbCompleted,
      chapterIndex: localRecord?.chapterIndex || 0,
      timestamp: now,
      updatedAt: new Date(now).toISOString()
    };
    try {
      localStorage.setItem(`aura_progress_${normalizedId}`, JSON.stringify(updateRecord));
    } catch (e) {}
    return { position: dbPos, completed: dbCompleted, timestamp: now, updatedAt: updateRecord.updatedAt, source: "database", isNewer: false };
  }

  return {
    position: localPos,
    completed: localCompleted,
    timestamp: localTime,
    updatedAt: localRecord?.updatedAt || new Date().toISOString(),
    source: "local",
    isNewer: false
  };
}
