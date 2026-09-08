# サービス・依存・副作用の境界

## 依存の所有者を追う

backend は DI コンテナではなく、明示的な引数と factory で依存を渡す。

- DB 操作の例は [UserStore.ts](../../../../../packages/backend/src/core/user/UserStore.ts)。呼び出し元の `db` を受け取り、必要な transaction を同じ接続経路に渡す。
- 設定や状態を閉じ込める例は [MfmService.ts](../../../../../packages/backend/src/core/mfm/MfmService.ts) の `createMfmService` と `ReturnType`。
- API ハンドラは必要な依存を `deps` 第一引数で受ける。[shell.ts](../../../../../packages/backend/src/server/rest/shell.ts) の `ApiShellDependencies` と、その実体を組む [runtime-dependencies.ts](../../../../../packages/backend/src/runtime-dependencies.ts)・[boot/server.ts](../../../../../packages/backend/src/boot/server.ts) までつなぐ。型にフィールドを足すだけでは実体は供給されない。

既存の関数・factory を使うかは、認可、保存、失敗、資源解放の契約が合うかで判断する。状態を持たない処理に管理層を増やさず、逆に transaction や資源所有を表す境界を行数のために潰さない。

## DB 接続と transaction

[runtime-dependencies.ts](../../../../../packages/backend/src/runtime-dependencies.ts) は Bun の有無、`MK_DB_DRIVER`、解決済みの接続予算から DB 実装を選ぶ。Bun 上でも `pg` 指定または予算が 2 未満なら [drizzle.ts](../../../../../packages/backend/src/drizzle.ts) 側となり、それ以外の Bun 経路は [db/bun-sql.ts](../../../../../packages/backend/src/db/bun-sql.ts) を使う。型名や起動コマンドだけから実ドライバを断定しない。

transaction 内の操作を通常の `deps.db` に戻すと原子性を失う。変更する store、ネストした処理、outbox への書込みまで渡す DB を追う。接続予算・セッション状態・dispose の責務は composition root と各ドライバを確認する。

## 投稿と予約投稿

[notes-create.ts](../../../../../packages/backend/src/server/rest/note/notes-create.ts) の保存処理は note・poll、関連集計、post-create outbox を transaction にまとめる。投稿処理の利用側を変えるときは REST、ActivityPub、予約投稿の共有範囲を確認する。

[post-scheduled-note.ts](../../../../../packages/backend/src/queue/handlers/post-scheduled-note.ts) は draft を `FOR UPDATE` でロックし、現在の fingerprint を再検証し、投稿と draft 削除を同じ transaction で確定する。ロック前の読取結果だけで投稿したり、削除を別 transaction に分けたりしない。編集済み draft、並行 job、失敗後の再実行で二重投稿・消失がないことを観測する。

## 永続的な後処理

[QueueOutboxStore.ts](../../../../../packages/backend/src/core/queue/QueueOutboxStore.ts) と各 queue handler で、永続化、queue 投入、実処理、完了記録を区別する。job ID だけで外部副作用が一度になるとはみなさない。リース失効や途中失敗の後で再実行されても、配送先・削除対象・最終状態が契約を満たすことを確認する。

投稿の outbox 対象ステージと analytics は同じ完了保証ではない。後処理を移す場合は、加算の二重計上、未処理の喪失、応答後の無制限な並行書込みを確認する。成功応答が外部配送完了まで保証するという説明を加えない。

公開範囲を変える処理では、配送先だけでなく取得・packing・cache・streaming からの漏洩も対象にする。検証先は [backend 検証](backend-testing.md)。
