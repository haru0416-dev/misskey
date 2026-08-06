# Backend テストの前提と書き方

Misskey backend のテスト構成、`.config/test.yml` の前提、e2e テストのヘルパー関数集を 1 つにまとめたページ。

## 目次

- [前提: `.config/test.yml`](#前提-configtestyml)
- [テスト種別と実行コマンド](#テスト種別と実行コマンド)
- [e2e テストの配置](#e2e-テストの配置)
- [共通 setup](#共通-setup)
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

### `test:e2e` と `test:e2e:bun` の違い (★ どちらか一方では本番経路を検証できない)

`test:e2e` は vitest (Node.js) と **同じプロセス内に** テスト対象サーバーを立てる。つまり本番が使う
**bun ランタイム固有の実装は一切通らない** — 特に DB ドライバは `MK_DB_DRIVER` の既定が bun 上でのみ
`Bun.sql` になるため、`test:e2e` で緑でも本番の DB 経路は未検証のまま残る (実例: Bun.sql は SQLSTATE を
`code` でなく `errno` に入れるため一意制約違反が全て 500 になるバグが `test:e2e` を素通りした)。

`test:e2e:bun` は `scripts/run_e2e_bun.js` がテスト対象サーバーだけを **bun の別プロセス** として起動し、
vitest からは `MISSKEY_E2E_TARGET_MODE=external` で HTTP 越しに叩かせる。テスト本体は同じ
`test/e2e/*.ts` なので件数も同じ。**backend の DB / HTTP / ストリーミングの低層を触ったら両方通すこと**。

### unit / e2e フルスイートの既知の落とし穴 (Bun ランタイムで vitest を起動すると壊れる)

`test` / `test:e2e` / `test-and-coverage(:e2e)` は最後のテスト実行ステップを `scripts/run_unit.js` / `scripts/run_e2e.js` 経由で行っている。これは意図的な回避策 (2026-07-07 対応):

- テストファイルが一定数以上ある状態で vitest を **Bun ランタイムで** 実行すると (`include` glob 経由でも、全ファイルパスを明示的にCLI引数で渡しても同様)、`zod` の named export `z` が未初期化のまま参照され (unit では `[vite] The requested module 'zod' does not provide an export named 'z'`、e2e では `TypeError: undefined is not an object (evaluating 'z.string')`)、**全テストファイルが即座に巻き添えで失敗する**。
- 同じコマンドを **Node.js で** 実行すると再現しない。ファイル数を減らすとBunでも再現しないため、「Bun + 一定数以上のファイル」という組み合わせで初めて顕在化するBun側のESM初期化順序のバグと推測される (Bun 1.3.14 時点)。単体ファイルや少数ファイルの実行では再現しないため見つかりにくい。
- 両スクリプトは自分が Bun で起動されたことを検知すると `scripts/respawn_with_node.js` で **本物の Node.js** により自分自身を再起動する。
- ★ **フォーク爆弾の教訓 (2026-07-07 実際にホストがフリーズした)**: `bun run --bun` は PATH の先頭に `/tmp/bun-node-<hash>/` を注入し、その中の `node` は **bun 本体への symlink**。そのため素朴に `execa('node', ...)` で再起動すると子もまた Bun になり無限再帰でプロセスが際限なく増える (600個超を観測)。さらに、スクリプト自身を本物の node で再起動できても **PATH を掃除しないと** そこから spawn する `node_modules/.bin/vitest` (shebang `#!/usr/bin/env node`) が再び Bun に化ける。`respawn_with_node.js` は (1) realpath 比較で本物の node を解決し、(2) shim ディレクトリを PATH から除去して子に渡し、(3) 環境変数ガードで2段目以降の respawn を禁止する。この3点を欠いた「自己再起動スクリプト」を書いてはいけない。
- vitest には必ず `run` サブコマンドを明示する (省略すると watch モードに入り得て、プロセスが終了せず残り続ける)。
- 新しいテストファイルを追加しても vitest の include glob / `run_e2e.js` の列挙が動的に拾うため、package.json 側の追加対応は不要。
- upstream バグは [oven-sh/bun#21614](https://github.com/oven-sh/bun/issues/21614) (zod の `export { z }` namespace 再export が、変換された中間モジュール経由の import でのみ束縛を失う。最小 repro 付きコメント提出済 2026-07-07)。この Issue がクローズされ、修正版 Bun で再現しないことを確認できたら、`run_unit.js` / `run_e2e.js` を経由せず `vitest run --config ...` 直呼びに戻してよい。

## e2e テストの配置

`packages/backend/test/e2e/` の現状ファイル例:

```
note.ts            ノート関連 (作成・renote・visibility・添付ファイル等)
users.ts           ユーザー関連
timelines.ts       タイムライン
drive.ts           ドライブ (アップロード/ダウンロード)
clips.ts           クリップ
oauth.ts           OAuth フロー
streaming.ts       WebSocket
api.ts             API レイヤ全般 (認証・レート制限など)
api-visibility.ts  公開範囲チェック
endpoints.ts       上記カテゴリに収まらない雑多なもの
2fa.ts             2FA
block.ts / mute.ts / antennas.ts / clips.ts / move.ts / nodeinfo.ts / ...
```

**`admin.ts` は存在しない**。admin 系エンドポイントの e2e は `api.ts` (API レイヤ挙動として) または `endpoints.ts` (雑多枠) に置くのが現実的。

### 判断ルール

1. 自分の追加するエンドポイントが既存カテゴリファイル (`note.ts`, `users.ts` 等) に所属するなら、そこに `describe('...', () => { test(...) })` を追加
2. どのカテゴリにも収まらないなら `endpoints.ts` に追加
3. テストケースが多くなり (>200 行)、独立性が高い場合のみ新ファイル化

`describe` のラベル名は **人間可読** で OK (`describe('Note', ...)`, `describe('管理者操作', ...)` のような形式)。`<category>/<name>` 形式である必要はない。

## 共通 setup

`packages/backend/test/setup.e2e.ts` (vitest の `setupFiles`) が各テストファイル共通の `beforeAll` (テスト DB 初期化 + 環境リセット) を登録する。テストサーバーの起動/停止は別途 vitest の `globalSetup` (`test-server/entry.ts` の `setup()` / `teardown()`) が担う。各テストファイルでは自前の `beforeAll` でユーザーを用意する:

```ts
import { describe, test, beforeAll, afterAll } from 'vitest';
import * as assert from 'node:assert';
import { api, signup, post, role, uploadFile } from '../utils.js';
import type { UserToken } from '../utils.js';

describe('機能名', () => {
	let alice: UserToken;

	beforeAll(async () => {
		alice = await signup({ username: 'alice' });
	});

	test('正常系', async () => {
		const res = await api('<category>/<name>', { /* params */ }, alice);
		assert.strictEqual(res.status, 200);
	});
});
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
	assert.strictEqual(res.status, 400);
	assert.strictEqual(castAsError(res.body as any).error.code, 'NO_SUCH_NOTE');
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
- [test/e2e/endpoints.ts](../../../../../packages/backend/test/e2e/endpoints.ts) — カテゴリ不問の雑多なエンドポイント
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
