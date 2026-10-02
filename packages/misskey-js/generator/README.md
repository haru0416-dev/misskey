# misskey-js-type-generator

バックエンドが出力する OpenAPI の `api.json` から、misskey-js が使う型を生成するモジュールです。misskey-js 本体にはバンドルしません。生成したファイルを `packages/misskey-js/src/autogen/` に置いて使います。

通常は、リポジトリのルートで次のコマンドを実行します。バックエンドをビルドして `api.json` を出力し、型を生成して `src/autogen/` を入れ替え、misskey-js のビルドと API レポートの更新まで行います。

```sh
bun run build-misskey-js-with-types
```

バックエンドの API の `meta`・`paramDef`・`res` を変えたときは、このコマンドを実行して、`src/autogen/` の差分も同じ変更に含めてください。

## 単独で実行する

`api.json` を入手して、このディレクトリに置きます。稼働中のサーバーの `/api.json` からダウンロードするか、`packages/backend` で次を実行します。

```sh
bun run generate-api-json
```

そのあと、このディレクトリで次を実行します。

```sh
bun run generate
```

`./built/autogen/` に TypeScript のファイルができます。misskey-js に取り込むには、`packages/misskey-js` で次を実行します。

```sh
bun run update-autogen-code
```

`src/autogen/` は生成物で、手で編集しません。
