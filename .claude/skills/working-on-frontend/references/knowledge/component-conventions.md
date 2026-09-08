# SFC・状態・操作の契約

## コンポーネントの型

Composition API と `<script setup lang="ts">` を使う。属性順は問わない。props・emits は型引数形式で宣言し、既定値には `withDefaults` を使える。新しい Options API や runtime object 形式の props を持ち込まない。

既存の契約を見て v-model の型、null、必須性、イベントのタイミングを維持する。[MkInput.vue](../../../../../packages/frontend/src/components/form/MkInput.vue) は入力種別に応じた generic と `modelValue`/emit、[MkSelect.vue](../../../../../packages/frontend/src/components/form/MkSelect.vue) は候補の値型を制約する `defineModel` を使う。行数のために一方へ統一しない。型 export が必要な場合は通常の `<script lang="ts">` を併用する。

## 状態の所有者

| 変更する値 | 確認する実装と契約 |
| --- | --- |
| 画面内の入力・開閉 | コンポーネントまたは既存 composable が所有する。保存不要な値を全体 store に持ち上げない |
| アプリ状態の永続化 | [store.ts](../../../../../packages/frontend/src/store.ts) と [store/persisted-state.ts](../../../../../packages/frontend/src/store/persisted-state.ts)。Pinia の state と `account` / `device` / `deviceAccount` の保存先、復元、flush を揃える |
| ユーザー設定 | [preferences.ts](../../../../../packages/frontend/src/preferences.ts)、[preferences/store.ts](../../../../../packages/frontend/src/preferences/store.ts)、[preferences/def.ts](../../../../../packages/frontend/src/preferences/def.ts)。profile、account override、同期範囲を保ち、独自 localStorage 管理を並設しない |
| サーバー取得結果 | [query/api.ts](../../../../../packages/frontend/src/query/api.ts) と [query/keys.ts](../../../../../packages/frontend/src/query/keys.ts)。host・account・endpoint・params の分離、mutation 後の invalidation、[streaming 更新](../../../../../packages/frontend/src/query/streaming.ts) を揃える |
| 一覧・timeline | [Paginator](../../../../../packages/frontend/src/utility/paginator.ts) が項目、cursor、先行 queue、取得状態を所有する。公開メソッドで更新し、items を外部から直接書き換えない。query と別々の一覧正本を作らない |

[misskey-api.ts](../../../../../packages/frontend/src/utility/misskey-api.ts) の明示 token・`data.i`・signal 付き呼び出しは通常の account cache と同じ経路ではない。cache 化やリクエスト統合でこの条件を落とさない。匿名・別アカウントの結果が混ざらず、ログアウトや切替後に古い値を表示しないことを確認する。

## 非同期処理と終了

条件変更・再読込・unmount のどこで所有権が終わるかを決める。AbortSignal を受ける既存 API には signal を渡し、古い応答が新しい state を上書きしないようにする。取消と実際の取得失敗は別に扱う。Paginator の reload 時の取消を、unmount 時の解放まで保証するものと解釈しない。

stream 接続、イベント購読、timer、observer、animation frame は所有者が解除する。既存 composable の自動解放範囲を確認して再利用し、手動登録には対応する解除を持たせる。[MkStreamingNotesTimeline.vue](../../../../../packages/frontend/src/features/notes/components/MkStreamingNotesTimeline.vue) では Paginator と接続を別に管理し、条件変更時に接続し直し、unmount 時に接続や描画用資源を解放する。共有接続の利用者が別利用者の接続全体を閉じないようにする。

## 操作性

アクションには button、遷移にはリンクや既存の MkA を使う。独自 role を使う必要がある場合は、keyboard 操作、フォーカス、disabled 時の実際の抑止まで実装する。`aria-disabled` や見た目だけでは操作を止められない。

フォームの label と caption は実際の入力要素へ接続し、アイコンだけの操作にもアクセシブル名を付ける。既存の Tabler icon と共通部品を利用し、装飾と意味を持つ画像を区別する。モーダルは開閉時のフォーカス移動と復帰、入力は IME 変換中の Enter、無効状態と送信動作を確認する。[form-controls-accessibility.test.ts](../../../../../packages/frontend/test/form-controls-accessibility.test.ts) は既存の確認先であり、実ブラウザでの操作確認の代用ではない。
