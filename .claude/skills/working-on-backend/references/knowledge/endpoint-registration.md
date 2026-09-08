# API の登録と実行経路

## 宣言と実ルートをつなぐ

| 入口 | 責務 |
| --- | --- |
| `server/api/metas/` → [endpoint-metas.ts](../../../../../packages/backend/src/server/api/endpoint-metas.ts) | endpoint 名と meta・入力 schema を集約する |
| [endpoints.ts](../../../../../packages/backend/src/server/api/endpoints.ts) → [OpenAPI 生成](../../../../../packages/backend/src/server/api/openapi/gen-spec.ts) | API 情報と SDK 生成の入力を作る |
| `server/rest/routes/` → [shell.ts](../../../../../packages/backend/src/server/rest/shell.ts) | HTTP method/path とハンドラを実際に登録する |
| [endpoint-handlers.ts](../../../../../packages/backend/src/server/rest/endpoint-handlers.ts) | 指定 endpoint の meta を読み、認証・認可・利用者単位の制限を実行する |

meta はドキュメント専用ではない。一方、meta の追加だけで HTTP ルートが自動生成されるわけでもない。通常ルートでは path と wrapper に渡す endpoint 名を一致させる。

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
