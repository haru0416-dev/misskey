# Post composer

ノートの新規作成、編集、下書き、添付、投票編集、previewをまとめたfeature。

- `components/MkPostForm.vue`: composer本体と送信処理
- `components/MkPostFormDialog.vue`: popup/dialog用container
- `components/MkPostFormAttaches.vue`: 添付fileの並べ替えと編集
- `components/MkPostForm.TextCounter.vue`: 文字数表示
- `components/MkPollEditor.vue`: 投票入力
- `components/MkNotePreview.vue`: 送信前preview
- `components/MkNoteDraftsDialog.vue`: 下書きの選択と削除

送信後のnote表示とinteractionは `notes/`、file選択とupload queueは `drive/`、絵文字選択は `emoji-picker/` が所有する。
