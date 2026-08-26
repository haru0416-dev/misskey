# Frontend source layout

`src/` は次の責務で分割する。新しいコードは、まず機能固有か横断的かを判断して配置する。

| Directory | Responsibility |
| --- | --- |
| `boot/` | アプリケーション起動と初期化順序 |
| `features/` | 1つのユーザー機能として変更・削除できる縦割りモジュール |
| `pages/` | ルート単位の画面。データ取得や機能モジュールの組み立てを担当 |
| `components/` | 複数featureから使う、ドメインに依存しないUI部品 |
| `composables/` | 複数featureから使うVueライフサイクル・リアクティビティ処理 |
| `directives/` | グローバルまたは横断的なVue directive |
| `query/` | API query cacheの共通基盤 |
| `filters/` | 表示用の値整形 (バイト数・日時・数値など) |
| `store/`, `preferences/` | アプリケーション横断stateと永続化 |
| `utility/` | Vueや特定featureに依存しない小さな横断処理 |
| `lib/` | Vueにもfeatureにも依存しない自前ライブラリ (現在はルーターの `nirax.ts` のみ) |
| `types/` | 複数の層から参照する型定義だけを置く |
| `ui/` | アプリケーションシェルとレイアウト |
| `widgets/` | widgetランタイムと各widget |
| `aiscript/` | AiScript実行環境との接続 (API・UI定義) |
| `shaders/` | WebGLで使うGLSL |
| `workers/` | Web Worker entrypoints |

## Shared component categories

`components/` の直下にはglobal登録entrypointだけを置き、共通UIは責務別のsubdirectoryへ置く。

| Directory | Responsibility |
| --- | --- |
| `components/form/` | input、button、select、switch、form補助、並べ替えeditor |
| `components/overlay/` | dialog、modal、menu、tooltip、toast、window |
| `components/layout/` | container、pagination、tab、folder、drag、scroll layout |
| `components/display/` | 値・状態・時計・previewなど読み取り中心の表示部品 |
| `components/effects/` | ripple、sparkleなど一時的な視覚effect |
| `components/global/` | Vueへglobal登録するrendererとapp adapter |
| `components/grid/` | data grid基盤 |

componentを追加するとき、特定のユーザー機能を知っている場合は `components/` ではなく `features/<feature>/components/` を選ぶ。共通UI category間の依存は絶対pathで明示し、同じcategory内の密結合な補助componentだけ相対importを許可する。

`MkInput` と `MkTextarea` は入力補助として `features/autocomplete/` を利用する。この統合点以外の共通form primitiveはfeatureへ依存させない。

## Dependency direction

基本の依存方向は次の通り。

```text
boot / ui / pages
        ↓
     features
        ↓
components / composables / query / store
        ↓
      utility
```

- `utility/` から `features/` や `pages/` をimportしない。
- feature固有のVue component、型、renderer、補助処理は同じfeature内に置く。
- `components/` に置くのは、機能名を知らなくても利用できるUI部品だけにする。
- `components/global/` はglobal component登録のadapter層なので、描画を委譲するfeatureをimportしてよい。featureのstateや業務処理は持たせない。
- `pages/` は再利用ロジックの保管場所にせず、featureや共通層を組み立てる。
- feature間の直接importは最小限にし、循環依存を作らない。
- 動的importが必要なcomponentは、bundle分割を維持するためfeature内の実ファイルを直接指定してよい。

## Moving existing code

配置変更は機能単位で行い、実装・型・shader・テスト・Storybookを同じ変更で移動する。互換用の旧パスre-exportは恒久化させず、同じ変更で全importを更新する。
