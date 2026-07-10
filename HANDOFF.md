# 華容道パズル Webアプリ — 開発引き継ぎ

## 概要

息子向けの華容道（スライディングブロック）パズル。iPad/スマホ向け。

## 公開URL・リポジトリ

- **アプリ:** https://professor-higatan.github.io/klotski-puzzle/
- **GitHub:** https://github.com/professor-higatan/klotski-puzzle
- **デプロイ:** GitHub Pages（`main` ブランチ、ルート公開）
- **ローカル:** `/Users/hidetadahigashi/klotski-puzzle/`

## 技術スタック

- バニラ HTML / CSS / JavaScript（ES modules）
- データ: `levels.json` **v2**（パック + 文字列レベルID + 解法埋め込み）
- 進行保存: `localStorage` キー `klotski-progress-v2`（v1 から自動移行）
- キャッシュ対策: `?v=N` クエリ

## ファイル構成

```
klotski-puzzle/
├── index.html
├── styles.css
├── levels.json                 # v2: packs + levels（ビルド成果物）
├── puzzle.json                 # 横刀立馬 元配置
├── solution.json               # 横刀立馬 116手（intro 用フォールバック）
├── js/
│   ├── main.js
│   ├── game-controller.js      # 画面遷移・進行
│   ├── board-logic.js
│   ├── board-renderer.js
│   ├── drag-handler.js
│   ├── demo-player.js
│   ├── level-select.js         # パック / レベル UI
│   ├── levels-data.js          # levels.json v2 ヘルパ
│   ├── timer.js
│   ├── progress.js             # v2 + v1 移行
│   ├── confetti.js
│   ├── dom.js
│   ├── constants.js
│   └── utils.js
├── scripts/
│   ├── klotski_solver.py       # 単位手 BFS（形状同一視）
│   ├── layouts.py              # 配置・パック定義
│   ├── build_levels.py         # levels.json 生成
│   └── solve_levels.py         # 旧名（build_levels に委譲）
└── HANDOFF.md
```

## パック構成

| パック | ID | 内容 | 解放条件 |
|--------|-----|------|----------|
| かんたん | `easy` | 空き多め・短手数の12レベル（1〜29手） | 常時 |
| はじめて | `intro` | 横刀立馬を段階的に切った10レベル | easy 全クリア※ |
| 古典の間 | `classics` | 古典配置6問（BFS最短） | intro 全クリア |

※ intro/classics を既に遊んでいた進行は grandfather で解放維持。

### レベルID

- 文字列: `easy-01` …, `intro-01` … `intro-10`, `classics-01` …
- intro には `legacy_numeric_id`（1–10）があり v1 進行から移行する

## levels.json の再生成

```bash
cd /Users/hidetadahigashi/klotski-puzzle
python3 scripts/build_levels.py
```

- easy: `layouts.py` の `EASY_LAYOUTS`（スパース配置可）を BFS
- intro: `solution.json` と同長の116手ルートで skip 切り出し（互換）
- classics: `layouts.py` の `CLASSIC_LAYOUTS` を BFS

### ソルバー単体

```bash
python3 scripts/klotski_solver.py          # puzzle.json を解く
python3 scripts/layouts.py                 # 配置の重なり検証
```

単位手（1マス）最短。文献の「81手」は連続スライドを1手と数える定義。

## 進行データ v2

```json
{
  "version": 2,
  "cleared": ["intro-01", "intro-02"],
  "unlockedOrder": { "intro": 3, "classics": 0 },
  "lastLevelId": "intro-02",
  "lastPackId": "intro"
}
```

- `unlockedOrder[packId]`: そのパックで遊べる最大 `level.order`
- 旧 `klotski-progress-v1` は初回起動時に移行

## 操作パラメータ（js/constants.js）

```javascript
APP_VERSION = '13'
PROGRESS_KEY = 'klotski-progress-v2'
PROGRESS_KEY_LEGACY = 'klotski-progress-v1'
TRACKING_GAIN = 1.5
DEMO_MOVE_MS = 300
```

### かんたんパックの追加・調整

`scripts/layouts.py` の `EASY_LAYOUTS` を編集（コマ少なめ可、`exact_empties=None`）して:

```bash
python3 scripts/build_levels.py
```

## デプロイ

```bash
cd /Users/hidetadahigashi/klotski-puzzle
# APP_VERSION と index.html の ?v= を揃えて bump
git add -A && git commit -m "..." && git push
```

## 機能一覧

| 機能 | 状態 |
|------|------|
| スワイプ操作 | ✅ |
| 手数・タイマー | ✅ |
| 戻す / 最初から | ✅ |
| 参りました（正解実演） | ✅ |
| パック選択 UI | ✅ |
| intro 10 + classics 6 | ✅ |
| 進行 v2 + v1 移行 | ✅ |
| オフライン BFS ソルバー | ✅ |

## 未着手・改善候補

- 効果音、星評価（手数 vs optimal）
- PWA
- 盤面差分更新
- 追加古典・オリジナルパック
- デモ再生の倍速（長手数向け）

## 新しい会話での始め方

```
華容道パズル（professor-higatan/klotski-puzzle）の開発を続けたい。
HANDOFF.md を読んで。次は〇〇をやりたい。
```
