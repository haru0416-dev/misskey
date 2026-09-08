# 画面・コンポーネントを追加・改修する

## 配置と利用側

[現行の配置と依存方向](../../../../../packages/frontend/src/README.md) に合わせる。共通部品は `components/<category>/`、機能を知る部品は `features/<feature>/components/`、ルート画面は `pages/` に置く。共有・機能部品の `Mk*` 命名を維持し、ページや widget まで一律に付け替えない。`components/` 直下に部品を増やさず、global 登録は [components/index.ts](../../../../../packages/frontend/src/components/index.ts) の責務とする。

近い既存部品とその利用側を読み、props・emits・slots・v-model の契約を確定する。変更する公開型や配置は全利用側を移し、旧 import や不要な re-export を残さない。単独表示か、画面全体の状態遷移かを区別して確認経路を選ぶ。

## 実装で判断すること

- SFC の型と操作性は [component-conventions.md](../knowledge/component-conventions.md) に合わせる。ローカル state、永続設定、query cache、Paginator のどこが値を所有するかを決め、同じデータの別管理を増やさない。
- ユーザーに見せる文言は [i18n-usage.md](../knowledge/i18n-usage.md)、キー変更は [adding-i18n-key.md](adding-i18n-key.md) を使う。
- 見た目は [scss-modules.md](../knowledge/scss-modules.md) の既存トークンと部品を使う。単独部品だけでなく配置先の幅・overflow・スクロールも確認する。
- 確認・入力・メニューは [os-api.md](../knowledge/os-api.md) を使い、取消と成功を区別する。
- 共有描画を変えたら embed、通知に影響する変更なら service worker の対応する利用側まで追う。接続先は [Skill 入口](../../SKILL.md) を参照する。

## 利用経路で確かめる

[frontend-testing.md](../knowledge/frontend-testing.md) から、既存テストと実ブラウザで対象挙動を確認する。新しい部品だからという理由だけで新テストや framework を追加しない。[カタログ](../knowledge/component-catalog.md) で継続して再現する価値がある状態は隣接する story に置く。既存 story の props やイベントを壊した場合は同じ変更で更新する。

画面では、変更に関係する入力・確定・取消・再表示を実行する。取得や保存を変えた場合は待機・失敗・再取得、条件変更直後の古い応答、アカウント切替時の非漏洩を確認する。レイアウト変更では狭い画面、長い文言、テーマ、keyboard・フォーカス・スクロールを実際に見る。型検査や mount 成功を、この確認の代わりにしない。

共通の提出条件は [AGENTS.md](../../../../../AGENTS.md) を使う。確認した画面・操作・結果と、未確認の条件を分けて報告する。
