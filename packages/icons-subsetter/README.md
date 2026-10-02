# icons-subsetter

フロントエンドが実際に使っている [Tabler Icons](https://tabler.io/icons) のアイコンだけを取り出して、小さなフォントを作るツールです。配信するフォントのサイズを減らすために、本番ビルドで使います。

## 仕組み

1. `packages/frontend/src` と `packages/frontend-embed/src` の `.ts` と `.vue` を走査し、`ti-` で始まるクラス名を集めます。
2. `vendor/tabler-icons/` のフォントから、集めたアイコンの文字だけを含むサブセットを作ります。frontend と frontend-embed で別々に作ります。
3. `built/` に、サブセットのフォントと CSS を出力します。

| 出力 | 内容 |
| --- | --- |
| `tabler-icons-frontend.css` / `.woff2` | frontend 用のサブセット |
| `tabler-icons-frontendEmbed.css` / `.woff2` | frontend-embed 用のサブセット |
| `tabler-icons.woff2` | 全アイコンを含むフォント |

出力した CSS は、全アイコンのフォントを先に宣言し、そのあとに `unicode-range` つきでサブセットを宣言します。サブセットにないアイコンを呼び出したときは、`unicode-range` に合わないので、全アイコンのフォントから読み込まれます。

開発モードの frontend は、サブセットを使わず、`vendor/` の元の CSS を読み込みます。開発時にも `build` を 1 回実行するのは、`built/` の CSS を参照する型の解決を通すためです。

## 使い方

```sh
bun run --filter icons-subsetter build
```

走査するファイルは、`src/generator.ts` の `filesToScan` に書いてあります。ここに当てはまらないファイルで使っているアイコンもサブセットに含めたいときは、`filesToScan` に追加してください。
