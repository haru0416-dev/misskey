# フロントエンドの検証経路

変更した契約に最も近い既存 suite と実挙動を使う。新機能に一律の E2E、新 framework、テスト数の目標を課さない。既存の検出能力は維持し、恒久テストを足すのは現実的な回帰を検出する場合に限る。共通の最終確認は [AGENTS.md](../../../../../AGENTS.md) に従う。

## 既存 suite

| 対象 | 入口 |
| --- | --- |
| 全 unit suite | [frontend/test](../../../../../packages/frontend/test/) と実装に隣接するテスト。`bun run --bun --filter frontend test` は Node と Chromium の両 project を実行 |
| DOM 不要のロジック・注入した IO | `*.test.ts`。`bun run --bun --filter frontend test:node` |
| Vue・DOM・ブラウザーの状態 | `*.browser.test.ts`。`bun run --bun --filter frontend test:browser` |
| 一覧の取得・取消・queue | [paginator.browser.test.ts](../../../../../packages/frontend/test/paginator.browser.test.ts) |
| cache・認証付き取得 | [query.browser.test.ts](../../../../../packages/frontend/test/query.browser.test.ts) |
| 設定と永続化 | [preferences-store.browser.test.ts](../../../../../packages/frontend/test/preferences-store.browser.test.ts)、[persisted-state.test.ts](../../../../../packages/frontend/test/persisted-state.test.ts) |
| フォーム操作 | [form-controls-accessibility.browser.test.ts](../../../../../packages/frontend/test/form-controls-accessibility.browser.test.ts) |
| 単独部品の browser 検証 | [component-catalog.md](component-catalog.md)。`bun run --bun --filter frontend test:stories` |
| サーバーを通る画面操作 | [tests/e2e/specs](../../../../../tests/e2e/specs/) と [playwright.config.ts](../../../../../tests/e2e/playwright.config.ts)。`bun run pw:run`、対話実行は `bun run pw:open` |

対象を絞るときは既存 runner のファイル・テスト名指定を使い、指定した対象と結果を記録する。suite を狭めた成功を全体成功と報告しない。

共通 setup の [test/init.ts](../../../../../packages/frontend/test/init.ts) は `setupFiles` だけから実行する。テストから直接 import せず、共有する設定値や通信 fixture の操作は [test/fixtures.ts](../../../../../packages/frontend/test/fixtures.ts) を使う。

## 起動の前提

コマンドは [frontend/package.json](../../../../../packages/frontend/package.json)、[root package.json](../../../../../package.json)、準備順は [test-frontend.yml](../../../../../.github/workflows/test-frontend.yml) を照合する。

unit と catalog は backend に接続しない。未準備なら CI 同様に `bun run build-pre` と `bun run build:frontend-deps` で依存を準備する。unit の browser project と catalog の browser 検証には `bun run playwright:install` も必要。Node project は DOM 用の setup を使わず、browser project はネイティブの DOM・Storage を使う。unit の browser project の HTTP 通信はテストサーバーの origin に限定し、必要な API 応答はテストごとに用意する。

E2E はテスト用 DB・Valkey と全体 build が必要。[packages/backend/test/compose.yml](../../../../../packages/backend/test/compose.yml) のテスト用構成を使い、開発・本番データへ接続しない。Playwright の webServer はデフォルトで `bun run start:test` を起動する。この script はテスト設定を `.config/test.yml` に配置し、migration を適用して起動するため、既存設定と接続先を確認してから実行する。

デフォルトの接続先は `http://localhost:61812`。`MISSKEY_TEST_BASE_URL` と `MISSKEY_TEST_START_COMMAND` で変更でき、ローカルでは既存サーバーを再利用する設定なので、対象がテスト用か確認する。

## 実ブラウザで残す証拠

対象画面で変更した操作を行い、表示結果と副作用を確認する。状態管理を変えるなら再表示・復元・条件変更・account 切替、timeline なら順序・重複・欠落・新着 queue・スクロール、非同期処理なら失敗・取消・離脱後の更新を選んで確認する。未許可の投稿や別 account の情報が一瞬でも出ないことも対象にする。

UI 変更はレイアウト、keyboard、フォーカス、入力、狭い画面やテーマなど影響する条件を実際に観測する。型検査、mock の成功、スクリーンショットだけでは操作成功を主張しない。環境不足で実画面を開けない場合は、代わりに実行した確認と未確認の操作・前提を明記する。
