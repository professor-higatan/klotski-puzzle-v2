import { DIRS } from './constants.js';

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

export function canMove(piece, pieces, board) {
  return (dc, dr) => {
    const occ = getOccupancy(pieces, board, piece.id);
    const { col, row } = piece.position;

    if (dc === 1) {
      for (let r = 0; r < piece.height; r++) {
        if (col + piece.width >= board.cols || occ[row + r][col + piece.width]) return false;
      }
      return true;
    }
    if (dc === -1) {
      for (let r = 0; r < piece.height; r++) {
        if (col - 1 < 0 || occ[row + r][col - 1]) return false;
      }
      return true;
    }
    if (dr === 1) {
      for (let c = 0; c < piece.width; c++) {
        if (row + piece.height >= board.rows || occ[row + piece.height][col + c]) return false;
      }
      return true;
    }
    if (dr === -1) {
      for (let c = 0; c < piece.width; c++) {
        if (row - 1 < 0 || occ[row - 1][col + c]) return false;
      }
      return true;
    }
    return false;
  };
}

export function getMovableDirs(pieceId, pieces, board) {
  const piece = pieces.find((p) => p.id === pieceId);
  if (!piece) return {};
  const check = canMove(piece, pieces, board);
  return {
    up: check(0, -1),
    down: check(0, 1),
    left: check(-1, 0),
    right: check(1, 0),
  };
}

export function directionFromDelta(dx, dy, axis) {
  if (axis === 'x') return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}

export function tryMove(pieceId, direction, pieces, board) {
  const piece = pieces.find((p) => p.id === pieceId);
  if (!piece) return false;
  const { dc, dr } = DIRS[direction];
  if (!canMove(piece, pieces, board)(dc, dr)) return false;
  piece.position.col += dc;
  piece.position.row += dr;
  return true;
}

export function isWin(pieces, exit) {
  const boss = pieces.find((p) => p.id === exit.target_piece_id);
  return (
    boss &&
    boss.position.col === exit.target_position.col &&
    boss.position.row === exit.target_position.row
  );
}