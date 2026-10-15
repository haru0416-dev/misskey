<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/toneriko-lockup-dark.svg">
    <img src=".github/assets/toneriko-lockup-light.svg" width="360" alt="Toneriko">
  </picture>

  <p><strong>Misskey をもとに独自に開発している、ActivityPub 対応のソーシャルプラットフォーム</strong></p>

  <p>
    <a href="https://github.com/toneriko-dev/toneriko/actions/workflows/test-backend.yml"><img src="https://img.shields.io/github/actions/workflow/status/toneriko-dev/toneriko/test-backend.yml?branch=develop&style=flat-square&label=backend" alt="backend"></a>
    <a href="https://github.com/toneriko-dev/toneriko/actions/workflows/test-frontend.yml"><img src="https://img.shields.io/github/actions/workflow/status/toneriko-dev/toneriko/test-frontend.yml?branch=develop&style=flat-square&label=frontend" alt="frontend"></a>
    <a href="https://github.com/toneriko-dev/toneriko/actions/workflows/test-federation.yml"><img src="https://img.shields.io/github/actions/workflow/status/toneriko-dev/toneriko/test-federation.yml?branch=develop&style=flat-square&label=federation" alt="federation"></a>
    <a href="./package.json"><img src="https://img.shields.io/github/package-json/v/toneriko-dev/toneriko/develop?style=flat-square&color=26739f&label=version" alt="version"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-434d54?style=flat-square" alt="AGPL-3.0"></a>
  </p>

  <p>
    <a href="#構成">構成</a>
    ·
    <a href="#動かす">動かす</a>
    ·
    <a href="#文書">文書</a>
    ·
    <a href="./CONTRIBUTING.md">開発に参加する</a>
    ·
    <a href="./CHANGELOG.md">変更履歴</a>
  </p>
</div>

<br>

[Misskey](https://github.com/misskey-dev/misskey) から分かれた、フェディバースのサーバーです。upstream には追従せず、独自に開発しています。連合の相手や既存のクライアントと通信できるよう、プロトコルの識別子と公開 API の名前は Misskey のままです。

## 構成

| 層 | 使っているもの |
| --- | --- |
| バックエンド | Bun、Hono、drizzle-orm |
| フロントエンド | Vue 3、Vite |
| データ | PostgreSQL 18、Valkey 8(キャッシュとジョブキュー)、FFmpeg(動画とサムネイル) |

| ディレクトリ | 内容 |
| --- | --- |
| [packages/backend](./packages/backend) | REST API、ActivityPub、ストリーミング、ジョブキュー、DB のスキーマ |
| [packages/frontend](./packages/frontend) | Web クライアント。外部サイトへの埋め込み表示(`src/embed/`)と共有のテーマ・スタイル(`src/shared/`)を含む |
| [packages/sw](./packages/sw) | Service Worker |
| [packages/misskey-js](./packages/misskey-js) | API の TypeScript SDK。型は API 定義から生成する |
| [packages/i18n](./packages/i18n) | 言語ファイルの型生成と読み込み |
| [packages/icons-subsetter](./packages/icons-subsetter) | 使う Tabler Icons だけのフォントを作る |
| [locales](./locales) | 言語ファイル。手で直すのは `ja-JP.yml` だけ |
| [deploy](./deploy) | Docker Compose と nginx の設定例 |
| [tests/e2e](./tests/e2e) | Playwright の E2E テスト |

[mfm-js](https://github.com/toneriko-dev/mfm-js)、[toneriko-script](https://github.com/toneriko-dev/toneriko-script)、[slacc](https://github.com/toneriko-dev/slacc) は別のリポジトリで開発し、release のタグを git の依存として読み込みます。

## 動かす

[`.bun-version`](./.bun-version) の Bun、PostgreSQL、Valkey、FFmpeg が要ります。

```sh
cp .config/docker_example.env .config/docker.env
docker compose -f deploy/compose.local-db.yml up -d
bun install --frozen-lockfile
bun run build
bun run migrate
bun run dev   # http://localhost:3000
```

設定は `.config/default.yml` です。リポジトリにある `default.yml` は PostgreSQL を 55432、Valkey を 56379 で探します。`compose.local-db.yml` は 5432 と 6379 で待ち受けるので、どちらかに合わせてください。運用には [deploy/compose.example.yml](./deploy/compose.example.yml) と [nginx の設定例](./deploy/nginx.md) を使います。

## 文書

| 文書 | 内容 |
| --- | --- |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 開発環境、テスト、コーディングの決まり |
| [SECURITY.md](./SECURITY.md) | 脆弱性の報告 |
| [CHANGELOG.md](./CHANGELOG.md) | 変更履歴 |
| [AGENTS.md](./AGENTS.md) | AI エージェント向けの指針 |

## ライセンス

[AGPL-3.0](./LICENSE) です。[packages/misskey-js](./packages/misskey-js) と、別のリポジトリの部品は MIT です。Misskey の開発者と貢献者の著作権表示は、元のまま残しています。
