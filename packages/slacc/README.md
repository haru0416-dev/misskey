# slacc

[misskey-dev/slacc](https://github.com/misskey-dev/slacc) を取り込んだもの。MIT。

取り込み元: `eaad29863dcb07038bb196ea4f7d97b60cf89452` (0.2.0, 2026-05-23)

## 取り込んだ理由

ネイティブモジュールを npm 越しに受け取ると、13 プラットフォーム分の
バイナリ配布に縛られるうえ、`Cannot find native binding` のような
環境依存の起動失敗を自分で追えない。使うのは 1 環境なので、
ソースを持って必要なプラットフォームだけビルドする。

## upstream からの変更

- `AhoCorasick` を削除 (未使用。`aho-corasick` crate ごと落とした)
- 13 プラットフォーム対応のローダーを、隣に置かれた成果物だけを読む形に置換
- ESM から読めるよう `index.mjs` を追加 (ネイティブモジュールは CJS でしか読めない)

## ビルド

```bash
bun run --filter slacc build
```

Rust ツールチェーンが要る。成果物 (`*.node`) と `target/` は追跡しない。

## 提供するもの

| | |
| --- | --- |
| `init(numThreads)` | 署名処理を回すスレッドプールの初期化。プロセスで 1 度だけ |
| `Signer` | HTTP 署名 / LD 署名の生成 (RSA-2048〜8192 / Ed25519 / ML-DSA-44) |
| `Verifier` | HTTP 署名の検証 |
| `ZipReader` | 絵文字インポートの zip 展開 |

`node:crypto` ではなくこちらを使うのは、スレッドプールへ逃がせるぶん並列時に速いため
(実測: RSA-2048 の並列 50 で署名 6.2 倍 / 検証 3.2 倍)。
