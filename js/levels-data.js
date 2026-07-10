/**
 * Helpers for levels.json v2 (packs + string level ids).
 */

/**
 * Merge shared board/colors into a level for gameplay.
 * @param {object} level
 * @param {object} shared
 * @param {string} packId
 */
export function hydrateLevel(level, shared, packId) {
  return {
    ...level,
    packId,
    board: level.board || shared.board,
    colors: level.colors || shared.colors,
    ui_hints: level.ui_hints || shared.ui_hints,
  };
}

/**
 * @param {object} data levels.json root
 * @returns {Array<{ pack: object, level: object, hydrated: object }>}
 */
export function allLevels(data) {
  const out = [];
  for (const pack of data.packs || []) {
    for (const level of pack.levels || []) {
      out.push({
        pack,
        level,
        hydrated: hydrateLevel(level, data.shared, pack.id),
      });
    }
  }
  return out;
}

export function findLevel(data, levelId) {
  for (const pack of data.packs || []) {
    const level = pack.levels.find((l) => l.id === levelId);
    if (level) {
      return {
        pack,
        level,
        hydrated: hydrateLevel(level, data.shared, pack.id),
      };
    }
  }
  return null;
}

export function findPack(data, packId) {
  return data.packs?.find((p) => p.id === packId) ?? null;
}

/** Next level in same pack, or null. */
export function nextLevelInPack(pack, levelId) {
  if (!pack) return null;
  const sorted = [...pack.levels].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((l) => l.id === levelId);
  if (idx < 0 || idx >= sorted.length - 1) return null;
  return sorted[idx + 1];
}

/** Build legacy_numeric_id → string id map from intro pack. */
export function legacyIdMap(data) {
  const map = new Map();
  const intro = findPack(data, 'intro');
  if (!intro) return map;
  for (const level of intro.levels) {
    if (level.legacy_numeric_id != null) {
      map.set(Number(level.legacy_numeric_id), level.id);
    }
  }
  return map;
}
