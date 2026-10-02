# backend

Toneriko のサーバー本体です。Bun の上で、Hono の HTTP サーバーと REST API、ActivityPub の連合、WebSocket のストリーミング、BullMQ のジョブキューが動きます。データは drizzle-orm を通して PostgreSQL に、キャッシュとキューは Valkey に置きます。

開発環境の準備とテストの実行は、[ルートの CONTRIBUTING.md](../../CONTRIBUTING.md) にあります。

## 構成

`src/` の主なディレクトリです。

| ディレクトリ | 内容 |
| --- | --- |
| `boot/` | 起動。`entry.ts` が master を起動し、master が HTTP 担当とキュー担当のワーカーを fork する。`cli.ts` は管理用の CLI |
| `server/rest/` | REST API。契約は `contracts/`、実装は領域ごとのディレクトリ、契約と実装を結ぶ登録は `endpoints/` |
| `server/activitypub/` | ActivityPub の inbox と、オブジェクトの取得 |
| `server/streaming/` | WebSocket のストリーミング |
| `server/web/` | 画面の配信、フィード、URL プレビュー |
| `server/file/` `server/oauth/` | ファイルの配信とプロキシ、OAuth |
| `queue/` | ジョブキューのワーカーと、ジョブごとのハンドラ |
| `core/` | 領域ごとの処理。DB を読み書きする `*-store.ts`、依存を受けて関数群を返す `*-service.ts`、状態を持たない `*-logic.ts` |
| `db/` | DB 接続(`bun-sql.ts`)と、drizzle のスキーマ(`schema/`) |
| `models/` | エンティティの型。`MiUser` のように `Mi` を付けた名前を持つ |
| `misc/` | 領域に属さない補助の処理。`prelude/` は標準機能を補う小さな関数 |
| `runtime-dependencies.ts` | 実行時の依存(DB、Valkey、各サービス)を組み立てる |
| `migration-runner.ts` | migration の適用と検査 |

## 設計の決まり

- DI コンテナは使いません。依存は引数で明示的に渡します。API のハンドラは、必要な依存を `deps` として第一引数で受け取ります。状態や設定を持つサービスは `createXxx()` の関数で作ります。
- 依存は下から上へだけ流れます。`core/`、`db/`、`misc/`、`models/` は、`server/`、`queue/`、`boot/` を import しません。HTTP のエラーや入力の検証が、共有の処理に入り込むのを防ぐためで、[test/unit/layer-boundaries.test.ts](./test/unit/layer-boundaries.test.ts) が検査します。
- API の契約は `server/rest/contracts/` に `defineContract` で宣言します。認証、権限、レートリミットは、契約の `meta` からガードを組み立てます。ハンドラにこれらを手で書き足しません。

API を足すときの手順は [`.claude/skills/working-on-backend`](../../.claude/skills/working-on-backend/SKILL.md) にあります。

## プロセスの構成

master は、設定の `server.process.httpWorkers` と `queueWorkers` の数だけ、HTTP 担当とキュー担当のワーカーを fork します。ワーカーが落ちると、同じ役割で作り直します。環境変数 `MK_ONLY_SERVER` と `MK_ONLY_QUEUE` で、このホストでは片方の役割だけを動かすこともできます(HTTP 用のホストとキュー用のホストを分ける構成)。統計の配信などのデーモンは、全体で 1 つのプロセスだけが持ちます。DB の接続数の上限は、ホスト全体のプロセス数から割り振ります([misc/process-topology.ts](./src/misc/process-topology.ts))。

## コマンド

ルートから `bun run --filter backend <コマンド>` で実行します。

| コマンド | 内容 |
| --- | --- |
| `build` | サーバーをビルドする |
| `start` | ビルド済みのサーバーを起動する |
| `dev` | 設定を生成し、ソースの変更を監視して再ビルドする。サーバーの起動まで含めた開発用の起動は、ルートの `bun run dev` |
| `migrate` | 未適用の migration を適用する |
| `check-migrations` | 未適用の migration がないことを確かめる |
| `db:generate` | スキーマの差分から migration を生成する |
| `db:generate:custom` | 空の migration を生成する。特殊な DDL を書くのに使う |
| `cli` | 管理用の CLI を起動する |
| `check:connect` | PostgreSQL と Valkey に接続できるかを確かめる |
| `compile-config` | `.config/*.yml` から、実行時に読む設定を生成する |
| `generate-api-json` | OpenAPI の `api.json` を出力する |
| `typecheck` | 型検査を行う |

ルートからは `bun run build`、`bun run migrate`、`bun run dev` でも実行できます。ルートの `bun run dev` は、バックエンドに加えて、フロントエンドと Service Worker も監視します。

## DB と migration

`src/db/schema/` が、drizzle のテーブル定義です。

`migration/0000_init.sql` が、schema 全体を作ります。拡張機能、enum、関数、テーブルとローカル制約、index、外部キー、初期データ、トリガの順に並べています。drizzle-kit では出力できない DDL(チャート表、関数 index、trigram index、トリガ)も含みます。以降の変更は、新しい migration として足します。

`bun run migrate` は、`migration/meta/_journal.json` の順に、未適用の migration を適用します。適用は、advisory lock を持つ 1 つのセッションの中で行います。履歴のない既存の schema には適用できず、エラーになります。

schema を変えるときは `db:generate` を、特殊な DDL は `db:generate:custom` を使います。適用済みの SQL は書き換えません。`migration/_legacy/` は、drizzle-kit に移る前の手書きの migration の記録で、実行には使いません。判断の細部は [`.claude/skills/working-on-backend`](../../.claude/skills/working-on-backend/references/tasks/creating-migration.md) にあります。

## テスト

| 種類 | 場所 | コマンド |
| --- | --- | --- |
| 単体テスト | `test/unit`、`src/**/*.test.ts` | `test` |
| E2E(1 サーバー) | `test/e2e` | `test:e2e`(同じプロセス内)、`test:e2e:bun`(別のプロセスで起動した実サーバーに対して実行) |
| 連合の E2E(複数サーバー) | `test-federation/` | [test-federation/README.md](./test-federation/README.md) |

テストは vitest を Bun の上で動かします。専用の PostgreSQL と Valkey を使うので、`.config/test.yml` を用意し、`test/compose.yml` でサーバーを起動してください。手順は [CONTRIBUTING.md](../../CONTRIBUTING.md) の「Testing」にあります。開発用の DB と設定は、テストで書き換えないでください。

`test/unit` は、`src/` のディレクトリ構成に合わせて置きます。
