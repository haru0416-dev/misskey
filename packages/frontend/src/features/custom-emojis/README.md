# Custom emojis

カスタム絵文字のcache、解決、詳細表示、remote編集、mute状態をまとめたfeature。

- `custom-emojis.ts`: instanceの絵文字cacheと名前・alias解決
- `components/MkCustomEmojiDetailedDialog.vue`: 絵文字情報とaction表示
- `components/MkRemoteEmojiEditDialog.vue`: remote絵文字のimport・編集
- `emoji-mute.ts`: 絵文字単位のmute keyと永続状態

絵文字pickerとpalette操作は `emoji-picker/`、画像描画adapterは `components/global/MkCustomEmoji.vue` が担当する。
