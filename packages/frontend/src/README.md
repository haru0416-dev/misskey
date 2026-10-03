# frontend/src の構成

`src/` は次の責務で分けています。新しいコードは、特定の機能のためのものか、横断して使うものかを先に判断して置きます。

| ディレクトリ | 内容 |
| --- | --- |
| `boot/` | アプリの起動と、初期化の順序 |
| `features/` | 1 つのユーザー機能として変更・削除できる、縦割りのモジュール |
| `pages/` | ルート単位の画面。データの取得と、機能モジュールの組み立てを担当する |
| `components/` | 複数の機能から使う、特定の機能を知らない UI 部品 |
| `composables/` | 複数の機能から使う、Vue のライフサイクルとリアクティビティの処理 |
| `directives/` | グローバルに、または横断して使う Vue の directive |
| `query/` | API のクエリキャッシュの共通基盤([README](query/README.md)) |
| `filters/` | 表示用の値の整形(バイト数、日時、数値など) |
| `store/` `preferences/` | アプリ全体の状態と、その永続化 |
| `utility/` | 特定の機能に依存しない、小さな横断の処理。Vue のリアクティビティは使ってよいが、コンポーネントは置かない |
| `lib/` | 機能に依存しない自前のライブラリ。ルーターの `nirax.ts` だけが入っている |
| `types/` | 複数の層から参照する型だけ |
| `ui/` | アプリのシェルとレイアウト |
| `widgets/` | ウィジェットの実行環境と、各ウィジェット |
| `aiscript/` | AiScript の実行環境との接続(API と UI の定義) |
| `stories/` | コンポーネントのカタログとテストで使う、story の共通部品 |
| `workers/` | Web Worker の入口 |

## src 直下のファイル

`src/` の直下には、アプリ全体で 1 つだけ持つ状態とサービスの入口を置きます。翻訳(`i18n.ts`)、ダイアログなどの操作(`os.ts`)、ログイン中のアカウント(`i.ts`、`accounts.ts`)、サーバーの情報(`instance.ts`)、設定(`store.ts`、`preferences.ts`)、ルーター(`router.ts`)、ストリーミング(`stream.ts`)などです。

ここに置くのは、`components/` や `store/` のような下の層からも使われるものに限ります。1 つの機能やレイアウトだけが使うものは、その機能やレイアウトのディレクトリに置きます。

## 共通のコンポーネントの分類

`components/` の直下には、グローバル登録の入口だけを置きます。共通の UI は、責務ごとのサブディレクトリに置きます。

| ディレクトリ | 内容 |
| --- | --- |
| `components/form/` | input、button、select、switch、フォームの補助、並べ替えのエディタ |
| `components/overlay/` | dialog、modal、menu、tooltip、toast、window |
| `components/layout/` | container、pagination、tab、folder、drag、スクロールのレイアウト |
| `components/display/` | 値・状態・時計・プレビューなど、読み取りが中心の表示部品 |
| `components/effects/` | ripple、sparkle など、一時的な視覚効果 |
| `components/global/` | Vue にグローバル登録する、レンダラーとアプリ用のアダプタ |
| `components/grid/` | データグリッドの基盤 |

コンポーネントが特定のユーザー機能を知っているなら、`features/<機能名>/components/` に置きます。共通 UI の分類をまたぐ依存は絶対パスで書き、同じ分類の中の、結びつきの強い補助コンポーネントだけは相対パスの import を許します。

`MkInput` と `MkTextarea` は、入力補助のために `features/autocomplete/` を使います。この結びつき以外で、共通のフォームの部品を機能に依存させません。

## 依存の方向

依存は、次の向きにだけ流します。

```text
boot / ui / pages
        ↓
     features
        ↓
components / composables / query / store
        ↓
      utility
```

- `utility/` は、`features/` と `pages/` を import しません。
- 機能に固有の Vue コンポーネント、型、レンダラー、補助の処理は、同じ機能の中に置きます。
- `components/` に置くのは、機能の名前を知らなくても使える UI 部品だけです。
- `components/global/` は、グローバル登録のアダプタです。描画を任せる機能を import してかまいませんが、機能の状態や業務の処理は持たせません。
- `pages/` は、再利用する処理の置き場にしません。機能と共通の層を組み立てるだけにします。
- 機能どうしの直接の import は最小限にし、循環する依存を作りません。
- 動的に import するコンポーネントは、バンドルの分割を保つために、機能の中の実ファイルを直接指定してかまいません。

## コードを移すとき

移すのは機能の単位で行い、実装、型、シェーダー、テスト、Storybook を同じ変更の中で移します。移動前のパスからの再エクスポートは残さず、同じ変更で、すべての import を更新します。
