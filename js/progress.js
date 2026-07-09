import { PROGRESS_KEY } from './constants.js';

const DEFAULT_PROGRESS = Object.freeze({
  maxUnlocked: 1,
  cleared: Object.freeze([]),
  lastLevel: 1,
});

function blankProgress() {
  return {
    maxUnlocked: DEFAULT_PROGRESS.maxUnlocked,
    cleared: [],
    lastLevel: DEFAULT_PROGRESS.lastLevel,
  };
}

export function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return blankProgress();
    const saved = JSON.parse(raw);
    return {
      maxUnlocked: Math.max(1, Number(saved.maxUnlocked) || 1),
      cleared: Array.isArray(saved.cleared)
        ? saved.cleared.filter((id) => Number.isFinite(id))
        : [],
      lastLevel: Number(saved.lastLevel) || 1,
    };
  } catch (_) {
    return blankProgress();
  }
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch (err) {
    console.warn('progress save failed', err);
  }
}

export function markLevelCleared(progress, levelId, totalLevels) {
  if (!progress.cleared.includes(levelId)) {
    progress.cleared.push(levelId);
    progress.cleared.sort((a, b) => a - b);
  }
  if (levelId < totalLevels) {
    progress.maxUnlocked = Math.max(progress.maxUnlocked, levelId + 1);
  }
  saveProgress(progress);
}

export function getContinueLevel(levels, progress) {
  const sorted = levels.map((l) => l.id).sort((a, b) => a - b);
  for (const id of sorted) {
    if (id <= progress.maxUnlocked && !progress.cleared.includes(id)) return id;
  }
  return Math.min(progress.maxUnlocked, sorted[sorted.length - 1] ?? 1);
}
