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

master は、設定の `server.process.httpWorkers` と `queueWorkers` に従って、HTTP 担当とキュー担当を配置します。HTTP が 1 プロセスなら master 自身が担当し、2 プロセス以上なら HTTP ワーカーを fork します。HTTP が 0 なら master がキューを担当します。ワーカーが落ちると、同じ役割で作り直します。環境変数 `MK_ONLY_SERVER` と `MK_ONLY_QUEUE` で、このホストでは片方の役割だけを動かすこともできます。統計の配信などのデーモンは、ホスト内で 1 つのプロセスだけが持ちます。

### 接続予算と分離運用の監視

`database.pool.maximumConnectionsPerHost` は、ホスト単位の DB 接続予算です。CPU 数で制限した HTTP・キュープロセス数の合計で割り、端数は使いません。fork 専任の master は配分から除き、`MK_DISABLE_CLUSTERING` で HTTP とキューを同じプロセスに置く場合は 1 つのプールに配分します。各プールに最低 1 接続が必要なので、予算が DB 利用プロセス数を下回る設定は、fork や接続を始める前にエラーになります([misc/process-topology.ts](./src/misc/process-topology.ts))。

複数ホストでは各ホストの予算を合計し、migration・管理 CLI・監視用接続と PostgreSQL の予約接続を加えて、`max_connections` 内に収めてください。キューの `concurrencyPerWorker` は worker ごとの値なので、全ホストの worker 数を掛けた配送並列数を、DB・Valkey・外部通信の容量に合わせます。`maximumStartsPerSecond` は BullMQ の limiter に渡す値で、同じ Valkey・キューを使う worker 全体で共有する開始レートです。worker を増やしても開始レートは倍増しません。各ホストで同じ値を設定してください([BullMQ の rate limiting](https://docs.bullmq.io/guide/rate-limiting))。

`/healthz` は、その HTTP ホストの起動状態、同じ master が管理するキューの readiness、DB と Valkey の接続を確認します。`MK_ONLY_SERVER` で別ホストへキューを分離した場合、外部の consumer が停止しても HTTP の health は成功し得ます。HTTP の health だけで配送の稼働を判断せず、キューホストのプロセス監視と、管理画面の「ジョブキュー」または次の API を併用してください。

| API・項目 | 監視する状態 |
| --- | --- |
| `admin/queue/queues`、`admin/queue/queue-stats` | `counts.waiting`、`active`、`delayed`、`failed`、`isPaused` と `metrics.completed` の進行。`waiting` は `prioritized` を含むため、二重に加算しません |
| 上記の `db` キューの `outbox` | `pending`、`oldestPendingAgeMs`、`deadLetter`、`deliveryFailed`、`invalidPayload` |
| 上記の `deliver` キューの `cleanup` | 配送 outbox 由来の、処理完了・明示破棄後のジョブ削除待ち `pending`、削除失敗後の `retrying`、`oldestPendingAgeMs`。配送の未完了件数には加算しません |
| `admin/queue/outbox-dead-letters` | 処理を諦めたジョブの理由と内容 |

これらの API は moderator の認証と `read:admin:queue` 権限が必要です。監視用トークンを公開 health URL やログへ含めないでください。処理待ちがあるのに完了が進まない状態、最古の pending の経過時間、failed・dead-letter の増加を継続して観測し、通常のバックオフと保守時の一時停止を踏まえて通知条件を決めます。件数 0 だけでは consumer の稼働を証明できません。配送の最終確認には、管理する別サーバーとの送受信と反映の確認も必要です。

DB 保存、キュー受理、相手サーバーへの反映は別の完了条件です。再試行では同じ処理が再実行されるため、新しい後処理を追加する場合は、重複実行と途中停止からの回復を確認してください。

配送 outbox を持つジョブの正常終了またはデッドレターの明示破棄を記録するとき、`delivery_queue_cleanup` への保存と配送 outbox の子行削除を同じ transaction で確定します。削除待ちの記録には配送本文や coordinator への参照を持たせず、アカウント削除などはジョブの資源回収を待ちません。キューへの正常終了記録は、相手サーバーでの反映完了を保証するものではありません。

資源回収は配送の発行とは別に進みます。1 回に最大 500 件を claim し、30 秒のリースと行ロックで所有者を確認して最大 16 件を並行処理します。削除失敗は記録を残して 1～30 秒のバックオフで再試行し、削除後の SQL 失敗も記録から再開します。ジョブが不在なら削除済みとして完了しますが、削除待ちから配送を再発行することはありません。

管理 API の通常の削除・一括削除は、未解決の配送 outbox を含む場合に `409 QUEUE_JOB_NOT_TERMINAL` で拒否します。完了済みのキュージョブまたは削除待ち記録が残る配送の再試行は `409 QUEUE_JOB_ALREADY_ACKNOWLEDGED` です。遅延ジョブの昇格は利用でき、失敗した配送の再試行・破棄はデッドレターの操作を使います。認証と `write:admin:queue` 権限は引き続き必要です。

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
