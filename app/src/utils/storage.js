import { openDB } from 'idb';

const DB_NAME = 'swing_ai_db';
const DB_VERSION = 1;
const STORE_NAME = 'analyses';
const MAX_ANALYSES = 50;

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('timestamp', 'timestamp');
      }
    },
  });
}

/**
 * Save analysis to IndexedDB
 * @param {Object} analysis - { imageBlob, imageThumbnail, measurements, coaching, totalScore, cameraAngle, timestamp }
 */
export async function saveAnalysis(analysis) {
  const db = await getDB();
  const entry = {
    ...analysis,
    timestamp: analysis.timestamp || Date.now(),
  };

  await db.add(STORE_NAME, entry);

  // FIFO eviction — keep max 50
  const count = await db.count(STORE_NAME);
  if (count > MAX_ANALYSES) {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const index = tx.store.index('timestamp');
    let cursor = await index.openCursor();
    let toDelete = count - MAX_ANALYSES;
    while (cursor && toDelete > 0) {
      await cursor.delete();
      cursor = await cursor.continue();
      toDelete--;
    }
    await tx.done;
  }

  return entry;
}

/**
 * Get all analyses, newest first
 */
export async function getHistory() {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  return all.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Get lightweight metadata for analyses list (no base64 frames).
 * Much faster than getHistory() for UI lists — each full analysis can be 1-5MB.
 * @param {number} limit - Max items to return (default 20)
 * @returns {Array<{ id, timestamp, totalScore, imageThumbnail, cameraAngle, _meta }>}
 */
export async function getHistoryMeta(limit = 20) {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  const sorted = all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  return sorted.map(item => ({
    id: item.id,
    timestamp: item.timestamp,
    totalScore: item.coaching?.totalScore ?? item.totalScore ?? null,
    imageThumbnail: item.imageThumbnail || null,
    cameraAngle: item.cameraAngle || null,
    _meta: item._meta || null,
  }));
}

/**
 * Get a single analysis by ID
 */
export async function getAnalysis(id) {
  const db = await getDB();
  return db.get(STORE_NAME, id);
}

/**
 * Delete a single analysis
 */
export async function deleteAnalysis(id) {
  const db = await getDB();
  return db.delete(STORE_NAME, id);
}

/**
 * Clear all analyses
 */
export async function clearHistory() {
  const db = await getDB();
  return db.clear(STORE_NAME);
}

/**
 * Get settings from localStorage (small key-value data only)
 */
export function getSetting(key, defaultValue = null) {
  try {
    const val = localStorage.getItem(`swing_ai_${key}`);
    return val !== null ? JSON.parse(val) : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Save setting to localStorage
 */
export function setSetting(key, value) {
  localStorage.setItem(`swing_ai_${key}`, JSON.stringify(value));
}

/**
 * Compress image to thumbnail for list display
 */
export function createThumbnail(imageBlob, maxWidth = 200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(imageBlob);
    const timeout = setTimeout(() => { URL.revokeObjectURL(url); reject(new Error('Thumbnail creation timed out')); }, 5000);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio = maxWidth / img.width;
      canvas.width = maxWidth;
      canvas.height = img.height * ratio;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          clearTimeout(timeout);
          URL.revokeObjectURL(url);
          resolve(blob);
        },
        'image/jpeg',
        0.7
      );
    };
    img.onerror = () => { clearTimeout(timeout); URL.revokeObjectURL(url); reject(new Error('Image load failed for thumbnail')); };
    img.src = url;
  });
}
