import { getContinueLevel } from './progress.js';

/**
 * Render level selection grid and continue button visibility.
 * @param {{
 *   levelGrid: HTMLElement,
 *   continueBtn: HTMLElement,
 *   levels: Array<{ id: number, name_ja: string, solution: { total: number } }>,
 *   progress: { maxUnlocked: number, cleared: number[] },
 *   onSelect: (levelId: number) => void,
 *   onContinue: (levelId: number) => void,
 * }} opts
 */
export function renderLevelSelect({
  levelGrid,
  continueBtn,
  levels,
  progress,
  onSelect,
  onContinue,
}) {
  levelGrid.replaceChildren();

  const continueLevel = getContinueLevel(levels, progress);
  const hasUncleared = levels.some(
    (l) => l.id <= progress.maxUnlocked && !progress.cleared.includes(l.id)
  );
  continueBtn.classList.toggle('hidden', !hasUncleared);
  continueBtn.onclick = () => onContinue(continueLevel);

  const fragment = document.createDocumentFragment();

  for (const level of levels) {
    const unlocked = level.id <= progress.maxUnlocked;
    const cleared = progress.cleared.includes(level.id);

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

    btn.innerHTML =
      `<span class="level-card-num">レベル ${level.id}</span>` +
      `<span class="level-card-name">${escapeHtml(level.name_ja)}</span>` +
      `<span class="level-card-moves">正解 ${level.solution.total} 手</span>` +
      `<span class="level-card-badge">${cleared ? '✅' : unlocked ? '▶' : '🔒'}</span>`;

    if (unlocked) {
      btn.addEventListener('click', () => onSelect(level.id));
    }
    fragment.appendChild(btn);
  }

  levelGrid.appendChild(fragment);
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
