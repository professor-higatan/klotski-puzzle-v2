import { DEMO_MOVE_MS, DIRS } from './constants.js';
import { canMove } from './board-logic.js';
import { getCellSize } from './board-renderer.js';
import { sleep } from './utils.js';

/**
 * Solution playback controller (「参りました」).
 * Owns abort flag and animation loop; board mutation goes through callbacks.
 */
export function createDemoPlayer({
  getBoardEl,
  getConfig,
  getPieces,
  setPieces,
  cloneInitialPieces,
  onBeforeStart,
  onAfterMove,
  onStatus,
  onComplete,
  onUiActive,
}) {
  let demonstrating = false;
  let abort = false;

  function isActive() {
    return demonstrating;
  }

  function stop() {
    abort = true;
  }

  async function animateMove(pieceId, direction) {
    if (abort) return false;

    const config = getConfig();
    const pieces = getPieces();
    const piece = pieces.find((p) => p.id === pieceId);
    if (!piece) return false;

    const dir = DIRS[direction];
    if (!dir) return false;
    const { dc, dr } = dir;
    if (!canMove(piece, pieces, config.board, dc, dr)) return false;

    const boardEl = getBoardEl();
    const safeId =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(pieceId)
        : String(pieceId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const el = boardEl.querySelector(`[data-id="${safeId}"]`);
    if (!el) return false;

    const gap = config.board.gap_px;
    const cellSize = getCellSize(config.board);
    const step = cellSize + gap;
    const newCol = piece.position.col + dc;
    const newRow = piece.position.row + dr;

    el.classList.add('demo-highlight', 'demo-slide');
    el.style.left = `${gap + newCol * step}px`;
    el.style.top = `${gap + newRow * step}px`;

    await sleep(DEMO_MOVE_MS);
    if (abort) return false;

    piece.position.col = newCol;
    piece.position.row = newRow;
    onAfterMove?.();
    return true;
  }

  async function start(solution) {
    if (demonstrating || !getConfig() || !solution?.moves?.length) return;

    abort = false;
    demonstrating = true;
    onUiActive?.(true);
    onBeforeStart?.();
    setPieces(cloneInitialPieces());
    onAfterMove?.({ fullRender: true });

    try {
      onStatus?.('正解の動きをお見せします…');
      await sleep(600);

      const moves = solution.moves;
      const total = solution.total || moves.length;

      for (let i = 0; i < moves.length; i++) {
        if (abort) break;
        const { pieceId, direction } = moves[i];
        onStatus?.(`正解再生中… ${i + 1} / ${total}`);
        await animateMove(pieceId, direction);
      }

      if (!abort) {
        const won = onComplete?.() ?? false;
        onStatus?.(won ? 'クリア！これが正解の動きです' : '再生が終わりました');
        await sleep(won ? 1200 : 800);
      }
    } catch (err) {
      console.error(err);
      onStatus?.('正解の再生に失敗しました');
      await sleep(1500);
    }

    demonstrating = false;
    onUiActive?.(false);
  }

  return { start, stop, isActive };
}
