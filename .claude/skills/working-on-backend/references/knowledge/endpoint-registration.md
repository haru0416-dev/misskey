# API の登録と実行経路

## 宣言と実ルートをつなぐ

| 入口 | 責務 |
| --- | --- |
| `server/api/metas/` → [endpoint-metas.ts](../../../../../packages/backend/src/server/api/endpoint-metas.ts) | endpoint 名と meta・入力 schema を集約する |
| [endpoints.ts](../../../../../packages/backend/src/server/api/endpoints.ts) → [OpenAPI 生成](../../../../../packages/backend/src/server/api/openapi/gen-spec.ts) | API 情報と SDK 生成の入力を作る |
| `server/rest/routes/` → [shell.ts](../../../../../packages/backend/src/server/rest/shell.ts) | HTTP method/path とハンドラを実際に登録する |
| [endpoint-handlers.ts](../../../../../packages/backend/src/server/rest/endpoint-handlers.ts) | 指定 endpoint の meta を読み、認証・認可・利用者単位の制限を実行する |

meta はドキュメント専用ではない。一方、meta の追加だけで HTTP ルートが自動生成されるわけでもない。通常ルートでは path と wrapper に渡す endpoint 名を一致させる。

## 契約から登録する

移行済みのカテゴリは、`api/metas/<category>.ts` の `defineContract` (meta・入力) と [rest/endpoints/](../../../../../packages/backend/src/server/rest/endpoints/) の `implementEndpoints` (実装) を、[endpoints/index.ts](../../../../../packages/backend/src/server/rest/endpoints/index.ts) の `registerContractEndpoints` がまとめて登録する (登録の本体は [endpoint-definition.ts](../../../../../packages/backend/src/server/rest/endpoint-definition.ts))。

- HTTP メソッドは `allowGet`・`allowQuery`、匿名の公開キャッシュは `cacheSec` から決まる。wrapper の選択や `app.on` の手書きは無い。
- 認証・権限・回数制限は meta からだけ掛かる。ルートで同じ枠を数え直さない。
- 実装は検証済みの `input` を受け取り、戻り値は meta.res から導いた型に合わなければ型エラーになる。`res` の無いエンドポイントは `undefined` を返し 204 になる。
- 業務エラーは `errors.<meta.errors のキー>()` で作る。サービスの `IdentifiableError` は id が宣言と一致すれば宣言どおりの API エラーになる。宣言に無い `ApiError` が実装から出るとテスト環境では 500 になる。
- 入力の定義は 1 つにする。実行時の検証と OpenAPI 用で定義を分けると、契約側の定義で先に検証したときに実装が読むキーが落ちる。
- 契約のキーと実装のキーは 1 対 1 でないと型エラーになる。カテゴリの一部だけを移すときは `pickContracts` で選ぶ。

## 既存の配線を使う

[notes のルート](../../../../../packages/backend/src/server/rest/routes/notes.ts) の `notes/create` は `endpointHandler(deps, 'notes/create', ...)`、`notes/show` は `endpointHandlerAnonymous` を使う。前者の callback の非 null 型は wrapper 名による型付けであり、実際の認証必須条件は meta にある。匿名 API を前者に渡しても認証必須にはならない。

新カテゴリでは、meta の import・集約と、ルート関数の import・`registerXxxRoutes(app, deps)` の両方を追加する。endpoint-metas のキー順は既存の UTF-16 コード単位順を維持する。

multipart の [drive/files/create](../../../../../packages/backend/src/server/rest/routes/drive.ts) のように wrapper を通らないルートもある。これらは実際の認証・scope・制限を個別に照合し、ファイルの `cleanup()` を成功・失敗とも `finally` で呼ぶ。

GET・QUERY の許可宣言と、実際に登録する method・入力変換を照合する。`allowGet`・`allowQuery` は共通 guard がルートを作る指示ではない。認証付き応答を匿名用の public cache に流さない。

## 完了の観測

meta・実ルート・schema の名前と存在だけでは到達性や認可は証明できない。対象 method/path へ HTTP リクエストを送り、応答と許可・拒否の境界を確認し、OpenAPI/SDK にも契約が反映されていることを確認する。

- ルート未配線なら API 情報にあっても実アクセスは失敗する。
- meta 未集約なら生成物から漏れ、共通 guard からも正しい定義を参照できない。
- 別 endpoint 名を wrapper に渡すと、別の認可条件が適用され得る。

フィールドの適用範囲は [meta・paramDef・res](api-meta-paramdef.md)、変更全体は [API 作業](../tasks/adding-api-endpoint.md) を参照する。
