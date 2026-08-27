# サービスのファクトリ関数パターン (DI コンテナ無し)

Misskey backend は 2026-07-07 に NestJS を全廃した。`@nestjs/*` / `reflect-metadata` / `@/di-symbols.js` の `DI` トークン / `@Injectable()` は存在しない。DI コンテナ・Repository パターンの代わりに、**プレーン関数** と **`createXxx()` ファクトリ関数** の 2 パターンで構成される。

## パターン 1: プレーンな `fetchXxxFromDatabase` / `xxxInDatabase` 系関数

状態を持たず、第 1 引数に `db` (`MiDrizzleDatabase`) を取るだけの関数。呼び出し元が import して直接呼ぶ。

```ts
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { fetchUserProfileByUserIdFromDatabase, updateUserProfileInDatabase } from '@/core/UserProfileStore.js';

const user = await fetchUserByIdOrFailFromDatabase(deps.db, userId);
```

`*Store.ts` (`UserStore.ts` / `UserProfileStore.ts` / `RoleStore.ts` / `RoleAssignmentStore.ts` / `AccessTokenStore.ts` / `AppStore.ts` / `SigninStore.ts` 等) がこの形式の代表。CRUD の薄いラッパーで、DI もクラスも無い。

## パターン 2: `createXxx(config)` ファクトリ関数

設定値など「呼び出し毎に変わらない依存」をクロージャで閉じ込めたいときに使う。ファクトリはメソッド群を持つオブジェクトを返す。

```ts
// packages/backend/src/core/MfmService.ts
export function createMfmService(config: Config) {
	function fromHtml(html: string, hashtagNames?: string[]): string { /* ... */ }
	function toHtml(nodes: mfm.MfmNode[] | null, ...): string { /* ... */ }

	return { fromHtml, toHtml };
}

export type MfmService = ReturnType<typeof createMfmService>;
```

呼び出し元は都度 `createMfmService(config)` して使うか、起動時に 1 回だけ生成して deps に積んで使い回す。**グローバルな DI コンテナは無い**ので、「誰がいつ生成するか」は呼び出し元のコードを直接読んで確認すること (`grep -rn "createMfmService("` などで実例を探すのが早い)。

## API endpoint 層での依存の受け渡し: `deps` オブジェクト

REST API のハンドラ関数 (`server/rest/*.ts`) は、必要な依存を **1 個の `deps` オブジェクト** の第一引数として受け取る。各ファイルが必要な依存だけを型で宣言し、それらは `ApiShellDependencies` ([server/rest/shell.ts](../../../../../packages/backend/src/server/rest/shell.ts)) に集約される。

```ts
// packages/backend/src/server/rest/account/i.ts
export type ApiIDependencies = UserPackingDependencies & {
	db: MiDrizzleDatabase;
};

export async function handleApiI(
	deps: ApiIDependencies,
	user: MiLocalUser,
	token: MiAccessToken | null,
): Promise<Record<string, unknown>> {
	// deps.db 等を直接使う
}
```

`ApiShellDependencies` は `config` / `db` / `dbPool` / `meta` / `redis` 系 / 各種 `*Service` (Pick で必要なメソッドだけ絞ったもの) / `chartWriters` / `logger` / `publishXxxStream` などをまとめて持つ大きな型。**新しい依存が必要なハンドラを書くときは、`ApiShellDependencies` にフィールドを追加し、実体は `server/rest/shell.ts` を呼び出す起動コード側 (bootstrap) で組み立てる**。

## 新規 Service を追加する場合

NestJS 時代のような「module の `providers` 配列に登録」は不要。以下のいずれかで完結する:

- 状態を持たないなら `packages/backend/src/core/<Name>Service.ts` に `export function create<Name>Service(...)` を書き、呼び出し元 (endpoint ハンドラや起動コード) から直接 import して呼ぶ
- DB アクセスだけなら `packages/backend/src/core/<Name>Store.ts` に `export async function fetchXxxFromDatabase(db, ...)` 系のプレーン関数を並べる

**登録の一元管理ファイルは存在しない** — 呼び出し元が import すればそれだけで使える。逆に言うと、「どこからも import されていない `createXxx()` は単なるデッドコード」なので、新規追加時は必ず利用箇所を作ること。

## 既存例

- [core/MfmService.ts](../../../../../packages/backend/src/core/mfm/MfmService.ts) — `createXxx(config)` ファクトリの典型
- [core/UserStore.ts](../../../../../packages/backend/src/core/user/UserStore.ts) — プレーン関数群の典型
- [server/rest/i.ts](../../../../../packages/backend/src/server/rest/account/i.ts) — `deps` 経由での依存受け渡しの典型
- [server/rest/shell.ts](../../../../../packages/backend/src/server/rest/shell.ts) — `ApiShellDependencies` の全体像
