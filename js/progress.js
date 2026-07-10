import { PROGRESS_KEY, PROGRESS_KEY_LEGACY } from './constants.js';

/**
 * Progress v2:
 * {
 *   version: 2,
 *   cleared: string[],
 *   unlockedOrder: { [packId]: number },
 *   lastLevelId: string | null,
 *   lastPackId: string | null,
 * }
 */

function blankProgress(packIds = ['intro']) {
  const unlockedOrder = {};
  for (const id of packIds) {
    unlockedOrder[id] = id === 'intro' ? 1 : 0;
  }
  unlockedOrder.intro = Math.max(unlockedOrder.intro || 0, 1);
  return {
    version: 2,
    cleared: [],
    unlockedOrder,
    lastLevelId: null,
    lastPackId: 'intro',
  };
}

function normalizeV2(raw, packIds) {
  const base = blankProgress(packIds);
  const unlockedOrder = { ...base.unlockedOrder, ...(raw.unlockedOrder || {}) };
  unlockedOrder.intro = Math.max(1, Number(unlockedOrder.intro) || 1);
  for (const id of packIds) {
    if (unlockedOrder[id] == null) {
      unlockedOrder[id] = id === 'intro' ? 1 : 0;
    } else {
      unlockedOrder[id] = Math.max(0, Number(unlockedOrder[id]) || 0);
    }
  }
  return {
    version: 2,
    cleared: Array.isArray(raw.cleared)
      ? raw.cleared.map(String).filter(Boolean)
      : [],
    unlockedOrder,
    lastLevelId: raw.lastLevelId ? String(raw.lastLevelId) : null,
    lastPackId: raw.lastPackId ? String(raw.lastPackId) : 'intro',
  };
}

/**
 * Migrate v1 { maxUnlocked, cleared: number[], lastLevel } → v2.
 */
export function migrateFromV1(v1, legacyMap, packIds) {
  const progress = blankProgress(packIds);
  const cleared = [];
  if (Array.isArray(v1.cleared)) {
    for (const n of v1.cleared) {
      const id = legacyMap.get(Number(n));
      if (id) cleared.push(id);
    }
  }
  progress.cleared = cleared;

  const maxUnlocked = Math.max(1, Number(v1.maxUnlocked) || 1);
  progress.unlockedOrder.intro = maxUnlocked;

  if (v1.lastLevel != null) {
    const lastId = legacyMap.get(Number(v1.lastLevel));
    if (lastId) {
      progress.lastLevelId = lastId;
      progress.lastPackId = 'intro';
    }
  }
  return progress;
}

/**
 * Clamp unlocks and apply pack unlock rules against catalog.
 */
export function syncWithCatalog(progress, data) {
  const packs = data.packs || [];

  for (const pack of packs) {
    const maxOrder = pack.levels.length
      ? Math.max(...pack.levels.map((l) => l.order))
      : 0;
    let cur = Number(progress.unlockedOrder[pack.id]) || 0;
    if (pack.unlock === 'always') cur = Math.max(cur, 1);
    progress.unlockedOrder[pack.id] = Math.min(Math.max(cur, 0), maxOrder);
  }

  for (const pack of packs) {
    if (isPackUnlocked(pack, progress, data)) {
      progress.unlockedOrder[pack.id] = Math.max(
        progress.unlockedOrder[pack.id] || 0,
        1
      );
    }
  }

  const validIds = new Set(packs.flatMap((p) => p.levels.map((l) => l.id)));
  progress.cleared = progress.cleared.filter((id) => validIds.has(id));
  return progress;
}

/**
 * Load progress, migrating v1 → v2 when needed.
 * @param {object} data levels.json
 * @param {Map<number,string>} legacyMap
 */
