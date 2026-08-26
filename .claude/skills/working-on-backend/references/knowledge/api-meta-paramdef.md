# API endpoint の meta / paramDef / res 完全早見表

[`IEndpointMeta`](../../../../../packages/backend/src/server/api/endpoints.ts) の全フィールドと `paramDef` (zod) の実用パターン、それと PR レビューで頻発する落とし穴を 1 つにまとめたページ。新規 / 既存 endpoint 編集時に開く。

`meta` の宣言 (`server/api/metas/<category>.ts`) と、実際にそれを強制するコード (`server/rest/routes/<category>.ts`) は **別ファイル・手動同期**。この点は → [endpoint-registration.md](endpoint-registration.md) を先に読むこと。

## 目次

- [全フィールド一覧](#全フィールド一覧)
- [権限制限フィールドの使い分け](#権限制限フィールドの使い分け)
- [`kind` の値](#kind-の値)
- [`errors` の書き方](#errors-の書き方)
- [`res` の書き方](#res-の書き方)
- [`paramDef` (zod) 実用パターン](#paramdef-zod-実用パターン)
- [OpenAPI への反映マップ](#openapi-への反映マップ)
- [落とし穴](#落とし穴)

## 全フィールド一覧

[endpoints.ts](../../../../../packages/backend/src/server/api/endpoints.ts) の `IEndpointMetaBase` 型より。

| フィールド | 型 | デフォルト | 用途 |
|---|---|---|---|
| `stability` | `'deprecated' \| 'experimental' \| 'stable'` | (未指定) | 安定度のヒント。`'deprecated'` を付けた API は新規利用を避ける |
| `tags` | `ReadonlyArray<string>` | — | OpenAPI タグ。実質 `tags[0]` のみが反映される |
| `errors` | `Record<key, { message, code, id }>` | — | クライアントに返す業務エラー定義 (**ドキュメント用の宣言**。実際に throw するのは別途ハンドラ内の `HonoApiError`)。各 `id` は UUID v4 で一意 |
| `res` | `Schema` (`@/misc/json-schema.js`) | — | レスポンス JSON Schema。`ref: 'Note'` のような packed entity 参照も可 |
| `requireCredential` | `boolean` | `false` | 認証必須か。**宣言のみ**。実際の強制はルート側で `assertCredential(auth)` を呼ぶこと。`true` のとき `kind` を必ず設定する |
| `requireModerator` | `boolean` | `false` | isModerator ロール必須。`true` のとき `kind` 必須 |
| `requireAdmin` | `boolean` | `false` | isAdministrator ロール必須。`true` のとき `kind` 必須 |
| `requiredRolePolicy` | `KeyOf<'RolePolicies'>` | (未指定) | 特定のロールポリシー (例: `'canCreateChannel'`) を満たすロールを要求 |
| `prohibitMoved` | `boolean` | `false` | アカウント移行済ユーザーを拒否。**宣言のみ**。強制はルート側で `assertProhibitMoved(auth.user)` を呼ぶこと |
| `limit` | `{ key?, duration?, max?, minInterval? }` | なし | レート制限。**宣言のみ**。強制はルート側で `assertHonoApiRateLimitForUser(deps, '<name>', { duration, max }, user)` を呼び、値を meta と揃える |
| `requireFile` | `boolean` | `false` | multipart/form-data でファイル添付必須。ドキュメント用の宣言 |
| `secure` | `boolean` | `false` | サードパーティアプリからは利用不可。OpenAPI に "Internal Endpoint" 表記が出る |
| `kind` | `(typeof permissions)[number]` | — | OAuth スコープ。`'read:account'` / `'write:notes'` 等。型は require* 系と相互排他制約あり。**宣言のみ**。強制はルート側で `assertTokenPermission(auth, '<kind文字列>')` を呼ぶこと |
| `description` | `string` | — | OpenAPI の operation description に入る |
| `allowGet` | `boolean` | `false` | GET メソッドを許可するか (デフォルトは POST のみ)。ルート側で `app.get(...)` と `app.post(...)` の両方を登録する必要がある |
| `cacheSec` | `number` | — | 正常応答に `Cache-Control: public, max-age=<秒>` を付与。ルート側で `publicCacheHeadersWhenAnonymous` 等のヘルパーを使って自分で付与する |

**重要**: 上記の「宣言のみ」フィールドは、`meta` に書いただけでは何も起こらない。**ルート (`server/rest/routes/<category>.ts`) 側で対応する assert/helper 呼び出しを書かない限り実行時には反映されない**。meta とルートの内容が食い違っていても自動検知するツールは無いので、レビュー時に人間が両方を見比べる。

## 権限制限フィールドの使い分け

[endpoints.ts](../../../../../packages/backend/src/server/api/endpoints.ts) で型ユニオンとして表現されており、組み合わせに制約がある:

| ケース | `requireCredential` | `requireModerator` | `requireAdmin` | `kind` |
|---|---|---|---|---|
| 認証不要 | `false` または省略 | (省略) | (省略) | 不要 |
| 一般ユーザー認証必須 | `true` | (省略) | (省略) | **必須** (`'read:account'` 等) |
| モデレーター以上必須 | (省略) | `true` | (省略) | **必須** (例: `'read:admin:show-user'`) |
| 管理者必須 | (省略) | (省略) | `true` | **必須** (例: `'write:admin:emoji'`) |
| Misskey 本体専用 (`secure: true`) | 任意 | 任意 | 任意 | **不要** (型 union で除外) |

ルート側でモデレーター/管理者判定を行うには [role-policy.ts](../../../../../packages/backend/src/server/rest/role/role-policy.ts) の `isHonoApiModerator(deps, user)` / `isHonoApiAdministrator(deps, user)` を呼ぶ (root ユーザーは常に true を返す)。

加えて以下も使える:

- **`requiredRolePolicy: 'canCreateChannel'`** — 特定のロールポリシーが許可されているユーザーだけに絞る。ルート側では [role-policy.ts](../../../../../packages/backend/src/server/rest/role/role-policy.ts) の `getHonoApiRolePolicies(deps, user)` を呼んで `policies.<policyName>` を判定する ([server/rest/notes.ts](../../../../../packages/backend/src/server/rest/note/notes.ts) の `notes/global-timeline` 相当処理が `policies.gtlAvailable` をこの方法でチェックしている)。匿名ユーザーにも判定したい場合は `user` に `null` を渡せる (`getHonoApiRolePolicies` は `user: MiUser | null` を受け付ける)。ロールポリシーの型一覧は [`role-policies.ts`](../../../../../packages/backend/src/core/role/role-policies.ts) の `RolePolicies` を参照
- **`secure: true`** — Misskey 本体フロントエンドからしか叩けないようにする (OAuth トークンで叩けなくなる)。上記の通り `kind` は不要

## `kind` の値

完全な一覧は [`packages/misskey-js/src/consts.ts`](../../../../../packages/misskey-js/src/consts.ts) の `permissions` 配列。代表例:

| パターン | 例 |
|---|---|
| 一般 read | `'read:account'`, `'read:notifications'`, `'read:drive'`, `'read:reactions'` |
| 一般 write | `'write:account'`, `'write:notes'`, `'write:reactions'`, `'write:drive'` |
| Admin read | `'read:admin:meta'`, `'read:admin:server-info'`, `'read:admin:show-user'`, `'read:admin:user-ips'` |
| Admin write | `'write:admin:reset-password'`, `'write:admin:suspend-user'`, `'write:admin:emoji'`, `'write:admin:roles'` |

新しい操作領域を追加する場合は `consts.ts` の `permissions` 配列にも追加する必要がある。

## `errors` の書き方

`meta.errors` はドキュメント/misskey-js 型生成用の **宣言**。実際に throw するのは、ハンドラファイル (`server/rest/<feature>.ts`) 内に手書きするローカルなエラーファクトリ関数で、`message` / `code` / `id` の値を **meta 側と完全一致させる** 必要がある (どちらか片方だけ更新すると齟齬が生まれ、検知するツールは無い)。

```ts
// server/api/metas/notes.ts 側の宣言
errors: {
	noSuchRenoteTarget: {                                    // ← キーは camelCase
		message: 'No such renote target.',                   // ← 英語ハードコード (バックエンドに i18n 機構なし)
		code: 'NO_SUCH_RENOTE_TARGET',                        // ← code は SCREAMING_SNAKE_CASE
		id: 'b5c90186-4ab0-49c8-9bba-a1f76c282ba4',           // ← UUID v4。リポジトリ内で一意
	},
},
```

```ts
// server/rest/notes-delete.ts 側の実装 (HonoApiError, ../error.js)
function noSuchRenoteTargetError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such renote target.',   // ← meta.errors と同じ文字列
		code: 'NO_SUCH_RENOTE_TARGET',        // ← meta.errors と同じ
		id: 'b5c90186-4ab0-49c8-9bba-a1f76c282ba4', // ← meta.errors と同じ UUID
	});
}

// ハンドラ内で
if (renote == null) throw noSuchRenoteTargetError();
```

[HonoApiError](../../../../../packages/backend/src/server/rest/error.ts) は `status` / `message` / `code` / `id` / `kind?` ('client' デフォルト / 'server' / 'permission') / `headers?` / `info?` を受け取る。`invalidParamError(info)` / `credentialRequiredError()` / `permissionDeniedError()` 等の汎用ヘルパーも同ファイルにあるので、認証・パーミッション系の定型エラーは自分で書かずそちらを使う。

命名規則 (既存実装で一貫):

- キー: `camelCase` (`noSuchNote`, `cannotReRenote`, `alreadyBlocking`, `youHaveBeenBlocked`)
- `code`: `SCREAMING_SNAKE_CASE` (`'NO_SUCH_NOTE'`, `'CANNOT_RENOTE_TO_A_PURE_RENOTE'`)
- 接頭辞パターン: `NO_SUCH_*` / `CANNOT_*` / `ALREADY_*` / `TOO_MANY_*` / `INVALID_*` / `*_REQUIRED`

`HonoApiError` の `info` フィールドはレスポンス JSON の `error.info` として返却される (第 2 引数相当)。

## `res` の書き方

`paramDef` とは異なり、`res` は今も JSON Schema 形式のまま (zod 化されていない):

```ts
// 単純なオブジェクト
res: {
	type: 'object',
	optional: false, nullable: false,
	properties: {
		count: { type: 'integer' },
	},
},

// packed entity 参照
res: {
	type: 'object',
	optional: false, nullable: false,
	ref: 'Note',                  // ← packages/backend/src/models/json-schema/*.ts の定義名
},

// 配列
res: {
	type: 'array',
	optional: false, nullable: false,
	items: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'Note',
	},
},
```

各プロパティに `optional: false, nullable: false` を **必ず明示する**。省略すると schema が緩くなり、生成される misskey-js 型も曖昧になる。

## `paramDef` (zod) 実用パターン

`paramDef` は **zod schema**。ハンドラファイル (`server/rest/<feature>.ts`) 側で定義し、`meta` ファイルはそれを import して渡すだけ (二重定義しない)。実行時の検証は [validation.ts](../../../../../packages/backend/src/server/rest/validation.ts) の `parseHonoApiParams(schema, body)` が行う。

### 基本パターン

```ts
import { z } from 'zod';
import { misskeyId } from '@/misc/zod-params.js';

export const notesShowParamDef = z.object({
	noteId: misskeyId(),                                       // 必須 ID (旧 `format: 'misskey:id'` 相当)
	text: z.string().min(1).max(500).optional(),                // 文字長制約
	count: z.number().int().min(0).max(100).optional().default(10),
	isPublic: z.boolean().optional().default(false),
	visibility: z.enum(['public', 'home', 'followers', 'specified']).optional(),
});
```

`misskeyId()` ([misc/zod-params.ts](../../../../../packages/backend/src/misc/zod-params.ts)) が旧 AJV `format: 'misskey:id'` の代替。`as const` は不要 (zod の `z.infer<typeof schema>` がそのまま型推論される)。

### ページネーション (sinceId / untilId / limit)

[server/rest/i.ts](../../../../../packages/backend/src/server/rest/account/i.ts) の `iSigninHistoryParamDef`:

```ts
export const iSigninHistoryParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});
```

drizzle クエリへの反映は TypeORM 時代の `QueryService.makePaginationQuery` のようなヘルパーではなく、各ハンドラが drizzle の `and()` / `gt()` / `lt()` 等を直接組み立てる (ハンドラ実装は都度異なるので、近い既存ハンドラを参照すること)。

### 配列とアイテム制約

```ts
import { uniqueItems } from '@/misc/zod-params.js';

export const paramDef = z.object({
	// 一意・最小1・最大100 個のID リスト
	noteIds: uniqueItems(z.array(misskeyId()).min(1).max(100)),
});
```

`uniqueItems()` ([misc/zod-params.ts](../../../../../packages/backend/src/misc/zod-params.ts)) が旧 JSON Schema `uniqueItems: true` の代替 (zod に組み込みが無いための `refine` ラッパー)。`.refine()` は array 固有メソッド (`.min()` / `.max()`) を消費するため、**必ず最後に適用する**。

### `oneOf` / `anyOf` 相当 (排他的選択)

複数のリクエストパラメータ形態を許す場合は zod の `.refine()` や `z.union()` で表現する:

```ts
export const paramDef = z.object({
	userId: misskeyId().optional(),
	username: z.string().optional(),
	host: z.string().nullable().optional(),
}).refine(v => v.userId != null || v.username != null, {
	message: 'either userId or username is required',
});
```

`res` 側は今も JSON Schema なので `oneOf` がそのまま使える ([server/api/metas/misc.ts](../../../../../packages/backend/src/server/api/metas/misc.ts) の `ap/show` 相当の `res`):

```ts
res: {
	optional: false, nullable: false,
	oneOf: [
		{ type: 'object', properties: { type: { enum: ['User'] }, object: { ref: 'UserDetailedNotMe' } } },
		{ type: 'object', properties: { type: { enum: ['Note'] }, object: { ref: 'Note' } } },
	],
},
```

### 動的キー (旧 `additionalProperties`)

```ts
export const paramDef = z.object({
	data: z.record(z.string(), z.union([z.number()])),
});
```

`z.record(keySchema, valueSchema)` が「任意のキー → 値の型」を表す。

### `default` (値補完)

```ts
export const paramDef = z.object({
	includeMyRenotes: z.boolean().optional().default(true),
});
```

zod は `.optional().default(...)` でリクエストに値が無い場合に自動で埋める。クライアントの省略を吸収できるため、後方互換変更で重宝する。

### nullable プロパティ

```ts
export const paramDef = z.object({
	parentId: misskeyId().nullable().optional(),
});
```

`.nullable()` を付けると `null` を明示的に受け付ける。

## OpenAPI への反映マップ

[gen-spec.ts](../../../../../packages/backend/src/server/api/openapi/gen-spec.ts) より:

| meta フィールド | OpenAPI への反映 |
|---|---|
| `description` | operation description (先頭) |
| `secure: true` | description に "**Internal Endpoint**: ..." の警告 |
| `requireCredential: true` | description に "**Credential required**: *Yes*" + `security: [bearerAuth]` |
| `kind` | description に "**Permission**: *<kind>*" |
| `tags[0]` | operation tag (実質 1 個目のみ) |
| `requireFile: true` | requestBody が `multipart/form-data` になり `file: { type: 'string', format: 'binary' }` が追加される |
| `errors` | examples (operation の `responses` 配下) |
| `res` | response body schema |
| `limit` | `429 Too many requests` レスポンスが `responses` に追加される |
| `allowGet` | 同一 path に `get` operation が追加される (POST と両方が生える) |

**OpenAPI に反映されない (内部のみ)**: `requireModerator` / `requireAdmin` / `requiredRolePolicy` / `prohibitMoved` / `cacheSec` / `stability`。

## 落とし穴

PR レビューで頻発するミスを「**症状 → 原因 → 修正**」で集めた。

### 1. エンドポイントが 404 になる

- **症状**: 開発サーバーで叩くと `{"error": {"code": "UNKNOWN_API_ENDPOINT", ...}}`
- **原因**: `server/rest/routes/<category>.ts` へのルート未登録、または新規カテゴリファイルを `shell.ts` に配線し忘れ
- **修正**: → [endpoint-registration.md](endpoint-registration.md)

### 2. meta とルートの enforcement が食い違う (404 にならないので気づきにくい)

- **症状**: `meta.requireCredential: true` / `kind` / `limit` を書いたのに、未認証や無関係な OAuth スコープのトークンでも通ってしまう
- **原因**: ルート側で `assertCredential` / `assertTokenPermission` / `assertHonoApiRateLimitForUser` の呼び出しを書き忘れた、または値が meta と食い違っている
- **修正**: meta とルートを並べて目視確認する。自動検知ツールは無い

### 3. CI `check-misskey-js-autogen` で落ちる

- **症状**: PR に `Please regenerate misskey-js` のコメント
- **原因**: `meta` / `paramDef` / `res` を変えたのに misskey-js の自動生成物を再生成していない
- **修正**: → [shipping-misskey-change/references/tasks/regenerate-misskey-js.md](../../../shipping-misskey-change/references/tasks/regenerate-misskey-js.md)

### 4. CI `spdx` ジョブで落ちる

- **症状**: `SPDX header missing` のメッセージ
- **原因**: 新規 `.ts` ファイルに SPDX ヘッダーが無い
- **修正**: ファイル冒頭に SPDX を貼る。注: `packages/misskey-js/` 配下は MIT 別ライセンスなので SPDX 不要

### 5. クライアントが 500 + error 型不在 を受け取る

- **症状**: フロントエンド側で `result.error.code` を分岐したいが、misskey-js の型に出てこない。レスポンスは 500
- **原因**: `meta.errors` に列挙していないエラーを throw した、または `meta.errors` とローカルのエラーファクトリの `id`/`code`/`message` が食い違っている
- **修正**: 業務エラーは必ず `meta.errors` に登録し、ハンドラ内のローカルエラーファクトリの値と完全一致させる

### 6. `me.id` で `Cannot read properties of null`

- **症状**: 認証なしリクエストで TypeError
- **原因**: `requireCredential: false` (または未設定) のときルートの `auth.user` は `MiLocalUser | null` なのに null チェックなしでハンドラに渡した
- **修正**: null チェックを入れるか、認証必須なら `requireCredential: true` + ルートで `assertCredential(auth)` を追加する

### 7. UUID が他エンドポイントと衝突

- **症状**: `errors.id` を再利用してしまうと misskey-js 側で型が混線
- **原因**: UUID をハードコードして再利用
- **修正**: 衝突確認

  ```bash
  grep -rn "id: '<生成した UUID>'" packages/backend/src/server/api/metas/ packages/backend/src/server/rest/
  ```

  新規生成は `node -e "console.log(crypto.randomUUID())"`

### 8. `paramDef` に `policies` を書く

- **症状**: 「`gtlAvailable: true` を payload で渡してください」のような不自然な API になっている / クライアントが指定したらバイパスできる
- **原因**: ロールポリシーは **動的に取得するもの**
- **修正**: paramDef からは外し、ハンドラ内で `getHonoApiRolePolicies(deps, user)` を呼んで判定する

### 9. エラーメッセージを日本語で書く

- **症状**: `message: 'ノートが見つかりません'` のような日本語が i18n されずクライアントに渡る
- **原因**: バックエンドに i18n 機構が無い
- **修正**: `message` は英語ハードコードに統一。フロントエンドは `error.id` (UUID) または `error.code` をキーに自前で localize する

### 10. `requireCredential: true` なのに `kind` を書き忘れる

- **症状**: TypeScript の型エラー (`Property 'kind' is missing`)
- **原因**: [endpoints.ts](../../../../../packages/backend/src/server/api/endpoints.ts) のユニオン制約で `kind` が型レベルで必須
- **修正**: 適切な OAuth スコープを `kind` に設定する
- **例外**: `secure: true` (Misskey 本体専用) のエンドポイントは別 union variant 扱いで `kind` 不要

### 11. アップロード時に一時ファイルが残る

- **症状**: アップロード後にエンドポイントが正常終了/例外終了しても OS の一時ディレクトリにファイルが残り続け、ディスクが埋まる
- **原因**: `cleanup()` を `try { ... } finally { cleanup(); }` で囲わずに呼び忘れた
- **修正**: [routes/drive.ts](../../../../../packages/backend/src/server/rest/routes/drive.ts) の `/drive/files/create` ルートが手本。multipart パース (`readHonoApiMultipartRequest`) が返す `cleanup` を必ず `finally` で呼ぶ

### 12. `requiredRolePolicy` だけで匿名許可してしまう

- **症状**: API を匿名で叩くと 500 + `TypeError: Cannot read properties of null (reading 'id')`
- **原因**: ハンドラが `user.id` を非null前提でアクセスしているのに、ルート側で `assertCredential` を呼んでいない
- **修正**: 静的に必須ポリシーを宣言するなら `requireCredential: true` + ルートで `assertCredential` を必ず併用する。匿名ユーザーにも違うポリシーセットを適用したいなら、`getHonoApiRolePolicies(deps, user)` の `user` に `null` を渡して判定する ([server/rest/notes.ts](../../../../../packages/backend/src/server/rest/note/notes.ts) の `notes/global-timeline` 相当パターン)

### 13. e2e テストが起動しない

- **症状**: `bun run --bun --filter backend test:e2e` 実行直後にこける / DB 接続エラー
- **原因**: `.config/test.yml` が無い
- **修正**: → [knowledge/backend-testing.md §前提](backend-testing.md)
