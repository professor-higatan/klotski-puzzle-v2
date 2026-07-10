import {
  getContinueTarget,
  hasUnclearedUnlocked,
  isLevelCleared,
  isLevelUnlocked,
  isPackUnlocked,
  packProgressStats,
} from './progress.js';

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Pack selection grid.
 */
export function renderPackSelect({
  levelGrid,
  continueBtn,
  data,
  progress,
  onSelectPack,
  onContinue,
}) {
  levelGrid.replaceChildren();
  levelGrid.setAttribute('aria-label', 'パック一覧');

  const showContinue = hasUnclearedUnlocked(data, progress);
  continueBtn.classList.toggle('hidden', !showContinue);
  if (showContinue) {
    const target = getContinueTarget(data, progress);
    continueBtn.onclick = () => onContinue(target.levelId);
  } else {
    continueBtn.onclick = null;
  }

  const fragment = document.createDocumentFragment();
  const packs = [...data.packs].sort((a, b) => a.order - b.order);

  for (const pack of packs) {
    const unlocked = isPackUnlocked(pack, progress, data);
    const { total, cleared } = packProgressStats(pack, progress);
    const done = total > 0 && cleared === total;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = [
      'level-card',
      'pack-card',
      unlocked ? 'unlocked' : 'locked',
      done ? 'cleared' : '',
    ]
      .filter(Boolean)
      .join(' ');
    btn.disabled = !unlocked;
    btn.setAttribute('role', 'listitem');

    btn.innerHTML =
      `<span class="level-card-num">パック</span>` +
      `<span class="level-card-name">${escapeHtml(pack.name_ja)}</span>` +
      `<span class="level-card-moves">${escapeHtml(pack.description || '')}</span>` +
      `<span class="level-card-progress">${cleared} / ${total}</span>` +
      `<span class="level-card-badge">${done ? '✅' : unlocked ? '▶' : '🔒'}</span>`;

    if (unlocked) {
      btn.addEventListener('click', () => onSelectPack(pack.id));
    }
    fragment.appendChild(btn);
  }

  levelGrid.appendChild(fragment);
}

/**
 * Level selection grid within a pack.
 */
export function renderLevelSelect({
  levelGrid,
  continueBtn,
  pack,
  data,
  progress,
  onSelect,
  onContinue,
}) {
  levelGrid.replaceChildren();
  levelGrid.setAttribute('aria-label', `${pack.name_ja}のレベル一覧`);

  const showContinue = hasUnclearedUnlocked(data, progress);
  continueBtn.classList.toggle('hidden', !showContinue);
  if (showContinue) {
    const target = getContinueTarget(data, progress);
    continueBtn.onclick = () => onContinue(target.levelId);
  } else {
    continueBtn.onclick = null;
  }

  const fragment = document.createDocumentFragment();
  const levels = [...pack.levels].sort((a, b) => a.order - b.order);

  for (const level of levels) {
    const unlocked = isLevelUnlocked(level, pack, progress, data);
    const cleared = isLevelCleared(level.id, progress);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = [
      'level-card',
      unlocked ? 'unlocked' : 'locked',
      cleared ? 'cleared' : '',
    ]
      .filter(Boolean)
      .join(' ');
    btn.disabled = !unlocked;
    btn.setAttribute('role', 'listitem');

    const moves = level.solution?.total ?? '—';
    btn.innerHTML =
      `<span class="level-card-num">レベル ${level.order}</span>` +
      `<span class="level-card-name">${escapeHtml(level.name_ja)}</span>` +
      `<span class="level-card-moves">正解 ${moves} 手</span>` +
      `<span class="level-card-badge">${cleared ? '✅' : unlocked ? '▶' : '🔒'}</span>`;

    if (unlocked) {
      btn.addEventListener('click', () => onSelect(level.id));
    }
    fragment.appendChild(btn);
  }

  levelGrid.appendChild(fragment);
}
