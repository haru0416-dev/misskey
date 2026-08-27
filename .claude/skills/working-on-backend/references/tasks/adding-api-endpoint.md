# 新規 REST API endpoint を追加する

Misskey backend の API endpoint は **1 endpoint = 1 ファイル** ではない。3 つの層に分かれた **4 ファイル**(うち 1 つは新規カテゴリのときだけ)に触れる:

| 層 | ファイル | 内容 |
|---|---|---|
| メタデータ宣言 | `packages/backend/src/server/api/metas/<category>.ts` | `meta` (tags/requireCredential/kind/limit/errors/res) と `paramDef` (zod schema の import) |
| ハンドラ実装 | `packages/backend/src/server/rest/<feature>.ts` | `paramDef` の定義、ビジネスロジック、業務エラーのローカルファクトリ |
| ルート登録 | `packages/backend/src/server/rest/routes/<category>.ts` | Hono ルート。認証・権限・レート制限をその場で呼び出し、ハンドラを実行 |
| (新規カテゴリのみ) 配線 | `packages/backend/src/server/rest/shell.ts` | 新規 `routes/<category>.ts` の import + `registerXxxRoutes(app, deps)` 呼び出し |

`metas/<category>.ts` は **ドキュメント/misskey-js 生成用の宣言**、`routes/<category>.ts` は **実際にリクエストを処理するコード**。この 2 つは自動連動しないので、両方を手で書き、両方の値を一致させる。詳細な理由・壊れ方 → [knowledge/endpoint-registration.md](../knowledge/endpoint-registration.md)。

## 最重要事実 (見落とすと CI / 本番が壊れる)

1. **ルートは自動収集されない**。`routes/<category>.ts` への実装 + (新規カテゴリなら) `shell.ts` への配線が無いと 404 になる → [knowledge/endpoint-registration.md](../knowledge/endpoint-registration.md)
2. **meta の `requireCredential` / `kind` / `limit` / `prohibitMoved` はドキュメント用の宣言に過ぎない**。ルート側で `assertCredential` / `assertTokenPermission` / `assertApiRateLimitForUser` / `assertProhibitMoved` を **自分で呼ばないと実際には強制されない**。忘れても 404 にはならず気づきにくいので要注意
3. **`meta` / `paramDef` / `res` を変えたら misskey-js 再生成が必須**。`bun run build-misskey-js-with-types` を忘れると CI の `check-misskey-js-autogen` で必ず落ちる
4. **`meta.errors` の各 `id` は UUID v4 で、リポジトリ内で一意**。`crypto.randomUUID()` で生成し、`grep -rn "id: '<UUID>'" packages/backend/src/server/api/metas/ packages/backend/src/server/rest/` で衝突確認。ハンドラ側のローカルエラーファクトリの `message`/`code`/`id` は meta の宣言と完全一致させる

## ワークフロー全体図

```
1. 設計    : エンドポイントの種類を決める (read/write × 認証要否 × 権限)
2. 実装    : paramDef (zod) + ハンドラ関数を server/rest/<feature>.ts に書く (SPDX ヘッダー付き)
3. 宣言    : meta + paramDef の import を server/api/metas/<category>.ts に追加
4. 配線    : routes/<category>.ts にルートを追加 (★ 忘れると 404) / 新規カテゴリなら shell.ts にも登録
5. 検証    : e2e テスト + lint + misskey-js 再生成
6. 仕上げ  : CHANGELOG エントリ (shipping-misskey-change で確認)
```

---

## 1. 設計フェーズ — どの既存実装を参照するか

まず作るエンドポイントの性質を確定させる。**既存実装を参照しながら書くのが最短路** (3 ファイルすべてに触れる必要があるため、1 つのエンドポイントを 3 ファイルとも串刺しで読む)。

