# Link preview

URLのmetadata取得、preview card、popup、YouTube playerをまとめたfeature。

- `components/MkLink.vue`: MFM内linkの表示とpreview起動
- `components/MkUrlPreview.vue`, `components/MkUrlPreviewPopup.vue`: URL cardとpopup
- `components/MkYouTubePlayer.vue`: YouTube埋め込みplayer
- `url-preview.ts`: preview metadataの取得とcache

global URL rendererはadapterとしてこのfeatureの `MkLink` を利用する。
