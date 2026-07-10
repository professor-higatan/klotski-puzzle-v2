#!/usr/bin/env python3
"""Klotski layout definitions for level packs.

Piece set (classic 華容道):
  - red_boss: 2x2 goal (曹操)
  - 4 vertical 1x2 + 1 horizontal 2x1
  - 4 yellow 1x1 soldiers
  - 2 empty cells
"""
from __future__ import annotations

SHARED_BOARD = {
    'cols': 4,
    'rows': 5,
    'cell_size_px': 96,
    'gap_px': 4,
    'background': '#1a1a1a',
    'frame': '#0d0d0d',
    'exit': {
        'description': '赤2×2の左上が (col:1, row:3) に到達したらクリア',
        'target_piece_id': 'red_boss',
        'target_position': {'col': 1, 'row': 3},
    },
}

SHARED_COLORS = {
    'red': {'fill': '#E63946', 'stroke': '#9B1C2A', 'label_text': '#FFF'},
    'blue': {'fill': '#1D6FB8', 'stroke': '#0E3E6C', 'label_text': '#FFF'},
    'yellow': {'fill': '#F4C430', 'stroke': '#B8902A', 'label_text': '#333'},
    'empty': {'fill': '#2b2b2b', 'stroke': '#1a1a1a'},
}

SHARED_UI = {
    'drag_to_move': True,
    'highlight_goal_piece': True,
    'show_move_counter': True,
    'show_timer': True,
    'reset_button': True,
    'undo_button': True,
    'celebrate_on_win': True,
}


def _p(pid, color, w, h, col, row, **extra):
    piece = {
        'id': pid,
        'type': f'{w}x{h}',
        'color': color,
        'width': w,
        'height': h,
        'position': {'col': col, 'row': row},
        'movable': True,
    }
    piece.update(extra)
    return piece


def _boss(col, row):
    return _p('red_boss', 'red', 2, 2, col, row, label='★', is_goal_piece=True)


def _v(n, col, row):
    return _p(f'blue_v{n}', 'blue', 1, 2, col, row)


def _h(n, col, row):
    return _p(f'blue_h{n}', 'blue', 2, 1, col, row)


def _s(n, col, row):
    return _p(f'yellow_{n}', 'yellow', 1, 1, col, row)


def validate_layout(pieces: list[dict], cols: int = 4, rows: int = 5) -> None:
    """Ensure pieces fill exactly 18 cells (20-2 empties) without overlap."""
    occ = [[None] * cols for _ in range(rows)]
    filled = 0
    ids = set()
    for p in pieces:
        if p['id'] in ids:
            raise ValueError(f'duplicate id {p["id"]}')
        ids.add(p['id'])
        c0, r0 = p['position']['col'], p['position']['row']
        w, h = p['width'], p['height']
        if c0 < 0 or r0 < 0 or c0 + w > cols or r0 + h > rows:
            raise ValueError(f'{p["id"]} out of bounds')
        for r in range(r0, r0 + h):
            for c in range(c0, c0 + w):
                if occ[r][c] is not None:
                    raise ValueError(f'overlap {p["id"]} / {occ[r][c]} at ({c},{r})')
                occ[r][c] = p['id']
                filled += 1
    if filled != cols * rows - 2:
        raise ValueError(f'expected 18 filled cells, got {filled}')


# Coordinates: col 0..3 left→right, row 0..4 top→bottom

# 横刀立馬 (puzzle.json)
HENG_DAO_LI_MA = [
    _boss(1, 0),
    _v(1, 0, 0),
    _v(2, 0, 2),
    _v(3, 3, 0),
    _v(4, 3, 2),
    _h(1, 1, 2),
    _s(1, 1, 3),
    _s(2, 2, 3),
    _s(3, 0, 4),
    _s(4, 3, 4),
]
# V C C V
# V C C V
# V H H V
# V S S V
# S . . S

# 将拥曹营
JIANG_YONG_CAO_YING = [
    _boss(1, 0),
    _v(1, 0, 1),
    _v(2, 3, 1),
    _v(3, 0, 3),
    _v(4, 3, 3),
    _h(1, 1, 2),
    _s(1, 1, 3),
    _s(2, 2, 3),
    _s(3, 1, 4),
    _s(4, 2, 4),
]
# . C C .
# V C C V
# V H H V
# V S S V
# V S S V

# 齐头并进
QI_TOU_BING_JIN = [
    _boss(1, 0),
    _v(1, 0, 0),
    _v(2, 3, 0),
    _v(3, 0, 2),
    _v(4, 3, 2),
    _h(1, 1, 2),
    _s(1, 1, 3),
    _s(2, 2, 3),
    _s(3, 1, 4),
    _s(4, 2, 4),
]
# V C C V
# V C C V
# V H H V
# V S S V
# . S S .

# 兵分三路
BING_FEN_SAN_LU = [
    _boss(1, 0),
    _v(1, 0, 0),
    _v(2, 3, 0),
    _h(1, 1, 2),
    _v(3, 0, 3),
    _v(4, 3, 3),
    _s(1, 0, 2),
    _s(2, 3, 2),
    _s(3, 1, 3),
    _s(4, 2, 3),
]
# V C C V
# V C C V
# S H H S
# V S S V
# V . . V

# 堵塞要道
DU_SE_YAO_DAO = [
    _boss(1, 0),
    _v(1, 0, 0),
    _v(2, 3, 0),
    _h(1, 1, 2),
    _s(1, 0, 2),
    _s(2, 3, 2),
    _s(3, 0, 3),
    _s(4, 3, 3),
    _v(3, 1, 3),
    _v(4, 2, 3),
]
# V C C V
# V C C V
# S H H S
# S V V S
# . V V .

