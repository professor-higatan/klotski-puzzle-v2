import { DIRS } from './constants.js';

/** @typedef {{ id: string, width: number, height: number, position: { col: number, row: number } }} Piece */
/** @typedef {{ cols: number, rows: number }} Board */

/**
 * Build occupancy grid. Cells hold piece id or null.
 * @param {Piece[]} pieces
 * @param {Board} board
 * @param {string} [excludeId]
 */
export function getOccupancy(pieces, board, excludeId) {
  const occ = Array.from({ length: board.rows }, () => Array(board.cols).fill(null));
  for (const p of pieces) {
    if (p.id === excludeId) continue;
    for (let r = 0; r < p.height; r++) {
      for (let c = 0; c < p.width; c++) {
        occ[p.position.row + r][p.position.col + c] = p.id;
      }
    }
  }
  return occ;
}

/**
 * Whether `piece` can move by (dc, dr) one step.
 * @param {Piece} piece
 * @param {Piece[]} pieces
 * @param {Board} board
 * @param {number} dc
 * @param {number} dr
 */
export function canMove(piece, pieces, board, dc, dr) {
  const occ = getOccupancy(pieces, board, piece.id);
  const { col, row } = piece.position;

  if (dc === 1) {
    if (col + piece.width >= board.cols) return false;
    for (let r = 0; r < piece.height; r++) {
      if (occ[row + r][col + piece.width]) return false;
    }
    return true;
  }
  if (dc === -1) {
    if (col - 1 < 0) return false;
    for (let r = 0; r < piece.height; r++) {
      if (occ[row + r][col - 1]) return false;
    }
    return true;
  }
  if (dr === 1) {
    if (row + piece.height >= board.rows) return false;
    for (let c = 0; c < piece.width; c++) {
      if (occ[row + piece.height][col + c]) return false;
    }
    return true;
  }
  if (dr === -1) {
    if (row - 1 < 0) return false;
    for (let c = 0; c < piece.width; c++) {
      if (occ[row - 1][col + c]) return false;
    }
    return true;
  }
  return false;
}

/**
 * @param {string} pieceId
 * @param {Piece[]} pieces
 * @param {Board} board
 * @returns {{ up: boolean, down: boolean, left: boolean, right: boolean }}
 */
export function getMovableDirs(pieceId, pieces, board) {
  const piece = pieces.find((p) => p.id === pieceId);
  if (!piece) return { up: false, down: false, left: false, right: false };
  return {
    up: canMove(piece, pieces, board, 0, -1),
    down: canMove(piece, pieces, board, 0, 1),
    left: canMove(piece, pieces, board, -1, 0),
    right: canMove(piece, pieces, board, 1, 0),
  };
}

/**
 * @param {number} dx
 * @param {number} dy
 * @param {'x'|'y'} axis
 * @returns {'left'|'right'|'up'|'down'}
 */
export function directionFromDelta(dx, dy, axis) {
  if (axis === 'x') return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}

/**
 * Mutates piece position on success.
 * @param {string} pieceId
 * @param {keyof typeof DIRS} direction
 * @param {Piece[]} pieces
 * @param {Board} board
 */
export function tryMove(pieceId, direction, pieces, board) {
  const piece = pieces.find((p) => p.id === pieceId);
  if (!piece) return false;
  const dir = DIRS[direction];
  if (!dir) return false;
  const { dc, dr } = dir;
  if (!canMove(piece, pieces, board, dc, dr)) return false;
  piece.position.col += dc;
  piece.position.row += dr;
  return true;
}

/**
 * @param {Piece[]} pieces
 * @param {{ target_piece_id: string, target_position: { col: number, row: number } }} exit
 */
export function isWin(pieces, exit) {
  const boss = pieces.find((p) => p.id === exit.target_piece_id);
  return (
    !!boss &&
    boss.position.col === exit.target_position.col &&
    boss.position.row === exit.target_position.row
  );
}
