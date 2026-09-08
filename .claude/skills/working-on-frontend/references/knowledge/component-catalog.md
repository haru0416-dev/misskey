# コンポーネントカタログ

[packages/frontend/catalog](../../../../../packages/frontend/catalog/) は単独部品の状態を確認する Vite アプリ。部品の見た目や操作を継続して再現したい場合は、隣に `*.stories.impl.ts` を置く。新しい `.vue` という理由だけで story や play を必須にしない。既存 story がある変更では契約の変化を反映する。

## 書く場所と API

[MkButton.stories.impl.ts](../../../../../packages/frontend/src/components/form/MkButton.stories.impl.ts) の配置と [StoryObj](../../../../../packages/frontend/src/stories/types.ts) に合わせる。`render` は Vue component を返し、`args`、`decorators`、`parameters`、`play` を必要に応じて使う。部品本体の SFC 規約を、文字列 template を返す story の component options にまで適用しない。

イベント記録は [action.ts](../../../../../packages/frontend/src/stories/action.ts)、fixture は [fakes.ts](../../../../../packages/frontend/src/stories/fakes.ts)、操作と assertion は [test.ts](../../../../../packages/frontend/src/stories/test.ts) の既存入口を使う。`parameters.msw` は共通 API handler に重ねる。実データと誤認される token や account は使わず、既存の story fixture を利用する。

## 実行先

| 用途 | リポジトリルートから実行 |
| --- | --- |
| 表示・操作の確認 | `bun run --bun --filter frontend catalog` |
| 配信物の build | `bun run --filter frontend catalog:build` |
| Chromium で mount と play を実行 | `bun run --bun --filter frontend test:stories` |

[設定](../../../../../packages/frontend/vite.catalog.config.ts) の既定は `127.0.0.1:6006`。ポートが使用中なら変わるため、起動ログの URL を使う。依存 package とブラウザの準備は [frontend-testing.md](frontend-testing.md) を参照する。

## ハーネスの境界

[stories.browser.ts](../../../../../packages/frontend/test/stories.browser.ts) は検出した全 story を mount し、ある場合だけ play を実行する。カタログ本体は play を実行しないので、画面を開いたことと play 成功を区別する。

[environment.ts](../../../../../packages/frontend/src/stories/environment.ts) と [seed-account.ts](../../../../../packages/frontend/src/stories/seed-account.ts) が mock、account、instance、popup の初期化を担う。module import 時の初期化順を崩さない。ログイン済み fixture の成功を、匿名や別 account での非漏洩の証拠にしない。

popup は play の `canvasElement` 内に mount される。検索範囲を canvas に限定し、確認 UI が必要な操作では実際に確定・取消する。非同期表示は出現や操作可能な状態を待ち、固定 sleep だけで合わせない。

play は見つかった要素の存在だけでなく、入力後の結果や取消時の非変更など、守りたい契約を確認する。時刻や乱数に依存する状態は fixture・基準時刻で再現し、比較用の隠れた分岐を入れない。mock での mount 成功は、本体の API・権限・保存や実レイアウトの確認を代替しない。
