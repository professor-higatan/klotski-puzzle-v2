import { PROGRESS_KEY } from './constants.js';

const DEFAULT_PROGRESS = { maxUnlocked: 1, cleared: [], lastLevel: 1 };

export function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { ...DEFAULT_PROGRESS, cleared: [] };
    const saved = JSON.parse(raw);
    return {
      maxUnlocked: Math.max(1, saved.maxUnlocked || 1),
      cleared: Array.isArray(saved.cleared) ? saved.cleared : [],
      lastLevel: saved.lastLevel || 1,
    };
  } catch (_) {
    return { ...DEFAULT_PROGRESS, cleared: [] };
  }
}

export function saveProgress(progress) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
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
  return Math.min(progress.maxUnlocked, sorted[sorted.length - 1]);
}