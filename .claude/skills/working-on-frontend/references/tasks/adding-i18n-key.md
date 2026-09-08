# UI 文言を追加・変更する

編集元は [locales/ja-JP.yml](../../../../../locales/ja-JP.yml)。他言語 YAML は手動編集しない。編集範囲の共通契約は [AGENTS.md](../../../../../AGENTS.md)、配信設定は [crowdin.yml](../../../../../crowdin.yml) にある。

## キーと表示契約

既存キーは意味と引数が合う場合に再利用する。新しいキーは周辺の意味グループに置き、単純キーの lowerCamelCase、カテゴリの `_` 接頭辞、既存の YAML インデントと引用形式に合わせる。`_lang_` は言語自身の表記用なので別用途に使わない。

引数は `{name}` のような単純置換として設計する。ICU の plural/select 構文を持ち込まない。キーや引数名を変えるときは frontend だけでなく embed、shared、sw を含む実際の参照先を更新する。表示用の参照方法は [i18n-usage.md](../knowledge/i18n-usage.md) に従う。

キーの改名は翻訳側で別キーになり得るため、名前の整理だけでは行わない。要求上必要なら、利用側の移行と翻訳への影響を明示して source 側を変更する。翻訳管理のために必要な別作業は条件として報告し、架空の承認状態や同期日程を前提にしない。他人の変更を戻す復旧コマンドを一律に実行しない。

## 生成物と確認

[生成スクリプト](../../../../../packages/i18n/scripts/generateLocaleInterface.ts) が source から `packages/i18n/src/autogen/locale.ts` を生成する。生成物を手で修正しない。

- 型だけを再生成する: `bun run --bun --filter i18n generate`
- 配信 JSON と package の型を含めて更新する: `bun run --bun --filter i18n build`
- 参照側の型確認: `bun run --bun --filter frontend typecheck`

コマンドの正本は [i18n/package.json](../../../../../packages/i18n/package.json) と [build.ts](../../../../../packages/i18n/build.ts)。`generate` と配信資産の build は別なので、新しいキーが型検査に現れたことだけで画面への反映を判断しない。開発時は既に動いている i18n watcher の結果を利用する。

対象画面で文言、補間結果、改行、長さによるレイアウト、アクセシブル名を確認する。型エラーはキー・引数・生成物のどこが不一致かを直し、型 assertion で隠さない。最終的な locale 差分確認と変更記録は共通契約に従う。
