#!/usr/bin/env python3
"""Fast unit-step BFS solver for 4x5 Klotski (華容道).

Pieces of the same shape are treated as interchangeable in the visited set
(canonical state), which shrinks the search space dramatically while still
emitting concrete pieceId moves for the game.
"""
from __future__ import annotations

from collections import deque
from typing import Any

DIRS = (
    ('up', 0, -1),
    ('down', 0, 1),
    ('left', -1, 0),
    ('right', 1, 0),
)


def clone_pieces(pieces: list[dict]) -> list[dict]:
    return [{**p, 'position': dict(p['position'])} for p in pieces]


def piece_order(pieces: list[dict]) -> list[str]:
    return sorted(p['id'] for p in pieces)


def _bit(col: int, row: int, cols: int) -> int:
    return 1 << (row * cols + col)


def shape_mask(w: int, h: int, col: int, row: int, cols: int) -> int:
    m = 0
    for r in range(row, row + h):
        base = r * cols
        for c in range(col, col + w):
            m |= 1 << (base + c)
    return m


def positions_from_pieces(pieces: list[dict], order: list[str]) -> tuple[tuple[int, int], ...]:
    by_id = {p['id']: p for p in pieces}
    return tuple((by_id[pid]['position']['col'], by_id[pid]['position']['row']) for pid in order)


def pieces_from_positions(
    template: list[dict],
    order: list[str],
    positions: tuple[tuple[int, int], ...],
) -> list[dict]:
    by_id = {p['id']: p for p in template}
    return [
        {**by_id[pid], 'position': {'col': col, 'row': row}}
        for pid, (col, row) in zip(order, positions)
    ]


def build_meta(pieces: list[dict], order: list[str]) -> list[tuple[str, int, int]]:
    by_id = {p['id']: p for p in pieces}
    return [(pid, by_id[pid]['width'], by_id[pid]['height']) for pid in order]


def shape_key(w: int, h: int) -> tuple[int, int]:
    return (w, h)


def canonical(positions: tuple[tuple[int, int], ...], meta: list[tuple[str, int, int]]) -> tuple:
    """Sort positions within each shape class for visited-set compression."""
    buckets: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for (col, row), (_, w, h) in zip(positions, meta):
        buckets.setdefault((w, h), []).append((col, row))
    parts = []
    for shape in sorted(buckets):
        parts.append((shape, tuple(sorted(buckets[shape]))))
    return tuple(parts)


def is_win_positions(
    positions: tuple[tuple[int, int], ...],
    meta: list[tuple[str, int, int]],
    target_piece_id: str,
    target_col: int,
    target_row: int,
) -> bool:
    for (col, row), (pid, _, _) in zip(positions, meta):
        if pid == target_piece_id:
            return col == target_col and row == target_row
    return False


def solve(
    pieces: list[dict],
    board: dict[str, Any],
    exit_cfg: dict[str, Any] | None = None,
    *,
    max_nodes: int = 5_000_000,
) -> dict[str, Any]:
    cols = int(board['cols'])
    rows = int(board['rows'])
    exit_cfg = exit_cfg or board.get('exit') or {}
    target_piece_id = exit_cfg['target_piece_id']
    target_col = int(exit_cfg['target_position']['col'])
    target_row = int(exit_cfg['target_position']['row'])

    order = piece_order(pieces)
    meta = build_meta(pieces, order)
    start = positions_from_pieces(pieces, order)

    if is_win_positions(start, meta, target_piece_id, target_col, target_row):
        return {'moves': [], 'total': 0, 'nodes': 0, 'optimal': True}

    # place_mask[i][col][row] valid placement bitmask
    place_mask: list[list[list[int]]] = []
    for _, w, h in meta:
        grid = [[0] * rows for _ in range(cols)]
        for col in range(cols - w + 1):
            for row in range(rows - h + 1):
                grid[col][row] = shape_mask(w, h, col, row, cols)
        place_mask.append(grid)

    def full_mask(positions: tuple[tuple[int, int], ...]) -> int:
        m = 0
        for i, (col, row) in enumerate(positions):
            m |= place_mask[i][col][row]
        return m

    start_canon = canonical(start, meta)
    # parent[labeled_state] = (prev_labeled, piece_index, direction) | None
    parent: dict[tuple[tuple[int, int], ...], tuple | None] = {start: None}
    visited_canon = {start_canon}
    q: deque[tuple[tuple[int, int], ...]] = deque([start])
    nodes = 0

    while q:
        state = q.popleft()
        nodes += 1
        if nodes > max_nodes:
            raise RuntimeError(f'BFS exceeded max_nodes={max_nodes}')

        occ = full_mask(state)

        for i, (col, row) in enumerate(state):
            pid = meta[i][0]
            w, h = meta[i][1], meta[i][2]
            piece_bits = place_mask[i][col][row]
            free = occ ^ piece_bits

            for direction, dc, dr in DIRS:
                nc = col + dc
                nr = row + dr
                if nc < 0 or nr < 0 or nc + w > cols or nr + h > rows:
                    continue
                new_bits = place_mask[i][nc][nr]
                if new_bits == 0 or (new_bits & free):
                    continue

                new_list = list(state)
                new_list[i] = (nc, nr)
                new_state = tuple(new_list)
                if new_state in parent:
                    continue

                canon = canonical(new_state, meta)
                if canon in visited_canon:
                    continue
                visited_canon.add(canon)
                parent[new_state] = (state, i, direction)

                if pid == target_piece_id and nc == target_col and nr == target_row:
                    moves = _reconstruct(parent, new_state, order)
                    return {
                        'moves': moves,
                        'total': len(moves),
                        'nodes': nodes,
                        'optimal': True,
                    }
                if is_win_positions(new_state, meta, target_piece_id, target_col, target_row):
                    moves = _reconstruct(parent, new_state, order)
                    return {
                        'moves': moves,
                        'total': len(moves),
                        'nodes': nodes,
                        'optimal': True,
                    }
                q.append(new_state)

    raise RuntimeError('No solution found (exhausted state space)')


