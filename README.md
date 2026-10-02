# Toneriko

Toneriko は、[Misskey](https://github.com/misskey-dev/misskey) をもとに独自に開発している、ActivityPub 対応のソーシャルプラットフォームです。フェディバースの他のサーバーと連合し、投稿・フォロー・リアクション・チャットなどの機能を備えます。

Misskey の upstream には追従しない、独立した製品です。連合の相手や既存の Misskey 向けクライアントと通信するためのプロトコルの識別子と公開 API の名前は、変えると通信できなくなるため、Misskey のものをそのまま使っています。

## 構成

バックエンドは Bun 上の Hono と drizzle-orm、フロントエンドは Vue 3 と Vite で動きます。データは PostgreSQL に、キャッシュとジョブキューは Valkey に置きます。動画とサムネイルの処理には FFmpeg が必要です。

| ディレクトリ | 内容 |
| --- | --- |
| [packages/backend](./packages/backend) | サーバー本体。REST API、ActivityPub、ストリーミング、ジョブキュー、DB のスキーマと migration |
| [packages/frontend](./packages/frontend) | Web クライアント |
| [packages/frontend-embed](./packages/frontend-embed) | 投稿・ユーザー・クリップを外部サイトに埋め込む表示 |
| [packages/frontend-shared](./packages/frontend-shared) | frontend と frontend-embed が共有するテーマ・スタイル・ユーティリティ |
| [packages/sw](./packages/sw) | Service Worker(プッシュ通知など) |
| [packages/misskey-js](./packages/misskey-js) | API とストリーミングの TypeScript SDK。型はバックエンドの API 定義から生成する |
| [packages/mfm-js](./packages/mfm-js) | MFM(投稿の装飾記法)のパーサー |
| [packages/aiscript](./packages/aiscript) | AiScript の処理系(Play・ウィジェット・プラグインが使う) |
| [packages/i18n](./packages/i18n) | 言語ファイルの型生成と共通の読み込み処理 |
| [packages/icons-subsetter](./packages/icons-subsetter) | 使用中の Tabler Icons だけを取り出したフォントを作るツール |
| [packages/slacc](./packages/slacc) | 署名と zip 展開を行う Rust 製のネイティブモジュール |
| [locales](./locales) | 言語ファイル。手で編集するのは `ja-JP.yml` だけ |
| [deploy](./deploy) | Docker Compose の例、nginx の設定、CAPTCHA サービス(Cap)の導入手順 |
| [tests/e2e](./tests/e2e) | Playwright によるブラウザの E2E テスト |

## 動かす

必要なものは、[`.bun-version`](./.bun-version) の Bun、PostgreSQL 18、Valkey 8、FFmpeg です。開発用の PostgreSQL と Valkey は、次のコマンドで起動できます。

```sh
bun install --frozen-lockfile
docker compose -f deploy/compose.local-db.yml up -d
bun run build
bun run migrate
bun run dev
```

設定は `.config/default.yml` に書きます(雛形は [`.config/example.yml`](./.config/example.yml))。リポジトリの `default.yml` は PostgreSQL を 55432、Valkey を 56379 で参照しますが、`deploy/compose.local-db.yml` は 5432 と 6379 で待ち受けます。どちらかのポートと認証情報をそろえてください。`compose.local-db.yml` は `.config/docker.env` を読むので、初回は [`.config/docker_example.env`](./.config/docker_example.env) をコピーして用意します。起動後は `http://localhost:3000` で開けます。Devcontainer とテストの実行方法は [CONTRIBUTING.md](./CONTRIBUTING.md) を読んでください。

サーバーとして運用する場合は、[deploy/compose.example.yml](./deploy/compose.example.yml) と [Dockerfile](./Dockerfile) を使います。HTTPS は前段のリバースプロキシで終端する構成です。nginx の設定例は [deploy/nginx.md](./deploy/nginx.md) にあります。

## 文書

| 文書 | 内容 |
| --- | --- |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 開発環境、テスト、コーディングの決まり |
| [SECURITY.md](./SECURITY.md) | 脆弱性の報告方法 |
| [CHANGELOG.md](./CHANGELOG.md) | このプロジェクトの変更履歴 |
| [docs/archive/upstream-changelog.md](./docs/archive/upstream-changelog.md) | Misskey 2026.6.0 までの upstream の変更履歴 |
| [AGENTS.md](./AGENTS.md) | AI エージェント向けの共通の指針 |

各パッケージとディレクトリの README に、そこで作業するときの前提を書いています。

## ライセンス

このリポジトリは、特に記載のない限り [GNU Affero General Public License v3.0](./LICENSE) で配布しています。[packages/misskey-js](./packages/misskey-js)、[packages/mfm-js](./packages/mfm-js)、[packages/aiscript](./packages/aiscript)、[packages/slacc](./packages/slacc) は MIT で、それぞれの `LICENSE` に従います。Misskey の開発者と貢献者の著作権表示は、元のまま残してあります。
