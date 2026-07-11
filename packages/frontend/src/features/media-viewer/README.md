# Media viewer

Drive fileとして配信される画像、音声、動画の表示と閲覧操作をまとめたfeature。

- `components/MkMediaImage.vue`: blurhash、拡大表示、センシティブ画像の表示
- `components/MkMediaAudio.vue`, `components/MkMediaVideo.vue`: media player
- `components/MkMediaList.vue`: 複数mediaのlayout
- `components/MkMediaBanner.vue`: compactな添付表示
- `components/MkMediaRange.vue`: player用range input
- `components/MkImgWithBlurhash.vue`: blurhash placeholder付き画像
- `components/MkImgPreviewDialog.vue`: 画像preview dialog
- `media-has-audio.ts`: videoのaudio track判定
- `sensitive-file.ts`: 閲覧設定に基づく初期非表示判定

file選択とuploadは `drive/`、note内でのmedia配置は `notes/` が所有する。このfeatureはmediaの再生・閲覧stateだけを扱う。
