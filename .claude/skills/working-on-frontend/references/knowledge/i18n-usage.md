# 翻訳の参照と埋め込み

[frontend の入口](../../../../../packages/frontend/src/i18n.ts) から `i18n` を使う。表示用文言をコードへ直接追加せず、キー変更は [adding-i18n-key.md](../tasks/adding-i18n-key.md) に従う。

| 表示の用途 | API |
| --- | --- |
| 引数のない文字列 | `i18n.ts.<key>` |
| `{name}` などを文字列へ補間 | `i18n.tsx.<key>({ name })` |
| リンクや強調など Vue の要素を差し込む | [I18n.vue](../../../../../packages/frontend/src/components/global/I18n.vue) に `i18n.ts.<key>` を src として渡し、対応する slot を使う |

[共有実装](../../../../../packages/frontend-shared/utility/i18n.ts) の `ts` は元の文字列を返す。パラメータ付きキーを `ts` で直接表示すると未展開の `{name}` が残るが、I18n コンポーネントへ渡す用途では正しい。`tsx` の型にはパラメータ付きキーだけがあり、値は string または number。補間は単純置換で、ICU の plural/select や HTML エスケープを行わない。

動的なキーは候補を型で絞り、各候補に必要な引数を満たす。変わる値に応じた表示には既存の computed 等を使い、型 assertion や存在しないキーへの fallback で不一致を隠さない。

## HTML とユーザー入力

要素を含む文言は I18n の slot を優先する。既存の `v-html` を変更するときは、翻訳文字列だけでなく補間する値の出所も確認する。ユーザー入力を文字列へ連結して HTML として表示しない。翻訳、MFM、HTML の renderer を同じものとして扱わない。

改行は YAML の値と表示側の white-space の両方で決まる。文字列の変更時は補間、リンク操作、折返し、アクセシブル名まで確認する。

## 不一致の切り分け

- 新キーの型がない: source と [型生成](../../../../../packages/i18n/scripts/generateLocaleInterface.ts) を確認する。配信資産の更新は [build.ts](../../../../../packages/i18n/build.ts) の別処理。
- `Unexpected locale key`: 参照キーと配信中の locale を確認する。
- `Missing locale parameters`: YAML と呼び出し側の引数名・値を揃える。
- 型は合うのに画面が古い: 実行中の i18n build/watch と配信資産を確認する。[updateI18n](../../../../../packages/frontend/src/i18n.ts) はテスト専用で、実画面の更新手段ではない。

補間処理の変更は [i18n.test.ts](../../../../../packages/frontend/test/i18n.test.ts) と embed・service worker の利用側にも波及する。画面の文言だけを変える場合に共有実装の監査まで広げる必要はない。