| 性質 | meta | ルート | ハンドラ |
|---|---|---|---|
| 認証不要・パラメータなし・小さなレスポンス | [metas/misc.ts](../../../../../packages/backend/src/server/api/metas/misc.ts) `'ping'` | [routes/misc.ts](../../../../../packages/backend/src/server/rest/routes/misc.ts) `/ping` | [rest/meta.ts](../../../../../packages/backend/src/server/rest/meta/meta.ts) `handleApiPing` |
| 認証必須・errors あり・レート制限 | [metas/notes.ts](../../../../../packages/backend/src/server/api/metas/notes.ts) `'notes/create'` | [routes/notes.ts](../../../../../packages/backend/src/server/rest/routes/notes.ts) `/notes/create` | [rest/notes-create.ts](../../../../../packages/backend/src/server/rest/note/notes-create.ts) |
| ページネーション (sinceId/untilId/limit) | [metas/i.ts](../../../../../packages/backend/src/server/api/metas/i.ts) `'i/signin-history'` | — | [rest/i.ts](../../../../../packages/backend/src/server/rest/account/i.ts) `iSigninHistoryParamDef` / `handleApiISigninHistory` |
| ロールポリシー (動的) ベースのアクセス制御 | [metas/notes.ts](../../../../../packages/backend/src/server/api/metas/notes.ts) `'notes/global-timeline'` | [routes/notes.ts](../../../../../packages/backend/src/server/rest/routes/notes.ts) | [rest/notes.ts](../../../../../packages/backend/src/server/rest/note/notes.ts) — `getApiRolePolicies(deps, me)` |
| ファイル添付 (`requireFile: true`) | [metas/drive.ts](../../../../../packages/backend/src/server/api/metas/drive.ts) `'drive/files/create'` | [routes/drive.ts](../../../../../packages/backend/src/server/rest/routes/drive.ts) `/drive/files/create` | [rest/drive-file-upload.ts](../../../../../packages/backend/src/server/rest/drive/drive-file-upload.ts) |
| moderator / admin 専用 | [metas/admin.ts](../../../../../packages/backend/src/server/api/metas/admin.ts) `'admin/suspend-user'` | [routes/admin.ts](../../../../../packages/backend/src/server/rest/routes/admin.ts) `/admin/suspend-user` (`assertApiModerator`) | [rest/admin-user-suspension.ts](../../../../../packages/backend/src/server/rest/admin/admin-user-suspension.ts) |

`<category>` は機能領域 (例: `notes`, `users`, `admin`)。ファイルは既存に倣う。

---

## 2. 実装フェーズ

### 2.1 SPDX ヘッダー (必須)

新規 `.ts` ファイル冒頭に必ず付ける (欠落すると CI の `spdx` ジョブで失敗):

```ts
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
```

**注:** `packages/misskey-js/src/autogen/` 配下にも diff が出るが、**misskey-js は MIT ライセンス** で別管理 (`packages/misskey-js/package.json:license` = MIT) なので SPDX ヘッダーは付けない / 不要。

### 2.2 ハンドラ + paramDef (`server/rest/<feature>.ts`)

```ts
/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiLocalUser } from '@/models/User.js';
import { ApiError } from './error.js';

export type ApiFooDependencies = {
	db: MiDrizzleDatabase;
};

export const fooShowParamDef = z.object({
	fooId: misskeyId(),
});

function noSuchFooError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such foo.',
		code: 'NO_SUCH_FOO',
		id: '17a0e0fa-3f3e-4f3e-9f3e-3f3e3f3e3f3e', // crypto.randomUUID() で生成し衝突確認
	});
}

export async function handleApiFooShow(
	deps: ApiFooDependencies,
	me: MiLocalUser | null,
	params: z.infer<typeof fooShowParamDef>,
): Promise<Record<string, unknown>> {
	const foo = await fetchFooByIdFromDatabase(deps.db, params.fooId);
	if (foo == null) throw noSuchFooError();
	// 実装
	return { /* ... */ };
}
```

- 依存はすべて `deps` 第一引数にまとめる (型はそのファイルで必要な分だけ宣言。`ApiShellDependencies` に自動で合流する)
- 業務エラーはローカルなファクトリ関数で `ApiError` を組み立てる。メッセージ/code/id は次の meta 宣言と完全一致させる
- サービス層の依存注入パターンの詳細 → [knowledge/service-architecture.md](../knowledge/service-architecture.md)

