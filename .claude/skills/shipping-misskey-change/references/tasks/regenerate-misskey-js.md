# 公開 API の生成型を更新する

API の追加・削除、`meta`・`paramDef`・`res`、公開 schema、OpenAPI または型 generator の出力契約を変えた場合に使う。API ディレクトリ内の内部処理・コメントだけの変更や、調査・文書変更だけでは実行しない。

生成入力は [endpoints.ts](../../../../../packages/backend/src/server/api/endpoints.ts)、[OpenAPI generator](../../../../../packages/backend/src/server/api/openapi/gen-spec.ts)、[schema 変換](../../../../../packages/backend/src/server/api/openapi/schemas.ts) から追う。ファイルの配置だけでは適用可否を決めない。

## 実行

リポジトリルートから:

```bash
bun run build-misskey-js-with-types
```

[package.json](../../../../../package.json) の script が依存・backend をビルドし、`packages/backend/built/api.json` を生成、`packages/misskey-js/generator/api.json` へ渡し、`packages/misskey-js/src/autogen/` を更新して misskey-js のビルドと API extractor を実行する。

設定コンパイルに必要な開発・検証用設定を確認する。既存の設定を上書きせず、秘密情報は [AGENTS.md](../../../../../AGENTS.md) の条件に従って除外する。実行時間や成功をキャッシュの有無から断定しない。

## 生成後

- 終了結果を確認し、生成型が変更した API 契約と一致するかを見る。失敗した場合、途中まで更新された生成物を完了扱いにしない。
- `packages/misskey-js/src/autogen/` の差分を成果物に含める。手編集で生成結果を合わせない。生成処理はこのディレクトリを置き換えるため、既存の利用者の編集があれば先に区別する。
- 入力を変更したのに差分がない場合は、公開型に影響しない変更なのか、生成対象への登録が漏れているのかを入力と出力から確認する。差分なしだけで正常と判断しない。
- 自動生成型の一致は runtime の入力検証・認可・応答の正しさの証明ではない。利用側の挙動は変更した境界で別に検証する。

[autogen CI](../../../../../.github/workflows/check-misskey-js-autogen.yml) は生成結果と追跡された `src/autogen/` を比較する。中間生成物や意図しない変更をまとめて commit しない。ライセンスは misskey-js の MIT 管轄を維持し、AGPL ヘッダーを一律追加しない。

登録方法を確認する必要がある場合だけ [API 追加手順](../../../working-on-backend/references/tasks/adding-api-endpoint.md) を参照する。
