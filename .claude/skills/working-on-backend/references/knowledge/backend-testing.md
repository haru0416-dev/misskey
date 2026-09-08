# Backend の検証入口

## 先に環境を分離する

[backend package.json](../../../../../packages/backend/package.json) のテストスクリプトは `NODE_ENV=test` で config をコンパイルする。`.config/test.yml` がなければ [.github/misskey/test.yml](../../../../../.github/misskey/test.yml) からコピーし、既存ファイルは上書きせず接続先を確認する。

[テスト用 compose](../../../../../packages/backend/test/compose.yml) は PostgreSQL `54312`、Valkey `56312` を公開する。開発用の標準ポートと混同しない。e2e は DB リセットと Valkey の `flushdb` を行うため、専用の接続先が必要。

## 実行経路

コマンドはリポジトリルートから実行する。対象を絞る引数は既存 runner・設定に合わせ、watch ではなく有限の実行にする。

| コマンド | 起動するもの |
| --- | --- |
| `bun run --bun --filter backend test` | unit 用 build、config compile、[run_unit.js](../../../../../packages/backend/scripts/run_unit.js) |
| `bun run --bun --filter backend test:e2e` | e2e 用 build、config compile、[run_e2e.js](../../../../../packages/backend/scripts/run_e2e.js) による Bun 上の Vitest |
| `bun run --bun --filter backend test:e2e:bun` | 同じ e2e 用 build とテストを [run_e2e_bun.js](../../../../../packages/backend/scripts/run_e2e_bun.js) の別プロセスターゲットへ接続 |
| `bun run --bun --filter backend test:fed --run` | 連合用 Vitest。対向サーバー等は [連合テストの準備](../../../../../packages/backend/test-federation/README.md) に従う |

### in-process と external

[vitest.config.e2e.ts](../../../../../packages/backend/vitest.config.e2e.ts) は global setup に [test/target.ts](../../../../../packages/backend/test/target.ts)、各ファイルの setup に [setup.e2e.ts](../../../../../packages/backend/test/setup.e2e.ts) を指定する。

- 既定の local mode は Vitest 側で `built-test/entry.js` を import し、controller を起動する。
- external mode は [e2e_external_target.mjs](../../../../../packages/backend/scripts/e2e_external_target.mjs) が同じ `built-test/entry.js` を別の Bun プロセスで読み込む。Vitest は controller と HTTP で通信する。
- `built-test/entry.js` は [rolldown.config.ts](../../../../../packages/backend/rolldown.config.ts) が [test-server/entry.ts](../../../../../packages/backend/test-server/entry.ts) から生成する。controller の準備完了だけではアプリは起動していない。各ファイルの `/env-reset` がアプリ停止、DB リセット・migration、Valkey 初期化を行い、`boot/common` の `server()` でアプリを起動する。

したがって external e2e はプロセス境界の検証だが、本番の `built/entry.js` を起動する経路の検証ではない。通常 e2e の準備として root の `start:test` を別に立てない。queue worker の所有者は `test/target.ts` の worker mode と、対象テストの `startJobQueue()` 呼び出しで確認する。

DB ドライバは [runtime-dependencies.ts](../../../../../packages/backend/src/runtime-dependencies.ts) の選択条件に従う。Bun 上で `MK_DB_DRIVER=pg` でなく接続予算が 2 以上なら Bun.sql、それ以外は pg 経路となる。migration とリセットには pg pool も使われる。実行ランタイム・環境変数・予算を記録し、テスト名だけで使用ドライバを断定しない。

[vitest.config.ts](../../../../../packages/backend/vitest.config.ts) の zod inline、e2e のファイル逐次実行・固定順序、テスト設定の接続予算には起動と共有 DB の制約がある。設定を変えるなら理由に対応する実行を確認する。e2e の include は `test/e2e/**/*.ts` なので共通ヘルパーはその外へ置く。

## 何を観測するか

[test/utils.ts](../../../../../packages/backend/test/utils.ts) の `api`・`signup`・`post`・`createAppToken`・streaming ヘルパーと、[endpoints-context.ts](../../../../../packages/backend/test/endpoints-context.ts) の共有準備を利用する。配置は機能と契約に合わせ、行数や一 endpoint 一ファイルで決めない。

| 変更する契約 | 近い既存テスト |
| --- | --- |
| 認証・scope・API レイヤ | [api.ts](../../../../../packages/backend/test/e2e/api.ts)、[endpoints-auth.ts](../../../../../packages/backend/test/e2e/endpoints-auth.ts) |
| 公開範囲・取得 | [api-visibility.ts](../../../../../packages/backend/test/e2e/api-visibility.ts)、[ff-visibility.ts](../../../../../packages/backend/test/e2e/ff-visibility.ts) |
| 投稿・集計・競合 | [note.ts](../../../../../packages/backend/test/e2e/note.ts)、[counter-integrity.ts](../../../../../packages/backend/test/e2e/counter-integrity.ts)、[limit-insert-races.ts](../../../../../packages/backend/test/e2e/limit-insert-races.ts) |
| queue の永続状態・再実行 | [queue-outbox.ts](../../../../../packages/backend/test/unit/queue/queue-outbox.ts) と変更する handler の利用側 |
| WebSocket | [streaming.ts](../../../../../packages/backend/test/e2e/streaming.ts) |
| 連合の双方向動作・外部形式 | [test-federation/test](../../../../../packages/backend/test-federation/test/) |

新機能は応答だけでなく保存状態・拒否時の無副作用を、不具合修正は報告された失敗が起こらなくなったことを確認する。競合・再実行・公開範囲など今後も検出する意味のある回帰は恒久テストにする。呼び出し回数、配線、固定文言だけをなぞる assertion を追加して完了とはしない。既存の検出能力を保ち、確認だけに使う一時コードは結果を記録して除去する。

HTTP・WebSocket・連合の変更は実際の通信境界を通す。unit の成功を外部経路の証拠にしない。全体検証の条件は [AGENTS.md](../../../../../AGENTS.md)、最終実行先は [shipping-misskey-change](../../../shipping-misskey-change/SKILL.md) を参照する。
