# API の登録と実行経路

## 宣言と実ルートをつなぐ

| 入口 | 責務 |
| --- | --- |
| `server/rest/contracts/` → [endpoint-metas.ts](../../../../../packages/backend/src/server/rest/endpoint-metas.ts) | endpoint 名と meta・入力 schema を集約する |
| [endpoint-catalog.ts](../../../../../packages/backend/src/server/rest/endpoint-catalog.ts) → [OpenAPI 生成](../../../../../packages/backend/src/server/rest/openapi/gen-spec.ts) | API 情報と SDK 生成の入力を作る |
| `server/rest/endpoints/` → [shell.ts](../../../../../packages/backend/src/server/rest/shell.ts) | 契約ごとの実装を HTTP method/path に登録する |
| [endpoint-guards.ts](../../../../../packages/backend/src/server/rest/endpoint-guards.ts) | meta から認証・認可・回数制限を実行する |
| `server/rest/routes/` | 契約から登録できない手書きルート (multipart・サインイン系など) |

meta はドキュメント専用ではない。一方、meta の追加だけで HTTP ルートが自動生成されるわけでもない。契約に対する実装が無ければ型エラーになるが、カテゴリを [endpoints/index.ts](../../../../../packages/backend/src/server/rest/endpoints/index.ts) に載せなければ登録されない。

## 契約から登録する

JSON API はすべて、`rest/contracts/<category>.ts` の `defineContract` (meta・入力) と [rest/endpoints/](../../../../../packages/backend/src/server/rest/endpoints/) の `implementEndpoints` (実装) を、[endpoints/index.ts](../../../../../packages/backend/src/server/rest/endpoints/index.ts) の `registerContractEndpoints` がまとめて登録する (登録の本体は [endpoint-definition.ts](../../../../../packages/backend/src/server/rest/endpoint-definition.ts))。

- HTTP メソッドは `allowGet`・`allowQuery`、匿名の公開キャッシュは `cacheSec` から決まる。wrapper の選択や `app.on` の手書きは無い。
- 認証・権限・回数制限は meta からだけ掛かる。ルートで同じ枠を数え直さない。
- 実装は検証済みの `input` を受け取り、戻り値は meta.res から導いた型に合わなければ型エラーになる。`res` の無いエンドポイントは `undefined` を返し 204 になる。
- 業務エラーは `errors.<meta.errors のキー>()` で作る。サービスの `IdentifiableError` は id が宣言と一致すれば宣言どおりの API エラーになる。宣言に無い `ApiError` が実装から出るとテスト環境では 500 になる。
- 入力の定義は 1 つにする。実行時の検証と OpenAPI 用で定義を分けると、契約側の定義で先に検証したときに実装が読むキーが落ちる。
- 契約のキーと実装のキーは 1 対 1 でないと型エラーになる。カテゴリの一部だけを移すときは `pickContracts` で選ぶ。

## 手書きのルート

新カテゴリでは、meta の集約 ([endpoint-metas.ts](../../../../../packages/backend/src/server/rest/endpoint-metas.ts)) と実装の集約 ([endpoints/index.ts](../../../../../packages/backend/src/server/rest/endpoints/index.ts)) の両方に追加する。endpoint-metas のキー順は既存の UTF-16 コード単位順を維持する。

multipart の [drive/files/create](../../../../../packages/backend/src/server/rest/routes/drive.ts) のように契約から登録できないルートは `routes/` に残る。これらは `applyEndpointGuards` を直接呼び、meta の条件を手で揃える。ファイルの `cleanup()` は成功・失敗とも `finally` で呼ぶ。認証・認可の拒否境界は [e2e/api.ts](../../../../../packages/backend/test/e2e/api.test.ts) で実 HTTP を通して確認する。共通登録経路の回数制限は [endpoint-definition](../../../../../packages/backend/test/unit/server/rest/endpoint-definition.test.ts) で、認証済みの最初の要求が成功し、次の要求が 429 になることを確認する。

## 完了の観測

meta・実ルート・schema の名前と存在だけでは到達性や認可は証明できない。対象 method/path へ HTTP リクエストを送り、応答と許可・拒否の境界を確認し、OpenAPI/SDK にも契約が反映されていることを確認する。

- ルート未配線なら API 情報にあっても実アクセスは失敗する。
- meta 未集約なら生成物から漏れ、共通 guard からも正しい定義を参照できない。
- 手書きルートで別 endpoint 名の meta を渡すと、別の認可条件が適用され得る。

フィールドの適用範囲は [meta・paramDef・res](api-meta-paramdef.md)、変更全体は [API 作業](../tasks/adding-api-endpoint.md) を参照する。
