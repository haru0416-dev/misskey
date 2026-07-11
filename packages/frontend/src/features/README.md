# Feature modules

`features/` はユーザー機能ごとの縦割り構造を置く。

各featureは必要に応じて次のサブディレクトリを持つ。

- `components/`: feature専用Vue components
- `core/`: frameworkに依存しない中心ロジック
- feature固有の処理群 (`effects/`, `frame/` など)
- `README.md`: 境界が自明でない場合の責務と公開入口

feature外から利用する型や処理は、安定した少数の入口へ寄せる。内部ファイルへのimportが必要な場合でも、別featureの内部実装へ依存しない。
