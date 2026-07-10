#!/usr/bin/env python3
"""Build levels.json (v2 packs) from intro suffixes + classic BFS solutions."""
from __future__ import annotations

import json
import time
from pathlib import Path

from klotski_solver import apply_moves, clone_pieces, solve, verify_solution
from layouts import (
    CLASSIC_LAYOUTS,
    HENG_DAO_LI_MA,
    INTRO_META,
    PACK_META,
    SHARED_BOARD,
    SHARED_COLORS,
    SHARED_UI,
    validate_layout,
)

ROOT = Path(__file__).resolve().parent.parent


def level_payload(meta: dict, pieces: list, solution: dict, **extra) -> dict:
    return {
        'id': meta['id'],
        'order': meta['order'],
        'name_ja': meta['name_ja'],
        'name': meta.get('name', meta['name_ja']),
        'description': meta.get('description', ''),
        'pieces': pieces,
        'solution': {
            'moves': solution['moves'],
            'total': solution['total'],
            'optimal': bool(solution.get('optimal', False)),
        },
        **extra,
    }


def build_intro(heng_solution_moves: list[dict]) -> list[dict]:
    total = len(heng_solution_moves)
    levels = []
    for meta in INTRO_META:
        skip = meta['skip']
        if skip > total:
            raise RuntimeError(f"skip {skip} exceeds solution length {total}")
        prefix = heng_solution_moves[:skip]
        suffix = heng_solution_moves[skip:]
        pieces = apply_moves(clone_pieces(HENG_DAO_LI_MA), prefix, SHARED_BOARD)
        validate_layout(pieces)
        if not verify_solution(pieces, suffix, SHARED_BOARD):
            raise RuntimeError(f"intro verify failed: {meta['id']}")
        levels.append(
            level_payload(
                meta,
                pieces,
                {'moves': suffix, 'total': len(suffix), 'optimal': False},
                legacy_numeric_id=meta['legacy_numeric_id'],
            )
        )
        print(f"  intro {meta['id']}: {len(suffix)} moves (skip={skip})")
    return levels


def build_classics() -> list[dict]:
    levels = []
    for meta in CLASSIC_LAYOUTS:
        pieces = clone_pieces(meta['pieces'])
        validate_layout(pieces)
        print(f"  solving {meta['id']} {meta['name_ja']} ...", flush=True)
        t0 = time.time()
        sol = solve(pieces, SHARED_BOARD)
        dt = time.time() - t0
        if not verify_solution(pieces, sol['moves'], SHARED_BOARD):
            raise RuntimeError(f"classic verify failed: {meta['id']}")
        print(
            f"    -> {sol['total']} moves, nodes={sol['nodes']}, {dt:.2f}s",
            flush=True,
        )
        levels.append(level_payload(meta, pieces, sol))
    return levels


def main() -> None:
    print('Building levels.json v2 ...')

    # Prefer BFS optimal for 横刀立馬; fall back to solution.json
    print('Solving 横刀立馬 for intro base ...')
    t0 = time.time()
    try:
        heng = solve(clone_pieces(HENG_DAO_LI_MA), SHARED_BOARD)
        print(f"  BFS: {heng['total']} moves in {time.time() - t0:.2f}s")
        heng_moves = heng['moves']
        heng_optimal = True
    except Exception as err:
        print(f"  BFS failed ({err}), using solution.json")
        raw = json.loads((ROOT / 'solution.json').read_text(encoding='utf-8'))
        heng_moves = raw['moves']
        heng_optimal = False

    # Intro skip values were tuned for 116-move solution.json.
    # If BFS found a different length, re-scale skips proportionally
    # or use solution.json for intro continuity.
    solution_json = json.loads((ROOT / 'solution.json').read_text(encoding='utf-8'))
    legacy_moves = solution_json['moves']
    if len(heng_moves) != len(legacy_moves):
        print(
            f"  Note: BFS={len(heng_moves)} vs legacy={len(legacy_moves)}; "
            'intro pack keeps legacy solution.json for skip compatibility'
        )
        intro_moves = legacy_moves
        intro_optimal = False
    else:
        intro_moves = heng_moves
        intro_optimal = heng_optimal

    print('Intro pack:')
    intro_levels = build_intro(intro_moves)

    print('Classics pack:')
    classic_levels = build_classics()

    packs = []
    for pm in PACK_META:
        if pm['id'] == 'intro':
            levels = intro_levels
        elif pm['id'] == 'classics':
            levels = classic_levels
        else:
            levels = []
        packs.append(
            {
                'id': pm['id'],
                'order': pm['order'],
                'name_ja': pm['name_ja'],
                'name': pm['name'],
                'description': pm['description'],
                'unlock': pm['unlock'],
                'levels': levels,
            }
        )

    out = {
        'version': 2,
        'shared': {
            'board': SHARED_BOARD,
            'colors': SHARED_COLORS,
            'ui_hints': SHARED_UI,
        },
        'packs': packs,
    }

    path = ROOT / 'levels.json'
    path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')
    size_kb = path.stat().st_size / 1024
    n = sum(len(p['levels']) for p in packs)
    print(f'Wrote {path} ({size_kb:.1f} KB, {n} levels, intro_optimal={intro_optimal})')


if __name__ == '__main__':
    main()