### 2.3 meta 宣言 (`server/api/metas/<category>.ts`)

```ts
import { fooShowParamDef } from '@/server/rest/foo.js';

export const endpointMetas = {
	// ...
	'foo/show': {
		meta: {
			tags: ['foo'],
			requireCredential: true,         // 認証必須 → kind 必須 (例外: secure: true な内部 API は kind 不要)
			kind: 'read:account',            // OAuth scope (一覧は packages/misskey-js/src/consts.ts の `permissions`)
			errors: {
				noSuchFoo: {                              // ← キーは camelCase
					message: 'No such foo.',              // ← ハンドラ側のエラーファクトリと完全一致させる
					code: 'NO_SUCH_FOO',                  // ← code は SCREAMING_SNAKE_CASE
					id: '17a0e0fa-3f3e-4f3e-9f3e-3f3e3f3e3f3e', // ← ハンドラ側と同じ UUID
				},
			},
			res: {
				type: 'object',
				optional: false, nullable: false,
				ref: 'Note', // packed entity を参照する場合。単純な形は knowledge/api-meta-paramdef.md 参照
			},
		} as const,
		paramDef: fooShowParamDef, // ← ハンドラ側で定義した zod schema をそのまま import (再定義しない)
	},
};
```

`meta` / `paramDef` の全フィールドの詳細・パターン集 → [knowledge/api-meta-paramdef.md](../knowledge/api-meta-paramdef.md)。

### 2.4 ルート登録 (`server/rest/routes/<category>.ts`) ★必須

```ts
app.post('/foo/show', async (c) => {
	return await runApiEndpoint(c, async () => {
		const body = await jsonBody(c);
		const auth = await authenticateApiToken(deps, tokenFromRequest(c, body));
		assertCredential(auth);                     // ← meta.requireCredential: true に対応
		assertTokenPermission(auth, 'read:account'); // ← meta.kind に対応 (文字列は手で一致させる)

		const params = parseApiParams(fooShowParamDef, body);
		return jsonResponse(c, await handleApiFooShow(deps, auth.user, params));
	});
});
```

`meta` に書いた `requireCredential` / `kind` / `limit` / `prohibitMoved` / `requireModerator` / `requireAdmin` を、対応する assert 呼び出しとしてここで **手で** 再現する。詳細・新規カテゴリファイルの `shell.ts` 配線手順 → [knowledge/endpoint-registration.md](../knowledge/endpoint-registration.md)。

### 2.5 エラー throw のバランス

**クライアントに返すべき業務エラー** は必ず `meta.errors` に列挙し、ハンドラ内のローカルファクトリで同じ `message`/`code`/`id` の `ApiError` を throw する。これを守らないと misskey-js 側の型に出ず、レスポンスも 500 になる。

一方で **想定外の例外 (DB 不整合 / 下層 service の bug / 防御的アサーション)** は `throw new Error('...')` のままで構わない。すべての例外を `ApiError` で包むと、未知のバグが client error として隠蔽されてしまう。

---

## 3. 検証フェーズ

### 3.1 e2e テスト

[packages/backend/test/e2e/](../../../../../packages/backend/test/e2e/) の構造は **機能カテゴリごとのファイル分け** (`note.ts` / `users.ts` / `timelines.ts` / `drive.ts` / `clips.ts` / `oauth.ts` 等)。

- 既存のカテゴリファイルがあるなら、そこに `describe('<人間可読ラベル>', () => { test('正常系', ...) })` で追加
- どのファイルにも合わないなら `test/e2e/endpoints-<領域>.ts` (admin / users / notes / content /
  drive-channels / admin-emoji / auth / federation) の該当するものに追加
- `describe` 名は **人間可読 OK**

最小例 (詳細なヘルパー一覧は → [knowledge/backend-testing.md](../knowledge/backend-testing.md)):

```ts
import { describe, test } from 'vitest';
import * as assert from 'node:assert';
import { api, signup } from '../utils.js';

describe('<人間可読ラベル>', () => {
	test('正常系', async () => {
		const alice = await signup({ username: 'alice' });
		const res = await api('<category>/<name>', { /* params */ }, alice);
		assert.strictEqual(res.status, 200);
	});
});
```

