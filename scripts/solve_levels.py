#!/usr/bin/env python3
"""Build levels.json from classic final layout + solution suffixes for progression."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COLS, ROWS = 4, 5
DIRS = {'up': (0, -1), 'down': (0, 1), 'left': (-1, 0), 'right': (1, 0)}

SHARED = {
    'board': {
        'cols': 4, 'rows': 5, 'cell_size_px': 96, 'gap_px': 4,
        'background': '#1a1a1a', 'frame': '#0d0d0d',
        'exit': {
            'description': '赤2×2の左上が (col:1, row:3) に到達したらクリア',
            'target_piece_id': 'red_boss',
            'target_position': {'col': 1, 'row': 3},
        },
    },
    'colors': {
        'red': {'fill': '#E63946', 'stroke': '#9B1C2A', 'label_text': '#FFF'},
        'blue': {'fill': '#1D6FB8', 'stroke': '#0E3E6C', 'label_text': '#FFF'},
        'yellow': {'fill': '#F4C430', 'stroke': '#B8902A', 'label_text': '#333'},
        'empty': {'fill': '#2b2b2b', 'stroke': '#1a1a1a'},
    },
    'ui_hints': {
        'drag_to_move': True,
        'highlight_goal_piece': True,
        'show_move_counter': True,
        'show_timer': True,
        'reset_button': True,
        'undo_button': True,
        'celebrate_on_win': True,
    },
}

LEVEL_META = [
    {'id': 1, 'name_ja': 'はじめの一歩', 'name': 'First Step', 'description': 'ゴールまであと少し！スワイプの練習にぴったり。', 'skip': 106},
    {'id': 2, 'name_ja': 'ゴール前', 'name': 'Near Goal', 'description': '★が出口のすぐ上。あと一息！', 'skip': 96},
    {'id': 3, 'name_ja': '道中', 'name': 'Midway', 'description': '半分くらい進んだところから。', 'skip': 76},
    {'id': 4, 'name_ja': '本格', 'name': 'Standard', 'description': 'ちょっと難しくなってきた。', 'skip': 50},
    {'id': 5, 'name_ja': '挑戦', 'name': 'Challenge', 'description': 'かなり手強い。粘り強く！', 'skip': 20},
    {'id': 6, 'name_ja': '横刀立馬', 'name': 'Horizontal Blade', 'description': '有名な最難関。クリアできたら達人！', 'skip': 0},
]


def clone_pieces(pieces):
    return [{**p, 'position': dict(p['position'])} for p in pieces]


def can_move(pieces, pid, dc, dr):
    piece = next(p for p in pieces if p['id'] == pid)
    occ = [[0] * COLS for _ in range(ROWS)]
    for p in pieces:
        if p['id'] == pid:
            continue
        for r in range(p['height']):
            for c in range(p['width']):
                occ[p['position']['row'] + r][p['position']['col'] + c] = 1
    col, row = piece['position']['col'], piece['position']['row']
    w, h = piece['width'], piece['height']
    if dc == 1:
        for r in range(h):
            if col + w >= COLS or occ[row + r][col + w]:
                return False
        return True
    if dc == -1:
        for r in range(h):
            if col - 1 < 0 or occ[row + r][col - 1]:
                return False
        return True
    if dr == 1:
        for c in range(w):
            if row + h >= ROWS or occ[row + h][col + c]:
                return False
        return True
    if dr == -1:
        for c in range(w):
            if row - 1 < 0 or occ[row - 1][col + c]:
                return False
        return True


def apply_moves(pieces, moves):
    state = clone_pieces(pieces)
    for m in moves:
        dc, dr = DIRS[m['direction']]
        if not can_move(state, m['pieceId'], dc, dr):
            raise RuntimeError(f"Invalid move in solution: {m}")
        p = next(x for x in state if x['id'] == m['pieceId'])
        p['position']['col'] += dc
        p['position']['row'] += dr
    return state


def main():
    puzzle = json.loads((ROOT / 'puzzle.json').read_text(encoding='utf-8'))
    solution = json.loads((ROOT / 'solution.json').read_text(encoding='utf-8'))
    all_moves = solution['moves']
    total = len(all_moves)

    levels = []
    for meta in LEVEL_META:
        skip = meta['skip']
        if skip > total:
            raise RuntimeError(f"skip {skip} exceeds solution length {total}")
        prefix = all_moves[:skip]
        suffix = all_moves[skip:]
        pieces = apply_moves(puzzle['pieces'], prefix)
        level = {
            'id': meta['id'],
            'name_ja': meta['name_ja'],
            'name': meta['name'],
            'description': meta['description'],
            'board': SHARED['board'],
            'colors': SHARED['colors'],
            'ui_hints': SHARED['ui_hints'],
            'pieces': pieces,
            'solution': {'moves': suffix, 'total': len(suffix)},
        }
        print(f"Level {meta['id']} {meta['name_ja']}: {len(suffix)} moves")
        levels.append(level)

    out = {'version': 1, 'levels': levels}
    (ROOT / 'levels.json').write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Wrote levels.json')


if __name__ == '__main__':
    main()