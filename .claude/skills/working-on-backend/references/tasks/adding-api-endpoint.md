# API を追加・変更する

共通条件は [AGENTS.md](../../../../../AGENTS.md)。まず利用者が受け取る結果、拒否する入力・権限、保存と後処理の成功条件を決める。新規 API だからという理由だけで新しいファイルや恒久テストを増やさない。

## 実装をつなぐ

1. 同じ認可・保存契約を持つ既存 endpoint の meta、ルート、ハンドラを読む。例は [notes の meta](../../../../../packages/backend/src/server/api/metas/notes.ts)、[notes の実装](../../../../../packages/backend/src/server/rest/endpoints/notes.ts)、[投稿処理](../../../../../packages/backend/src/server/rest/note/notes-create.ts)。
2. 既存の機能別ハンドラに入力 schema と処理を置き、必要な依存を `deps` で受ける。`paramDef` は既存の zod schema を共有し、[parseApiParams](../../../../../packages/backend/src/server/rest/validation.ts) を通る位置を確かめる。入力の型と検証を別々に再定義しない。
3. `server/api/metas/` に `defineContract({ meta, paramDef })` で登録する。新しいカテゴリなら [endpoint-metas.ts](../../../../../packages/backend/src/server/api/endpoint-metas.ts) に集約する。
4. `server/rest/endpoints/<category>.ts` の `implementEndpoints` に実装を足す。戻り値は meta.res、投げるエラーは meta.errors に型で縛られる。新しいカテゴリなら [endpoints/index.ts](../../../../../packages/backend/src/server/rest/endpoints/index.ts) に載せる。
5. multipart や独自の認証経路だけ `server/rest/routes/` に手で書き、近い既存ルートの認可・パラメータ処理・資源解放まで照合する。meta を置くだけでは独自経路に guard は掛からない。

登録の責務は [API 登録](../knowledge/endpoint-registration.md)、フィールド別の実行時効果は [meta・paramDef・res](../knowledge/api-meta-paramdef.md) を参照する。

## 保護する契約

- scope・role・停止・移行・ブロックの判定と、対象オブジェクトの所有権・公開範囲を分けて確認する。共通 guard 通過は、任意の note や file の取得許可を意味しない。
- 投稿処理を変更するなら REST だけでなく ActivityPub と予約投稿の利用側も追う。note・集計・outbox、および予約 draft のロック・再検証・投稿・削除の原子性を保つ。参照先は [サービス構成](../knowledge/service-architecture.md)。
- API の成功応答が DB 保存、queue 受理、外部配送のどこまでを保証するかを区別する。再実行で恒久的な副作用を重複させない。
- 既知の業務エラーは既存の `ApiError` と meta の契約を揃える。想定外の例外をクライアントエラーや成功応答へ置き換えない。

## 型生成と確認

`meta`・`paramDef`・`res`、参照する packed entity schema を変更したら、ルートで `bun run build-misskey-js-with-types` を実行する。[package.json](../../../../../package.json) のこのスクリプトが backend build、OpenAPI 出力、SDK 自動生成と型成果物までをつなぐ。生成された差分を変更に含める。再生成して差分が出ないこと自体は失敗ではなく、実行結果と契約への反映を確認する。

HTTP を通して、許可された利用者の結果と拒否時に副作用がないことを確かめる。公開範囲・競合・再実行など現実的な回帰を検出する既存テストを維持し、不足する重要な境界だけ恒久テストにする。一度限りの動作確認は一時シナリオでよい。[backend 検証](../knowledge/backend-testing.md) に実行先と前提をまとめる。

完了報告では変更した API 契約、生成結果、実際に通した経路、未確認を区別する。共通の提出条件をここで別管理しない。