実行 (前提: `.config/test.yml` — [knowledge/backend-testing.md](../knowledge/backend-testing.md) §前提 参照):

```bash
bun run --bun --filter backend test:e2e
```

### 3.2 lint / typecheck

```bash
# backend の型チェック
bun run --bun --filter backend typecheck      # tsgo --noEmit (backend のみ)

# 一括 (PR 提出前)
bun run lint
```

### 3.3 misskey-js 再生成 (★必須)

`meta` / `paramDef` / `res` を変えたら必ず:

```bash
bun run build-misskey-js-with-types
```

PR に `packages/misskey-js/src/autogen/` 配下の差分が含まれていないと CI の `check-misskey-js-autogen` で必ず落ちる (最頻ミス)。詳細手順は [shipping-misskey-change/references/tasks/regenerate-misskey-js.md](../../../shipping-misskey-change/references/tasks/regenerate-misskey-js.md)。

---

## 4. 仕上げフェーズ — CHANGELOG

ユーザー影響がある (新機能 / 既存挙動変更) なら `CHANGELOG.md` の `## Unreleased` → `### Server` に 1 行追加する。詳細は [shipping-misskey-change スキル](../../../shipping-misskey-change/SKILL.md) に従う。

---

## 落とし穴サマリ (PR で頻発するミス)

詳細な症状 → 原因 → 修正 のフォーマット → **[knowledge/api-meta-paramdef.md](../knowledge/api-meta-paramdef.md) §落とし穴**

- **404 になる** → `routes/<category>.ts` へのルート未登録、または新規カテゴリの `shell.ts` 配線漏れ
- **meta と実際の enforcement が食い違う (404 にならないので気づきにくい)** → `assertCredential` / `assertTokenPermission` / `assertApiRateLimitForUser` の呼び出し忘れ・値の不一致
- **CI `check-misskey-js-autogen` で落ちる** → `bun run build-misskey-js-with-types` 忘れ
- **CI `spdx` で落ちる** → SPDX ヘッダー欠落
- **クライアントが 500 と error 型不在を受け取る** → `meta.errors` とハンドラ側エラーファクトリの不一致・列挙漏れ
- **`me` / `auth.user` で TypeError** → `requireCredential: false` で null チェックを忘れた
- **UUID 重複** → 衝突確認グレップを忘れた
- **一時ファイルが残る** → アップロード系ルートで `cleanup()` を `finally` で呼び忘れた
- **`requiredRolePolicy` 相当の判定で匿名アクセスが 500 になる** → ハンドラが `user.id` を非null前提で参照しているのに `assertCredential` を呼んでいない

---

## 参照ファイル

### コードベース

- [endpoints.ts (meta/paramDef 型定義)](../../../../../packages/backend/src/server/api/endpoints.ts)
- [endpoint-metas.ts (metas/*.ts の集約)](../../../../../packages/backend/src/server/api/endpoint-metas.ts)
- [error.ts (ApiError)](../../../../../packages/backend/src/server/rest/error.ts)
- [validation.ts (parseApiParams)](../../../../../packages/backend/src/server/rest/validation.ts)
- [zod-params.ts (misskeyId / uniqueItems)](../../../../../packages/backend/src/misc/zod-params.ts)
- [shell.ts (ApiShellDependencies / ルート配線)](../../../../../packages/backend/src/server/rest/shell.ts)
- [metas/misc.ts (`ping` — 最小例)](../../../../../packages/backend/src/server/api/metas/misc.ts)
- [rest/notes-create.ts (errors の典型)](../../../../../packages/backend/src/server/rest/note/notes-create.ts)
- [rest/notes.ts (`notes/global-timeline` 相当 — policies 動的チェック)](../../../../../packages/backend/src/server/rest/note/notes.ts)
- [test/e2e/endpoints-users.ts (テスト例)](../../../../../packages/backend/test/e2e/endpoints-users.ts)
- [test/utils.ts (api/signup/post 等のヘルパー)](../../../../../packages/backend/test/utils.ts)
