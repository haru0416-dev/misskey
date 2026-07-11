# Notes

ノートの表示、会話、投票、リアクション、timeline描画をまとめたfeature。

- `components/MkNote*`: 通常・詳細・簡易・sub noteの表示
- `components/MkSubNoteContent.vue`: reply/renote内の本文
- `components/MkPoll.vue`: 投票の表示と投票操作
- `components/MkReaction*`, `components/MkReactionsViewer*`: リアクション表示と操作
- `components/MkNotesTimeline.vue`, `components/MkStreamingNotesTimeline.vue`: paginationとstreamingのtimeline表示
- `useNoteCapture.ts`: streaming eventを表示中のnote stateへ反映
- `get-note-menu.ts`: note action menu
- `get-appear-note.ts`, `get-note-summary.ts`: renote解決と通知用summary
- `check-reaction-permissions.ts`: reaction可否判定
- `timeline-date-separate.ts`: timelineの日付境界判定

投稿フォームは別の作成フローとして今後分離する。このfeatureは表示中noteとそのinteractionを所有し、Driveや絵文字pickerの内部stateは所有しない。
