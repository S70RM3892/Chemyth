# Chemyth

大学受験化学（共通テスト〜京大二次）を、工場自動化パズルとして学ぶタブレット向けブラウザゲーム。
資源地から原料を採り、装置に反応を自分で設定し、指定された物質を納品する。

- 計画：[docs/PLAN.md](docs/PLAN.md)
- 物質・反応・納品目標のデータ：`src/content/`
- エンジン：`src/engine/`、画面：`src/ui/`

```
npm install
npm test         # 原子数の収支、採点、工場の動作
npm run build    # dist/index.html（単体で開ける1ファイル）
```
