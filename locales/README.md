# 言語ファイル

**手で編集してよい言語ファイルは `ja-JP.yml` だけです。** `en-US.yml` など、それ以外のファイルは [Crowdin](https://crowdin.com) が管理しています。手で編集しても、次の同期で上書きされて失われます。

`ja-JP.yml` が翻訳の元になります。ここに追加した文字列は、[crowdin.yml](../crowdin.yml) の設定にしたがって Crowdin に送られ、翻訳されたものが他の言語ファイルとして戻ってきます。

## 文字列を足すとき

- `ja-JP.yml` にだけ書く。翻訳の元になるので、日本語の文言をそのまま書く。
- 既存のキーは、意味と引数が合うなら再利用する。新しいキーは、周囲のキーの構成と命名に合わせる。
- キーの型と引数は、[packages/i18n](../packages/i18n) が `ja-JP.yml` から TypeScript の型を生成して保証する。型は `bun run build:frontend-deps` などのビルドで更新される。
- 言語どうしでキーの型や引数が食い違っていないかは、`bun run --filter i18n verify` で調べられる。

開発の手順は [CONTRIBUTING.md](../CONTRIBUTING.md) の「Localization (l10n)」にあります。
