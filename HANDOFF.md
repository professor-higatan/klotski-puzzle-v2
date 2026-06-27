# 華容道パズル Webアプリ — 開発引き継ぎ

## 概要

息子向けの華容道（スライディングブロック）パズル。iPad/スマホ向け。元データは Obsidian の `puzzle.json`（横刀立馬配置）。

## 公開URL・リポジトリ

- **アプリ:** https://professor-higatan.github.io/klotski-puzzle/
- **GitHub:** https://github.com/professor-higatan/klotski-puzzle
- **デプロイ:** GitHub Pages（`main` ブランチ、ルート公開）
- **ローカル:** `/Users/hidetadahigashi/klotski-puzzle/`

## 技術スタック

- バニラ HTML / CSS / JavaScript（フレームワークなし）
- データ: `levels.json`（全10レベル＋解法を内包）
- 進行保存: `localStorage`（キー: `klotski-progress-v1`）
- キャッシュ対策: `?v=N` クエリ + `Cache-Control: no-cache`

## ファイル構成

```
klotski-puzzle/
├── index.html              # レベル選択画面 + ゲーム画面
├── styles.css              # モバイル向けスタイル
├── app.js                  # ゲームロジック・UI・進行管理
├── levels.json             # 10レベル定義＋各レベルの solution
├── puzzle.json             # 元の単一パズル定義（レベル6の初期配置と同等）
├── solution.json           # レベル6フル解法116手（levels.json 生成の元）
├── scripts/solve_levels.py # levels.json 再生成スクリプト
└── HANDOFF.md              # 本ファイル
```

## 機能一覧（実装済み）

| 機能 | 状態 |
|------|------|
| スワイプ操作（1.5倍追従ゲイン） | ✅ |
| 手数・タイマー | ✅ |
| 戻す / 最初から | ✅ |
| 参りました（正解実演） | ✅ レベルごと |
| 10レベル制 | ✅ |
| クリアで次レベル解放 | ✅ |
| 個別レベル選択 | ✅ 解放済みはいつでも |
| 続きからボタン | ✅ |
| クリア演出（クラッカー） | ✅ |

## レベル構成

正解手順の**後半部分**を初期盤面にした段階的難易度（`solution.json` の先頭N手を適用して生成）:

| ID | 名前 | 残り手数 |
|----|------|----------|
| 1 | はじめの一歩 | 10手 |
| 2 | あと少し | 15手 |
| 3 | ゴール前 | 20手 |
| 4 | 半分くらい | 30手 |
| 5 | 道中 | 40手 |
| 6 | 本番前 | 55手 |
| 7 | 本格 | 66手 |
| 8 | 熱くなってきた | 80手 |
| 9 | 挑戦 | 96手 |
| 10 | 横刀立馬 | 116手 |

### levels.json の再生成

```bash
cd /Users/hidetadahigashi/klotski-puzzle
python3 scripts/solve_levels.py
```

`skip` 値は `scripts/solve_levels.py` の `LEVEL_META` で調整。

## 操作・スワイプの主要パラメータ（app.js）

```javascript
const APP_VERSION = '9';
const PROGRESS_KEY = 'klotski-progress-v1';

TRACKING_GAIN = 1.5      // 指に対する追従速度
SWIPE_THRESHOLD = 10
FLICK_VELOCITY = 0.4
AXIS_LOCK = 4
DEMO_MOVE_MS = 300       // 正解実演の1手あたり
```

## 過去に直したバグ

1. **盤面非表示** — HTML更新後に古い `app.js` がキャッシュされ `directionPad` が null でクラッシュ → `?v=N` で解決
2. **スワイプ追従停止** — `lostpointercapture` がドラッグを途中終了 → 削除し `document` レベルで pointer 追跡
3. **モッサリ感** — 閾値・ゲイン調整で改善（現在1.5倍）

## localStorage の進行データ

```json
{
  "maxUnlocked": 1,
  "cleared": [1, 2],
  "lastLevel": 2
}
```

## デプロイ手順

```bash
cd /Users/hidetadahigashi/klotski-puzzle
# 変更後 APP_VERSION を increment（index.html の ?v= も合わせる）
git add -A && git commit -m "..." && git push
# GitHub Pages が自動デプロイ（数分待つ）
```

## 未着手・改善候補

- レベル6の最短解は**81手**（現在116手は非最短だが確実に解けるルート）
- 別の古典配置（齐头并进、兵分三路など）を独立パズルとして追加する場合は BFS が重い → 解法を事前計算して `levels.json` に埋め込む方針がよい
- 効果音、最適手数との比較表示、星評価（手数ベース）
- PWA化（ホーム画面追加用 manifest）

## 元データの場所

```
/Users/hidetadahigashi/Library/Mobile Documents/iCloud~md~obsidian/Documents/Hidetadaのナレッジベース/puzzle.json
```

## Git 履歴（主要）

```
73b3c9b 6レベル制を追加: 進行解放・個別選択・正解実演を統合
750ca32 参りましたボタン追加: 正解手順116手の実演再生
000b374 スワイプ追従バグ修正: lostpointercapture除去・document追跡・フリック誤判定防止
4e6b335 移動速度を約50%向上: 追従ゲイン1.5倍・判定閾値の調整
65de78e スワイプ反応を高速化: 1:1追従・フリック判定・GPU描画
54ca77d 盤面非表示バグ修正: キャッシュ不整合対策と初期化の堅牢化
1e006e3 スワイプ操作に一本化: 方向パッドを削除しドラッグ追従を追加
c9b3193 華容道パズル: 息子向けモバイル対応ウェブアプリ
```

## 新しい会話での始め方

```
華容道パズルアプリ（https://github.com/professor-higatan/klotski-puzzle）の開発を続けたい。
リポジトリの HANDOFF.md を読んで引き継いで。次は〇〇をやりたい。
```