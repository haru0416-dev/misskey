# Emoji picker

絵文字の検索、パレット選択、投稿用picker、リアクション用pickerをまとめたfeature。

- `components/`: picker本体、section、popup dialog
- `emoji-picker.ts`: 投稿フォーム向けpickerのライフサイクル
- `reaction-picker.ts`: ノートへのリアクション向けpickerのライフサイクル
- `emoji-palette.ts`: パレット選択と追加操作

絵文字画像の描画自体はグローバルな `MkEmoji` / `MkCustomEmoji` が担当する。このfeatureは選択操作だけを所有し、オートコンプリート用検索、絵文字キャッシュ、instance stateを複製しない。