export function loadProgressWithCatalog(data, legacyMap) {
  const packIds = data.packs.map((p) => p.id);
  try {
    const rawV2 = localStorage.getItem(PROGRESS_KEY);
    if (rawV2) {
      const progress = syncWithCatalog(
        normalizeV2(JSON.parse(rawV2), packIds),
        data
      );
      return progress;
    }

    const rawV1 = localStorage.getItem(PROGRESS_KEY_LEGACY);
    if (rawV1) {
      const v1 = JSON.parse(rawV1);
      let progress = migrateFromV1(v1, legacyMap, packIds);
      progress = syncWithCatalog(progress, data);
      const intro = data.packs.find((p) => p.id === 'intro');
      if (intro && isPackFullyCleared(intro, progress)) {
        progress.unlockedOrder.classics = Math.max(
          progress.unlockedOrder.classics || 0,
          1
        );
      }
      saveProgress(progress);
      return progress;
    }
  } catch (err) {
    console.warn('progress load failed', err);
  }
  return syncWithCatalog(blankProgress(packIds), data);
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch (err) {
    console.warn('progress save failed', err);
  }
}

export function isPackFullyCleared(pack, progress) {
  if (!pack?.levels?.length) return false;
  return pack.levels.every((l) => progress.cleared.includes(l.id));
}

export function isPackUnlocked(pack, progress, data) {
  if (!pack) return false;
  if (pack.unlock === 'always') return true;
  if (typeof pack.unlock === 'string' && pack.unlock.startsWith('pack_cleared:')) {
    const req = pack.unlock.slice('pack_cleared:'.length);
    const reqPack = data.packs.find((p) => p.id === req);
    return reqPack ? isPackFullyCleared(reqPack, progress) : false;
  }
  return (progress.unlockedOrder[pack.id] || 0) > 0;
}

export function isLevelUnlocked(level, pack, progress, data) {
  if (!isPackUnlocked(pack, progress, data)) return false;
  const maxOrder = progress.unlockedOrder[pack.id] || 0;
  return level.order <= maxOrder;
}

export function isLevelCleared(levelId, progress) {
  return progress.cleared.includes(levelId);
}

export function markLevelCleared(progress, level, pack, data) {
  if (!progress.cleared.includes(level.id)) {
    progress.cleared.push(level.id);
    progress.cleared.sort();
  }

  const sorted = [...pack.levels].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((l) => l.id === level.id);
  if (idx >= 0 && idx < sorted.length - 1) {
    const next = sorted[idx + 1];
    progress.unlockedOrder[pack.id] = Math.max(
      progress.unlockedOrder[pack.id] || 0,
      next.order
    );
  }

  if (isPackFullyCleared(pack, progress)) {
    for (const other of data.packs) {
      if (other.unlock === `pack_cleared:${pack.id}`) {
        progress.unlockedOrder[other.id] = Math.max(
          progress.unlockedOrder[other.id] || 0,
          1
        );
      }
    }
  }

  saveProgress(progress);
  return progress;
}

export function getContinueTarget(data, progress) {
  const packs = [...data.packs].sort((a, b) => a.order - b.order);
  for (const pack of packs) {
    if (!isPackUnlocked(pack, progress, data)) continue;
    const levels = [...pack.levels].sort((a, b) => a.order - b.order);
    for (const level of levels) {
      if (
        isLevelUnlocked(level, pack, progress, data) &&
        !isLevelCleared(level.id, progress)
      ) {
        return { packId: pack.id, levelId: level.id };
      }
    }
  }
  if (progress.lastLevelId) {
    return { packId: progress.lastPackId, levelId: progress.lastLevelId };
  }
  const intro = packs.find((p) => p.id === 'intro') || packs[0];
  const first = [...intro.levels].sort((a, b) => a.order - b.order)[0];
  return { packId: intro.id, levelId: first.id };
}

export function hasUnclearedUnlocked(data, progress) {
  for (const pack of data.packs) {
    if (!isPackUnlocked(pack, progress, data)) continue;
    for (const level of pack.levels) {
      if (
        isLevelUnlocked(level, pack, progress, data) &&
        !isLevelCleared(level.id, progress)
      ) {
        return true;
      }
    }
  }
  return false;
}

export function packProgressStats(pack, progress) {
  const total = pack.levels.length;
  const cleared = pack.levels.filter((l) =>
    progress.cleared.includes(l.id)
  ).length;
  return { total, cleared };
}
