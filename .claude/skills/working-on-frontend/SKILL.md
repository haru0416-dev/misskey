---
name: working-on-frontend
description: フロントエンドの画面・状態管理・UI文言・カタログ・ブラウザ検証を追加または変更するときに使う。
---

# フロントエンドの変更

共通の安全条件、SPDX、locale 編集範囲、変更記録、提出時の確認は [AGENTS.md](../../../AGENTS.md) に従う。この Skill は表示・操作とブラウザ状態の境界を扱う。読んだ情報は使い回し、変更に関係する参照だけを開く。

## 変更の入口

- 画面・コンポーネントの追加や改修: [adding-mk-component.md](references/tasks/adding-mk-component.md)
- UI 文言の追加・変更: [adding-i18n-key.md](references/tasks/adding-i18n-key.md)
- SFC の型、状態の所有者、非同期処理、操作性: [component-conventions.md](references/knowledge/component-conventions.md)
- 翻訳の参照・埋め込み: [i18n-usage.md](references/knowledge/i18n-usage.md)
- テーマ・余白・共通スタイル: [scss-modules.md](references/knowledge/scss-modules.md)
- ダイアログ・メニュー・API 結果の表示: [os-api.md](references/knowledge/os-api.md)
- 単独表示と story: [component-catalog.md](references/knowledge/component-catalog.md)
- 既存 suite と実ブラウザの使い分け: [frontend-testing.md](references/knowledge/frontend-testing.md)

## 対象を決める

起点の `.vue` だけでなく、結果を決める呼び出し元、composable、state、API wrapper を辿る。画面の変更が状態の保存・復元、アカウント切替、cache、購読に触れるなら、その所有者と終了条件を先に特定する。

共有描画・テーマ・locale を変える場合は [frontend-shared](../../../packages/frontend-shared/) と [frontend-embed](../../../packages/frontend-embed/src/) の利用側も対象にする。通知・認証状態・配信資産に触れる場合は [sw](../../../packages/sw/src/) との接続を確認する。関係しない領域の全体監査には広げない。

レビューを分担する必要があれば [vue-component-reviewer](../../agents/vue-component-reviewer.md) に対象差分、守る挙動、実行結果を渡す。別のチェックリストを複製せず、この Skill の該当参照を共有する。
