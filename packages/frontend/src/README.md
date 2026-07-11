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
| `store/`, `preferences/` | アプリケーション横断stateと永続化 |
| `utility/` | Vueや特定featureに依存しない小さな横断処理 |
| `ui/` | アプリケーションシェルとレイアウト |
| `widgets/` | widgetランタイムと各widget |
| `workers/` | Web Worker entrypoints |

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
