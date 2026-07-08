# endpoint を実際にルーティングへ載せる

新規 API endpoint を追加する際の **最大の落とし穴**。旧 NestJS 時代は `endpoint-list.ts` への 1 行登録だけで済んだが、現在は **メタデータ登録** と **ルート登録** が分離した 2 系統になっており、**両方**やる必要がある。片方だけだと壊れ方が違う (下記参照)。

## なぜ 2 系統に分かれているか

| 系統 | 役割 | 実行時の効果 |
|---|---|---|
| `server/api/metas/<category>.ts` → [endpoint-metas.ts](../../../../../packages/backend/src/server/api/endpoint-metas.ts) → [endpoints.ts](../../../../../packages/backend/src/server/api/endpoints.ts) | `meta` (tags/requireCredential/kind/limit/errors/res 等) と `paramDef` (zod) の **宣言**。OpenAPI 仕様生成・`misskey-js` 型自動生成・`/endpoints` `/endpoint` API の情報源 | **リクエストのルーティングや認可には一切使われない** (実行時に `endpointMetas` を読むコードは存在しない) |
| `server/rest/routes/<category>.ts` → [shell.ts](../../../../../packages/backend/src/server/rest/shell.ts) の `registerXxxRoutes(app, deps)` 群 | Hono の実ルート。認証・権限・レート制限を **その場で手続き的に呼び出し**、ハンドラ関数 (`server/rest/<feature>.ts` の `handleHonoApiXxx`) を実行する | **実際にリクエストを処理するのはこちら** |

つまり `meta.requireCredential: true` と書いても、それだけでは何も強制されない。ルート側で `assertCredential(auth)` を **自分で呼ばない限り** 認証は強制されない。同様に `meta.kind: 'write:notes'` を書いても、ルート側で `assertTokenPermission(auth, 'write:notes')` を呼ばない限り OAuth スコープはチェックされない。**meta は「宣言」、ルートは「実装」で、両者は手で同期させる別々のコード**だと理解すること。

## 3 通りの壊れ方

| 状態 | 症状 |
|---|---|
| ルート未登録 (routes/*.ts に書いたが `shell.ts` に import/呼び出しを足し忘れた、またはそもそも routes/*.ts に書いていない) | **404** (`UNKNOWN_API_ENDPOINT`)。旧 `endpoint-list.ts` 忘れと同じ壊れ方 |
| meta 未登録 (metas/*.ts に無い) | 404 にはならない (ルートさえあれば動く) が、`/api.json` / OpenAPI / `misskey-js` の型に出てこない。CI の `check-misskey-js-autogen` で検知されにくい (再生成しても差分が出ないため気づきにくい) |
| meta とルートの内容不一致 (例: meta では `requireCredential: true` なのにルートで `assertCredential` を呼んでいない) | **どちらのチェックでも検知されない**。認証バイパスなどの重大なセキュリティ問題になり得るので、レビュー時に人間が meta とルートを並べて確認する必要がある |

## 登録手順

### 1. `metas/<category>.ts` に meta + paramDef を追加

[endpoint-metas.ts](../../../../../packages/backend/src/server/api/endpoint-metas.ts) が `metas/<category>.ts` を import して集約している。既存カテゴリがあればそこに追記、無ければ新規ファイルを作り `endpoint-metas.ts` の import 一覧にも追加する (キー順は UTF-16 code unit 順を維持するようファイル冒頭にコメントあり)。

```ts
// server/api/metas/notes.ts
export const endpointMetas = {
	// ...
	'notes/create': {
		meta: {
			tags: ['notes'],
			requireCredential: true,
			prohibitMoved: true,
			limit: { duration: HOUR, max: 300 },
			kind: 'write:notes',
			res: { /* ... */ },
		} as const,
		paramDef: notesCreateParamDef, // ← ハンドラ側の zod schema をそのまま import して使う (二重定義しない)
	},
};
```

`paramDef` はハンドラファイル (`server/rest/<feature>.ts`) で定義した zod schema を import して渡す。**meta ファイル側で zod schema を再定義しない** — 実例は [metas/i.ts](../../../../../packages/backend/src/server/api/metas/i.ts) が `iSigninHistoryParamDef` を `@/server/rest/i.js` から import している箇所。

### 2. ハンドラ関数を書く (`server/rest/<feature>.ts`)

詳細は [tasks/adding-api-endpoint.md](../tasks/adding-api-endpoint.md)。

### 3. ルートを登録する (`server/rest/routes/<category>.ts`)

```ts
// server/rest/routes/notes.ts
export function registerNotesRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post('/notes/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);                       // ← meta.requireCredential: true に対応
			assertProhibitMoved(auth.user);                // ← meta.prohibitMoved: true に対応
			assertTokenPermission(auth, 'write:notes');    // ← meta.kind に対応 (文字列はハードコード、meta と手で揃える)
			await assertHonoApiRateLimitForUser(deps, 'notes/create', { duration: 60 * 60 * 1000, max: 300 }, auth.user); // ← meta.limit と値を揃える

			return jsonResponse(c, await handleHonoApiNotesCreate(deps, auth.user, body));
		});
	});
}
```

新規カテゴリファイルを作った場合は [shell.ts](../../../../../packages/backend/src/server/rest/shell.ts) に import + `registerXxxRoutes(app, deps);` 呼び出しを追加する。既存カテゴリなら既存の `register<Category>Routes` 関数に `app.post(...)` / `app.get(...)` を追記するだけで良い。

## 登録確認

```bash
# ルートが登録されているか (シンボル名で grep)
grep -rn "'/<category>/<name>'" packages/backend/src/server/rest/routes/

# meta が登録されているか
grep -rn "'<category>/<name>':" packages/backend/src/server/api/metas/
```

両方ヒットして初めて「404 にならず、docs/misskey-js にも載る」状態。

## 関連

- 新規 endpoint 追加の全手順 → [tasks/adding-api-endpoint.md](../tasks/adding-api-endpoint.md)
- サービス層の依存注入 (DI コンテナ無し) → [service-architecture.md](service-architecture.md)