def _reconstruct(parent: dict, end_state: tuple, order: list[str]) -> list[dict[str, str]]:
    moves_rev: list[dict[str, str]] = []
    state = end_state
    while parent[state] is not None:
        prev, idx, direction = parent[state]
        moves_rev.append({'pieceId': order[idx], 'direction': direction})
        state = prev
    moves_rev.reverse()
    return moves_rev


def apply_moves(pieces: list[dict], moves: list[dict], board: dict) -> list[dict]:
    cols = int(board['cols'])
    rows = int(board['rows'])
    state = clone_pieces(pieces)
    order = piece_order(state)
    meta = build_meta(state, order)
    positions = list(positions_from_pieces(state, order))
    id_to_idx = {pid: i for i, pid in enumerate(order)}
    dir_map = {name: (dc, dr) for name, dc, dr in DIRS}

    place_mask = []
    for _, w, h in meta:
        grid = [[0] * rows for _ in range(cols)]
        for col in range(cols - w + 1):
            for row in range(rows - h + 1):
                grid[col][row] = shape_mask(w, h, col, row, cols)
        place_mask.append(grid)

    for m in moves:
        pid = m['pieceId']
        direction = m['direction']
        if pid not in id_to_idx or direction not in dir_map:
            raise RuntimeError(f'Invalid move: {m}')
        i = id_to_idx[pid]
        dc, dr = dir_map[direction]
        col, row = positions[i]
        w, h = meta[i][1], meta[i][2]
        nc, nr = col + dc, row + dr
        if nc < 0 or nr < 0 or nc + w > cols or nr + h > rows:
            raise RuntimeError(f'Illegal move (bounds): {m}')

        occ = 0
        for j, (c, r) in enumerate(positions):
            if j != i:
                occ |= place_mask[j][c][r]
        if place_mask[i][nc][nr] & occ:
            raise RuntimeError(f'Illegal move (collision): {m}')
        positions[i] = (nc, nr)

    return pieces_from_positions(state, order, tuple(positions))


def verify_solution(pieces: list[dict], moves: list[dict], board: dict) -> bool:
    exit_cfg = board['exit']
    final = apply_moves(pieces, moves, board)
    boss = next(p for p in final if p['id'] == exit_cfg['target_piece_id'])
    tp = exit_cfg['target_position']
    return boss['position']['col'] == tp['col'] and boss['position']['row'] == tp['row']


if __name__ == '__main__':
    import json
    import time
    from pathlib import Path

    root = Path(__file__).resolve().parent.parent
    puzzle = json.loads((root / 'puzzle.json').read_text(encoding='utf-8'))
    t0 = time.time()
    result = solve(puzzle['pieces'], puzzle['board'])
    dt = time.time() - t0
    print(f"Solved in {dt:.2f}s, moves={result['total']}, nodes={result['nodes']}")
    assert verify_solution(puzzle['pieces'], result['moves'], puzzle['board'])
    print('Verified OK')
