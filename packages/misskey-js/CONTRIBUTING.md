# misskey-js の開発

リポジトリ全体の規約は [ルートの CONTRIBUTING.md](/CONTRIBUTING.md) を参照。ここでは `packages/misskey-js` 固有の事情だけを扱う。

## API レポート (API Extractor)

`etc/misskey-js.api.md` は、このパッケージが export している関数・型のスナップショット。
export に変更を加えたら再生成してコミットする:

```sh
bun run --filter misskey-js api
```

レポートの差分そのものがレビュー材料になる (意図しない破壊的変更の検出、影響範囲の確認)。

## 自動生成コード

`src/autogen/` は backend の API 定義から生成される。backend の `meta` / `paramDef` / `res` を変更した場合は、
リポジトリルートで以下を実行し、生成された差分も同じコミットに含める。手で編集しない。

```sh
bun run build-misskey-js-with-types
```

## テスト

- 振る舞いのテスト: [`/test`](/packages/misskey-js/test) (vitest)
- 型のテスト: [`/test-d`](/packages/misskey-js/test-d) (tsd)。「型が期待したものか」は vitest では担保できないため分けている

```sh
bun run --bun --filter misskey-js test   # vitest + tsd を両方実行
```

WebSocket 層の変更は node と Bun の両方で実サーバーに対して確認する。ランタイム間で挙動が分かれる箇所があり、
モックだけでは検出できない。

## ライセンス

このパッケージは MIT。リポジトリ本体の AGPL SPDX ヘッダーを一律に付けないこと
(`package.json` / `LICENSE` と既存ファイルのヘッダーに従う)。
