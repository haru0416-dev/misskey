# i18n

[locales](../../locales) の言語ファイル(`ja-JP.yml` など)を、バックエンド、フロントエンド、Service Worker が同じ型と形式で使うためのパッケージです。ワークスペースの内部でだけ使い、npm には公開しません。

言語ファイルの本体は `/locales` にあります。手で編集するのは `ja-JP.yml` だけで、他の言語は Crowdin が管理します。

## 提供するもの

- `ja-JP.yml` から生成した、言語ファイルの型(`Locale`・`ILocale`)
- 言語の一覧(`languages`)と、読み込んだ各言語のデータ(`locales`)
- フロントエンド向けに、言語ごとの JSON を書き出す処理(`writeFrontendLocalesJson`)

## コマンド

| コマンド | 内容 |
| --- | --- |
| `bun run --filter i18n build` | `ja-JP.yml` から型を生成し、`src` を `built/` へビルドする。各言語を `built/locales/*.json` に、フロントエンド向けの JSON をリポジトリ直下の `built/_frontend_dist_/locales` に書き出す |
| `bun run --filter i18n watch` | 言語ファイルとソースを監視して、`build` を繰り返す |
| `bun run --filter i18n generate` | `ja-JP.yml` から `src/autogen/locale.ts` の型だけを生成する |
| `bun run --filter i18n verify` | 言語どうしで、キーの型と引数が食い違っていないかを検査する |
| `bun run --filter i18n test` | ビルドしてテストを実行する |

`src/autogen/` は生成物です。手で編集しません。
