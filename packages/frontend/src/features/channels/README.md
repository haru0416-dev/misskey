# Channels

チャンネルの一覧、preview、follow操作をまとめたfeature。

- `components/MkChannelList.vue`: API pagination付きchannel list
- `components/MkChannelPreview.vue`: channel概要card
- `components/MkChannelFollowButton.vue`: follow状態と切り替え

channel timelineと編集画面はroute単位の `pages/` が組み立て、このfeatureは再利用されるchannel UIを提供する。
