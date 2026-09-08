# meta・paramDef・res の責務

宣言型は [endpoints.ts](../../../../../packages/backend/src/server/api/endpoints.ts)、実行時の共通処理は [endpoint-handlers.ts](../../../../../packages/backend/src/server/rest/endpoint-handlers.ts) を照合する。型にあるフィールドがすべて共通処理で強制されるとは限らない。

## 共通 guard が適用する条件

`endpointHandler` と `endpointHandlerAnonymous` は `withEndpointGuards` を通る。body と token を読み、認証した後に以下を適用する。

| meta | 実行時の効果 |
| --- | --- |
| `requireCredential` / `requireModerator` / `requireAdmin` | いずれかが true なら資格情報必須。それ以外は optional credential の検査 |
| `secure` | サードパーティ token の利用を拒否する。呼び出し元 UI の身元保証ではない |
| `kind` | `server` 以外の指定 scope を検査する |
| `prohibitMoved` | 移行済み利用者を拒否する |
| `requireRolePolicy` | 指定 policy または root を要求する |
| `requireAdmin` / `requireModerator` | 対応する役割を検査する |
| `limit` | 認証された利用者がいる場合に meta の rate limit を適用する |

`prohibitMoved`・`requireRolePolicy` の検査には非 null 利用者が必要。これらや `secure` だけでは資格情報必須にならないため、meta の認証条件と wrapper を揃える。通常の認証必須・役割必須 API の `kind` は型の union に合わせ、値は [SDK permissions](../../../../../packages/misskey-js/src/consts.ts) を使う。

`requiredRolePolicy` も宣言型にはあるが、共通 guard が読む名前は `requireRolePolicy`。同じ効果とみなさず、変更対象のルート・ハンドラで実際の policy 判定まで追う。匿名ユーザー向けなど動的な判定は [role-policy.ts](../../../../../packages/backend/src/server/rest/role/role-policy.ts) の利用側を確認する。クライアントが送った policy 値を認可の根拠にしない。

匿名アクセスの IP 制限、独自ルートの追加制限は別責務。既存ルートが明示的にも rate limit を呼ぶ場合は、共通 guard との二重消費や判定順を確認する。multipart など wrapper を通らない経路は [API 登録](endpoint-registration.md) を参照する。

## 入力と応答

- `paramDef` は原則、ハンドラ側の既存 zod schema を meta から参照する。[parseApiParams](../../../../../packages/backend/src/server/rest/validation.ts) は検証失敗を API の invalid parameter にし、解析結果から undefined のプロパティを除く。wrapper 自体は endpoint の入力 schema を parse しないので、ルートまたはハンドラでの実行を確認する。
- ID・重複禁止の配列には [zod-params.ts](../../../../../packages/backend/src/misc/zod-params.ts) の `misskeyId`・`uniqueItems` を既存例に合わせて使う。省略、null、default、範囲、組合せ制約が利用側の契約に一致することを確認する。
- `res` は [Schema](../../../../../packages/backend/src/misc/json-schema.ts) の形式。packed entity は [models/json-schema](../../../../../packages/backend/src/models/json-schema/) の定義を参照する。optional と nullable は別の契約であり、実際に返す形と生成型を揃える。宣言は応答の実行時検証や情報削除を代行しない。
- `requireFile`、`allowGet`、`allowQuery`、`cacheSec` は共通 guard の認可条件ではない。multipart の解析、method 登録、安全で冪等な QUERY、匿名 cache の適用先をそれぞれ確認する。
- `tags`・`description`・`errors` 等の生成への反映は [gen-spec.ts](../../../../../packages/backend/src/server/api/openapi/gen-spec.ts) を参照する。出力変更時の SDK 再生成は [API 作業](../tasks/adding-api-endpoint.md) に従う。

## エラーと公開範囲

[ApiError](../../../../../packages/backend/src/server/rest/error.ts) と既存のエラーヘルパーを使い、業務エラーの status・code・id・message と meta 宣言を揃える。新しいエラーの ID は `crypto.randomUUID()` で生成し、別のエラーとの衝突を調べる。同じエラーの宣言と実装で同じ ID を使うことは必要な一致である。

meta への列挙漏れがあるだけで `ApiError` の応答が自動的に 500 になるわけではない。実際の status と公開される情報を調べ、未知の例外を既知の業務エラーとして隠さない。

認可済みの利用者にも、他人の非公開 note・file・プロフィール項目を返してよいとは限らない。取得、packing、cache、ActivityPub、streaming のうち変更が波及する経路で未許可情報が出ないことを確認する。
