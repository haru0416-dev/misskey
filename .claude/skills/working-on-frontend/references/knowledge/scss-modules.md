# SCSS Modules とテーマ

SFC の新しいスタイルは `<style lang="scss" module>` と `$style` を使う。module class は周辺と同じ camelCase とし、状態 class を組み合わせる。別部品内部への指定や global selector を増やす前に、所有する部品の props・slots・スタイルで解決できるか確認する。

## 値の参照先

- テーマ色: [frontend-shared/themes/_light.json5](../../../../../packages/frontend-shared/themes/_light.json5) と [_dark.json5](../../../../../packages/frontend-shared/themes/_dark.json5)。`--MI_THEME-*` を使い、背景と前景の意味を揃える。
- 余白・角丸・時間・コントロール寸法・意味付きの面や影: [design-tokens.scss](../../../../../packages/frontend/src/design-tokens.scss) の `--MI-*`。既存の `--MI-radius`、`--MI-margin` もここで定義される。固定の既定値を文書から写さず、定義を確認する。
- グローバル utility class: [style.scss](../../../../../packages/frontend/src/style.scss)。`_button`、`_panel`、`_gaps` など、実装と用途が合うものを再利用する。

テーマに従う色を固定の白・黒・RGB 値へ置き換えない。透明度調整には既存の color-mix パターンを使える。寸法をすべて変数にするためだけに新トークンを増やさず、既存の共通値と部品固有の計算を区別する。

`_button` は装飾のリセットで、部品のフォーカスや ripple をすべて提供するものではない。必要な操作性を持つ既存部品を使う。utility class の名前だけから padding、shadow、overflow の有無を推測しない。

## 表示で確認する

変更する画面を light/dark または影響するカスタムテーマで開き、前景・背景・境界線・フォーカスが判別できるかを見る。幅の変更は狭い画面、長い翻訳やユーザー名、画像読込後、スクロール位置への影響も確認する。

共有 theme を変更した場合は [frontend の theme.ts](../../../../../packages/frontend/src/theme.ts) と [embed の theme.ts](../../../../../packages/frontend-embed/src/theme.ts) の利用側を確認する。カタログで単独部品を見た結果と、実際の配置先で確認した結果を分けて報告する。
