# Backend テストの前提と書き方

Misskey backend のテスト構成、`.config/test.yml` の前提、e2e テストのヘルパー関数集を 1 つにまとめたページ。

## 目次

- [前提: `.config/test.yml`](#前提-configtestyml)
- [テスト種別と実行コマンド](#テスト種別と実行コマンド)
- [e2e テストの配置](#e2e-テストの配置)
- [共通 setup](#共通-setup)
- [アサーション](#アサーション)
- [`api()` ヘルパー](#api-ヘルパー)
- [`signup()` / `post()` / `uploadFile()` 等](#signup--post--uploadfile-等)
- [ローカル DB / Redis](#ローカル-db--redis)

## 前提: `.config/test.yml`

backend のテストスクリプト (`test` / `test:e2e` / `test:fed`) はすべて内部で `cross-env NODE_ENV=test bun run compile-config` を実行し、`.config/test.yml` を読み込む ([packages/backend/package.json](../../../../../packages/backend/package.json), [packages/backend/scripts/compile_config.js](../../../../../packages/backend/scripts/compile_config.js))。**未作成だとテスト自体が起動しない**。

未作成なら以下を 1 回だけ手動コピーする (どちらでも可):

```bash
ncp .github/misskey/test.yml .config/test.yml
# または
cp .github/misskey/test.yml .config/test.yml
```

補足:

- ルートの `bun run start:test` (Playwright 用にテストサーバーを起動するコマンド) を使う経路では実行時に `.github/misskey/test.yml` を `.config/test.yml` へコピーする ([package.json](../../../../../package.json))。それ以外で backend テストを直接走らせる時は上記の手動コピーが必要
- すでに `.config/test.yml` があれば各テストスクリプトの内部 `compile-config` で十分なので、追加で `bun run --bun --filter backend compile-config` を叩く必要はない
- `bun run start:test` は backend e2e テスト (`bun run --bun --filter backend test:e2e`) の前提ではない (ポート競合の元になるため使わないこと)

## テスト種別と実行コマンド

| 種別 | 設定ファイル | 実行コマンド |
| --- | --- | --- |
| Unit | `packages/backend/vitest.config.unit.ts` | `bun run --bun --filter backend test` |
| E2E (HTTP / DB) | `packages/backend/vitest.config.e2e.ts` | `bun run --bun --filter backend test:e2e` |
| E2E (本番と同じ bun ランタイム) | 同上 | `bun run --bun --filter backend test:e2e:bun` |
| Federation | `packages/backend/vitest.config.fed.ts` | `bun run --bun --filter backend test:fed` |

- 配置: `packages/backend/test/` 配下
- カバレッジ: `bun run --bun --filter backend test-and-coverage`

### `test:e2e` と `test:e2e:bun` の違い

`test:e2e` は vitest と **同じプロセス内に** テスト対象サーバーを立てる。2026-08-21 以降 vitest 自体が
Bun ランタイムで動くため、この経路でも Bun 固有実装 (Bun.sql / Bun.serve) が通る
(それ以前は vitest が Node respawn だったため Bun 経路が完全に未検証で、Bun.sql が SQLSTATE を
`code` でなく `errno` に入れるバグが素通りした実害があった)。

`test:e2e:bun` は `scripts/run_e2e_bun.js` がテスト対象サーバーだけを **bun の別プロセス** として起動し、
vitest からは `MISSKEY_E2E_TARGET_MODE=external` で HTTP 越しに叩かせる。テスト本体は同じ
`test/e2e/*.ts` なので件数も同じ。in-process と違い **本番と同じ built 済み `entry.js` の起動経路**を
検証できるのが現在の固有価値。DB / HTTP / ストリーミングの低層を触ったら引き続き両方通すこと。

### unit / e2e は Bun ランタイムの vitest で動く (2026-08-21 以降)

`test` / `test:e2e` / `test-and-coverage(:e2e)` の vitest は起動元ランタイム (通常は `bun run --bun` 経由の **Bun**) でそのまま動く。Bun 実行時はテスト対象アプリの DB ドライバも本番同様 **Bun.sql** が選ばれるため、unit / e2e でも本番 DB 経路がカバーされる。これを成立させている 3 つの前提を壊さないこと:

- **`vitest.config.ts` の `server.deps.inline: ['zod']` を外さない。** 外部化された zod を Bun がネイティブ import すると named export の interop 解析に失敗し、全テストファイルが即死する ([oven-sh/bun#21614](https://github.com/oven-sh/bun/issues/21614)、bun 1.3〜1.4 で再現確認済)。inline で vite の変換経路に通すと回避できる。同型のエラーが別パッケージで出たら inline 配列に追加する。
- **e2e のファイル列挙を CLI 引数方式に戻さない。** Bun 上の vitest は多数のファイル引数 (31個で再現) を渡すと起動後にハングする。実行順の決定性は `vitest.config.e2e.ts` の `AlphabeticalSequencer` が担っており、include glob で全ファイルが拾われる。
- **テスト用 DB 接続予算 (`.github/misskey/test.yml` の `maximumConnectionsPerHost: 16`) を既定に戻さない。** Bun.sql は起動時に上限まで接続を先張りするため、e2e のファイル毎アプリ再起動の重なりで PostgreSQL の `max_connections=100` を超える (53300 too many clients)。

歴史的経緯: 2026-07-07〜2026-08-21 は上記 zod バグの回避としてテストを本物の Node.js へ respawn していた (`scripts/respawn_with_node.js`、削除済)。**フォーク爆弾の教訓は今も有効**: `bun run --bun` は PATH の先頭に `/tmp/bun-node-<hash>/` を注入し、その中の `node` は **bun 本体への symlink**。「node で再起動する」自己再起動スクリプトは (1) realpath 比較で本物の node を解決し、(2) shim ディレクトリを PATH から除去し、(3) 環境変数ガードで再帰を禁止しない限り、無限再帰でホストをフリーズさせる (2026-07-07 に600プロセス超で実害)。

- vitest には必ず `run` サブコマンドを明示する (省略すると watch モードに入り得て、プロセスが終了せず残り続ける)。
- 新しいテストファイルは vitest の include glob が動的に拾うため、package.json 側の追加対応は不要。
- N+1 検査のクエリカウンタは `test/query-counter.ts` の `countDatabaseQueries(runtime.db)` を使う (node の pg Pool と bun の Bun.sql ラッパを自動判別)。pg Pool 直フックの旧 `countPoolQueries` は Bun.sql 経路を数えられないため削除済。

## e2e テストの配置

`packages/backend/test/e2e/` の現状ファイル例:

```
note.ts              ノート関連 (作成・renote・visibility・添付ファイル等)
users.ts             ユーザー関連
timelines.ts         タイムライン
drive.ts             ドライブ (アップロード/ダウンロード)
clips.ts             クリップ
oauth.ts             OAuth フロー
streaming.ts         WebSocket
api.ts               API レイヤ全般 (認証・レート制限など)
api-visibility.ts    公開範囲チェック
endpoints-<領域>.ts  エンドポイントの網羅的な契約テスト (admin / users / notes /
                     content / drive-channels / admin-emoji / auth / federation)
scenario/            複数エンドポイントをまたぐシナリオ
2fa.ts               2FA
block.ts / mute.ts / antennas.ts / move.ts / nodeinfo.ts / ...
```

`endpoints-*.ts` が共有する前準備 (alice 等の作成 + キュー接続) は
[test/endpoints-context.ts](../../../../../packages/backend/test/endpoints-context.ts) にある。
e2e の include glob は `test/e2e/**/*.ts` なので、**ヘルパーを `test/e2e/` の中に置くと
テストファイルとして実行されて落ちる**。共有物は `test/` 直下に置くこと。

**`admin.ts` は存在しない**。admin 系エンドポイントの e2e は `api.ts` (API レイヤ挙動として) または `endpoints.ts` (雑多枠) に置くのが現実的。

### 判断ルール

1. 自分の追加するエンドポイントが既存カテゴリファイル (`note.ts`, `users.ts` 等) に所属するなら、そこに `describe('...', () => { test(...) })` を追加
2. どのカテゴリにも収まらないなら `endpoints.ts` に追加
3. テストケースが多くなり (>200 行)、独立性が高い場合のみ新ファイル化

`describe` のラベル名は **人間可読** で OK (`describe('Note', ...)`, `describe('管理者操作', ...)` のような形式)。`<category>/<name>` 形式である必要はない。

## 共通 setup

`packages/backend/test/setup.e2e.ts` (vitest の `setupFiles`) が各テストファイル共通の `beforeAll` (テスト DB 初期化 + 環境リセット) を登録する。テストサーバーの起動/停止は別途 vitest の `globalSetup` (`test-server/entry.ts` の `setup()` / `teardown()`) が担う。各テストファイルでは自前の `beforeAll` でユーザーを用意する:

```ts
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { api, signup, post, role, uploadFile } from '../utils.js';
import type { UserToken } from '../utils.js';

describe('機能名', () => {
	let alice: UserToken;

	beforeAll(async () => {
		alice = await signup({ username: 'alice' });
	});

	test('正常系', async () => {
		const res = await api('<category>/<name>', { /* params */ }, alice);
		expect(res.status).toBe(200);
	});
});
```

## アサーション

**`expect` を使う。** `node:assert` は失敗時に差分が出ず、`assert.strictEqual(res.status, 200, inspect(res.body))`
のように第3引数へ手で状況を詰める必要があった。

```ts
expect(res.status).toBe(200);
expect(res.body).toStrictEqual({ id, name });
expect(res.body).toMatchObject({ name: 'テスト画像.jpg', type: 'image/jpeg' });
expect(res.status, inspect(res.body)).toBe(200); // 第2引数は失敗時に添えるメッセージ
```

「長さを見てから要素を見る」形は書かない。配列そのものを比較すれば失敗時に全体の差分が出る:

```ts
expect(user.alsoKnownAs).toStrictEqual([`${url.origin}/users/${alice.id}`]);
```

**例外: 型を絞りたいときだけ `node:assert` を使う。** `expect` の matcher は `asserts` 述語を持たないため、
判別可能ユニオンの判別子を検査しても後続のプロパティアクセスが型エラーになる。`assert.ok` / `assert.strictEqual`
は `asserts` を持つのでその場で絞れる。

```ts
assert.ok(res.body); // 以降 res.body は非 null
assert.strictEqual(signinResponse.body.finished, false); // 以降 body.next が読める
```

## `api()` ヘルパー

[test/utils.ts](../../../../../packages/backend/test/utils.ts) の `api()`:

```ts
const res = await api('<category>/<name>', params, me?);
// res.status   : HTTP ステータス (200 / 400 / 401 / 403 / 500 等)
// res.headers  : Headers
// res.body     : レスポンス JSON (型は misskey.Endpoints から自動推論)
```

`me?` を省略すると未認証リクエスト。`me` を渡すとそのユーザーの token で叩く。

### エラーレスポンスの検証

```ts
test('存在しないノートで怒られる', async () => {
	const res = await api('notes/show', { noteId: '0000000000000000' }, alice);
	expect(res.status).toBe(400);
	expect(castAsError(res.body as any).error.code).toBe('NO_SUCH_NOTE');
});
```

`castAsError(...).error.code` で `meta.errors.<key>.code` を検証できる ([test/utils.ts](../../../../../packages/backend/test/utils.ts) の `castAsError`)。

## `signup()` / `post()` / `uploadFile()` 等

### `signup()` — テストユーザー作成

```ts
const alice = await signup({ username: 'alice' });        // 既定パスワード 'test'
const bob = await signup({ username: 'bob', password: 'secret123' });
```

戻り値はサインアップレスポンス (token を含む) で、`api()` の第 3 引数にそのまま渡せる。

### `post()` — ノート投稿

```ts
const note = await post(alice, { text: 'hello' });
// 戻り値は misskey.entities.Note
```

複雑な公開範囲・添付ファイル付きでも `post(alice, { text: ..., visibility: 'specified', visibleUserIds: [...], fileIds: [...] })` のように渡せる。

### `uploadFile()` — ドライブにファイルアップロード

```ts
const file = await uploadFile(alice);                                       // resources/192.jpg をアップロード
const file2 = await uploadFile(alice, { path: '192.png' });                 // resources/192.png
const file3 = await uploadFile(alice, { blob: new Blob([...]) });           // 任意 Blob
// file.body.id を fileIds に渡せる
```

### `role()` — ロール作成 + アサイン

[test/utils.ts](../../../../../packages/backend/test/utils.ts) の `role()`:

```ts
const myRole = await role(adminUser, { name: 'tester' }, { canCreateChannel: { useDefault: false, priority: 0, value: true } });
// admin/roles/create を叩く。policies 引数で個別ポリシーを上書き可能
```

モデレーター・管理者ロールが要るテストは事前に `signup({ ... })` + `role(...)` で作る。

### `createAppToken()` — アプリ scope 付きトークン

```ts
const token = await createAppToken(alice, ['write:notes', 'read:account']);
// token は文字列。api() の me.token として使うか、{ token, bearer: true } で渡せば Bearer Auth で叩く
```

OAuth scope (`kind`) のテストに使う。

### その他のヘルパー

[test/utils.ts](../../../../../packages/backend/test/utils.ts) には以下も用意されている:

- `userList()` — ユーザーリスト作成
- `page()` / `play()` — Page / Flash 作成
- `clip()` / `galleryPost()` / `channel()` — 各種リソース作成
- `react()` — リアクション
- `simpleGet()` — fetch ラッパ (raw HTTP)
- `testPaginationConsistency()` — ページネーション挙動の網羅検証
- `sendEnvUpdateRequest()` / `sendEnvResetRequest()` — テスト用環境変数の更新
- `connectStream()` / `waitFire()` — WebSocket (Streaming API)

詳細はソースを直接参照。

### 既存テスト例

- [test/e2e/note.ts](../../../../../packages/backend/test/e2e/note.ts) — `describe('Note', ...)` で多数の `test(...)` を並べる伝統的なスタイル
- [test/e2e/endpoints-users.ts](../../../../../packages/backend/test/e2e/endpoints-users.ts) — 領域ごとに割ったエンドポイントの契約テスト
- [test/e2e/api.ts](../../../../../packages/backend/test/e2e/api.ts) — API レイヤ (認証・レート制限) の挙動

## ローカル DB / Redis

backend の **テスト** と **開発** では用途別に別の compose ファイルを使う。ポートが異なるので混同すると接続できない。

| 用途 | compose ファイル | host ポート (db / redis) |
| --- | --- | --- |
| テスト (`test` / `test:e2e` / `test:fed`) | [packages/backend/test/compose.yml](../../../../../packages/backend/test/compose.yml) | `54312` / `56312` ([.github/misskey/test.yml](../../../../../.github/misskey/test.yml) のポート設定と一致) |
| 開発 (`bun run dev` 等) | `deploy/compose.local-db.yml` | `5432` / `6379` |

```bash
# テスト用 DB / Redis (テスト時はこちら)
docker compose -f packages/backend/test/compose.yml up -d

# 開発用 DB / Redis (Misskey 本体は起動せず postgres / redis / meilisearch だけ立てる)
docker compose -f deploy/compose.local-db.yml up -d
```

`deploy/compose.local-db.yml` は開発向け (標準ポート `5432` / `6379`) で、テスト用 DB (`test-misskey` / ポート `54312` / `56312`) とは別物。CI (`.github/workflows/test-backend.yml`) は docker compose ではなく GitHub Actions の `services:` で同じテスト用ポートの postgres / redis コンテナを立ててから走る。
