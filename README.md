# Chemyth

大学受験化学（共通テスト〜京大二次）を、工場自動化パズルとして学ぶタブレット向けブラウザゲーム。
資源地から原料を採り、装置に反応を自分で設定し、指定された物質を納品する。
空気と水から始まり、無機工業、製錬、電池、有機、高分子、気体の捕集、イオンの分離、構造決定、結晶・溶液・コロイドまで 19 章・243 指令。
計算問題 116 問、知識問題 140 問、間隔を空けた復習、京大形式のリード文課題 8 題つき。
学習指導要領の「化学基礎」14 項目・「化学」20 項目との対応は、ゲーム内の「メニュー → 範囲表」と `src/content/syllabus.ts` にある。
見た目は「文具」（方眼ノート／黒板）と「工業」（光の炉／闇の炉）の 2 スキン × 明暗。

- 計画：[docs/PLAN.md](docs/PLAN.md)
- 元素の形・物質・反応・資源地・指令・計算問題のデータ：`src/content/`
- エンジン：`src/engine/`、画面：`src/ui/`

```
npm install
npm test         # 原子数の収支、全指令の到達可能性、採点、工場の動作
npm run build    # dist/index.html（単体で開ける1ファイル）
```

## 公開（GitHub Pages）

`.github/workflows/pages.yml` が、push のたびにテスト・ビルド・公開を行う。
最初に一度だけ、リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** にする。

## ランキング

Supabase のプロジェクト「chemyth」につないである（`src/config.ts` の `RANKING`）。
表の定義は `supabase/migrations/0001_ranking.sql`。表には直接さわらせず、登録用と取得用の関数だけを公開している。
別のプロジェクトにつなぎ替えるときは、その SQL を実行して URL と publishable キーを書き換える。
接続できないとき（共有用の断片ページなど）は、端末内のノート同士の順位だけが出る。