# 水泄不通
SHUI_XIE_BU_TONG = [
    _boss(1, 0),
    _v(1, 0, 0),
    _v(2, 3, 0),
    _s(1, 0, 2),
    _s(2, 3, 2),
    _h(1, 1, 2),
    _v(3, 0, 3),
    _v(4, 3, 3),
    _s(3, 1, 3),
    _s(4, 2, 4),
]
# V C C V
# V C C V
# S H H S
# V S . V
# V . S V


# Ordered roughly by unit-step length (BFS). Re-run build_levels.py after edits.
CLASSIC_LAYOUTS = [
    {
        'id': 'classics-01',
        'order': 1,
        'name_ja': '水泄不通',
        'name': 'Watertight',
        'description': '古典配置その1。スキマをうまく使おう。',
        'pieces': SHUI_XIE_BU_TONG,
    },
    {
        'id': 'classics-02',
        'order': 2,
        'name_ja': '兵分三路',
        'name': 'Three Paths',
        'description': '兵が三方向に分かれている古典配置。',
        'pieces': BING_FEN_SAN_LU,
    },
    {
        'id': 'classics-03',
        'order': 3,
        'name_ja': '堵塞要道',
        'name': 'Blocked Road',
        'description': '出口への道が塞がれている。開通させよう。',
        'pieces': DU_SE_YAO_DAO,
    },
    {
        'id': 'classics-04',
        'order': 4,
        'name_ja': '将拥曹营',
        'name': 'Generals Guard',
        'description': '将軍たちが★を囲んでいる。上の隙間を使おう。',
        'pieces': JIANG_YONG_CAO_YING,
    },
    {
        'id': 'classics-05',
        'order': 5,
        'name_ja': '齐头并进',
        'name': 'Advance Together',
        'description': '兵士が揃って前にいる配置。バランスよく動かそう。',
        'pieces': QI_TOU_BING_JIN,
    },
    {
        'id': 'classics-06',
        'order': 6,
        'name_ja': '横刀立馬',
        'name': 'Horizontal Blade',
        'description': 'もっとも有名な配置。達人への道。',
        'pieces': HENG_DAO_LI_MA,
    },
]


INTRO_META = [
    {
        'id': 'intro-01',
        'order': 1,
        'legacy_numeric_id': 1,
        'name_ja': 'はじめの一歩',
        'name': 'First Step',
        'description': 'ゴールまであと少し！スワイプの練習にぴったり。',
        'skip': 106,
    },
    {
        'id': 'intro-02',
        'order': 2,
        'legacy_numeric_id': 2,
        'name_ja': 'あと少し',
        'name': 'Almost There',
        'description': '出口が見えてきた。もう一息！',
        'skip': 101,
    },
    {
        'id': 'intro-03',
        'order': 3,
        'legacy_numeric_id': 3,
        'name_ja': 'ゴール前',
        'name': 'Near Goal',
        'description': '★が出口のすぐ上。あと一息！',
        'skip': 96,
    },
    {
        'id': 'intro-04',
        'order': 4,
        'legacy_numeric_id': 4,
        'name_ja': '半分くらい',
        'name': 'Halfway',
        'description': '正解の半分くらい進んだところから。',
        'skip': 86,
    },
    {
        'id': 'intro-05',
        'order': 5,
        'legacy_numeric_id': 5,
        'name_ja': '道中',
        'name': 'Midway',
        'description': '中盤からのスタート。',
        'skip': 76,
    },
    {
        'id': 'intro-06',
        'order': 6,
        'legacy_numeric_id': 6,
        'name_ja': '本番前',
        'name': 'Warm-up',
        'description': '本格的な手数に入る前の準備運動。',
        'skip': 61,
    },
    {
        'id': 'intro-07',
        'order': 7,
        'legacy_numeric_id': 7,
        'name_ja': '本格',
        'name': 'Standard',
        'description': 'ちょっと難しくなってきた。',
        'skip': 50,
    },
    {
        'id': 'intro-08',
        'order': 8,
        'legacy_numeric_id': 8,
        'name_ja': '熱くなってきた',
        'name': 'Heating Up',
        'description': '手数が増えてきた。集中しよう！',
        'skip': 36,
    },
    {
        'id': 'intro-09',
        'order': 9,
        'legacy_numeric_id': 9,
        'name_ja': '挑戦',
        'name': 'Challenge',
        'description': 'かなり手強い。粘り強く！',
        'skip': 20,
    },
    {
        'id': 'intro-10',
        'order': 10,
        'legacy_numeric_id': 10,
        'name_ja': '横刀立馬',
        'name': 'Horizontal Blade',
        'description': 'はじめてパックの最終関門！',
        'skip': 0,
    },
]


PACK_META = [
    {
        'id': 'intro',
        'order': 1,
        'name_ja': 'はじめて',
        'name': 'Intro',
        'description': '横刀立馬を段階的に練習しよう',
        'unlock': 'always',
    },
    {
        'id': 'classics',
        'order': 2,
        'name_ja': '古典の間',
        'name': 'Classics',
        'description': '有名な配置に挑戦',
        'unlock': 'pack_cleared:intro',
    },
]


if __name__ == '__main__':
    for layout in CLASSIC_LAYOUTS:
        validate_layout(layout['pieces'])
        print(f"OK {layout['id']} {layout['name_ja']}")
