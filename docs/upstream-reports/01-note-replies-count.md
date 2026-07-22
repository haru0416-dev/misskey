# #01 返信ノートの並行削除で親の `repliesCount` が二重減算され負値化する

- **対象**: `misskey-dev/misskey` develop (`2026.7.0-beta.2`)、2026-07-22 実ソースで再現
- **種別**: 気づかれていないバグ（データ整合性）
- **意図判定**: **未報告バグ**。同型の `ReactionService` 削除経路は `result.affected !== 1` を
  検査してから減算しているのに、`NoteDeleteService` / `UserFollowingService` には適用されていない
  ＝パターンの適用漏れ。該当の open issue / fix PR は見つからず。
- **提出先**: 公開 issue + PR

## Summary

同じ返信ノートに対する削除リクエストが 2 本ほぼ同時に到達すると、親ノートの `repliesCount` が
2 減る。削除自体は冪等（2 本目は 0 行削除）だが、親カウンタの減算が**無条件**かつ削除の
affected 行数を見ないため、1 件の削除に対し減算が 2 回走る。`repliesCount = repliesCount - 1`
にクランプが無いため恒久的に過少・**負値化**しうる。`notesCount` チャート等も同様に二重減算。

トリガー例: 削除ボタンの二度押し、クライアントの再送、ユーザー自身の削除とモデレータ削除の競合。

## Root cause

`packages/backend/src/core/NoteDeleteService.ts` の `delete()`:

```ts
// L66-68: 親カウンタを無条件に減算 (削除が成功したかに関わらず)
if (note.replyId) {
	await this.notesRepository.decrement({ id: note.replyId }, 'repliesCount', 1);
}
// ...
// L113: 削除。affected 行数を検査していない (冪等)
await this.notesRepository.delete({
	id: note.id,
	userId: user.id,
});
```

2 本の delete が両方とも `note`(replyId 付き) を非 null で観測 → 両方が親を `-1` → 片方だけが
実削除・もう片方は 0 行削除で無エラー。対照的に `ReactionService.delete()` は
`const result = await ...delete(); if (result.affected !== 1) ...` として二重適用を防いでいる。

同型: `UserFollowingService.decrementFollowing()`（L408-419）も `followingCount`/`followersCount`
を無条件 `decrement` するため、並行 unfollow で同じ二重減算が起きる。

## Reproduction

`repros/note-replies-count.repro.ts`（upstream `test/unit/` に置いて実行）。
親 `repliesCount=1`・返信 1 件を作り、「2 本の削除が両方とも返信を非 null 観測してから各自
decrement+delete する」並行スケジュールを再現する。

**現行 develop の結果（実測）**: `parent.repliesCount = -1`（期待 `0`）→ テスト失敗。

## Expected vs Actual

- Expected: 返信 1 件の削除に対応する親カウンタの減算は 1 回 → `repliesCount = 0`
- Actual: `repliesCount = -1`（二重減算・負値化）

## Proposed fix

削除を先に行い、その affected 行数を「実際に自分が消したか」の権威ゲートにする
（`ReactionService` と同じパターン）。`patches/01-note-replies-count.patch`（検証済み: 適用後に
repro が通る）:

```diff
 		const deletedAt = new Date();

+		// Delete first and use the affected-row count as the authoritative guard, so that
+		// two concurrent delete requests for the same note don't both apply the side effects
+		// below. Otherwise the parent's repliesCount (and other counters) get decremented
+		// once per racing request and can drift negative.
+		const deleteResult = await this.notesRepository.delete({
+			id: note.id,
+			userId: user.id,
+		});
+		if (deleteResult.affected !== 1) return;
+
 		if (note.replyId) {
 			await this.notesRepository.decrement({ id: note.replyId }, 'repliesCount', 1);
 		}
```

（末尾の元の `delete` は除去。`UserFollowingService` 側にも同じ考え方の別 PR を出すとよい。）
