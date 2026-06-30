---
description: Misskey の lint / typecheck / 高速テストを順に実行して品質ゲートを通すコマンド。完了前の軽量検証用。
argument-hint: "[repo|backend|frontend|<path/to/file.ts>]"
---

<!--
SPDX-License-Identifier: MIT
SPDX-FileCopyrightText: 2026 Affaan Mustafa and everything-claude-code contributors

出典 (upstream): https://github.com/affaan-m/everything-claude-code (v2.0.0-rc.1)
upstream path: commands/quality-gate.md
upstream license: MIT — https://github.com/affaan-m/everything-claude-code/blob/main/LICENSE
project-level notice: see .claude/THIRD_PARTY_LICENSES.md (Misskey 内サードパーティ一覧 + MIT 全文)

Imported into Misskey .claude/ on 2026-05-10. Pipeline 概念 (lint → typecheck → test) は upstream ECC 版から借用 (MIT)。実コマンド層はこの fork の Bun + oxlint + tsgo + Vitest に固定し、formatter フェーズは削除した。

note: 元 ECC 版は言語自動判定 + format/lint/type のジェネリック版だったが、この fork 専用に Bun + oxlint + tsgo + Vitest の組み合わせに固定。重い test:e2e / test:fed / Playwright は必要時のみ個別に実行する。
-->

# /quality-gate — Misskey 軽量品質ゲート

`/quality-gate [scope]`

完了前の **軽量** 品質チェック。重い E2E / 連合テスト (test:e2e / test:fed / Playwright) は必要時のみ個別に実行する。

## Scope

- `repo` (default) — 全パッケージ
- `backend` — `packages/backend` のみ
- `frontend` — `packages/frontend` のみ
- `path/to/file.ts` — 単一ファイルの周辺確認。自動 fix は原則 `bun run format:ox` / `bun run lint:ox` の対象範囲で行う

## Pipeline

### Repo scope (全部)

ルートの `bun run lint` は `lint:ox`、Playwright 型検査、全 workspace の `typecheck` をまとめて実行する。通常はこれを最初に走らせる。

```bash
# 1. Lint (= oxlint + Playwright 型検査 + 全 package typecheck)
bun run lint

# 2. Unit test (高速、e2e は含まない)
bun run --bun --filter backend test
bun run --bun --filter frontend test
```

#### 詳細を分けて見たい時のみ (optional)

lint がまとめて失敗していて typecheck の結果だけ単独で見たい場合は、以下を個別に回す。**通常は不要** (lint の出力を読めば足りる):

```bash
bun run --bun --filter backend typecheck    # tsgo 単体
bun run --bun --filter frontend typecheck   # vue-tsc-bun 単体 (Vue SFC の型を見るため)
```

### Backend scope

backend scope では backend の `lint` と unit test を走らせる。backend の `lint` は現在 typecheck に集約されている。

```bash
bun run --bun --filter backend lint
bun run --bun --filter backend test
```

`tsgo` の出力を単独で見たい時のみ optional で `bun run --bun --filter backend typecheck` を別途回す。

### Frontend scope

frontend scope では frontend の `lint` と unit test を走らせる。frontend の `lint` は現在 typecheck に集約されている。

```bash
bun run --bun --filter frontend lint
bun run --bun --filter frontend test
```

`vue-tsc-bun` の出力を単独で見たい時のみ optional で `bun run --bun --filter frontend typecheck` を別途回す。

### Single file scope

```bash
oxlint <path> --config .oxlintrc.json --quiet
```

## Output

実行したフェーズの pass/fail と件数を集計する。標準パイプラインは `bun run lint` と unit test のみなので、デフォルトの出力は以下のようになる:

```text
Quality Gate (repo):

Lint:        PASS  (oxlint + typecheck)
Backend ut:  PASS  (412/412)
Frontend ut: PASS  (87/87)

→ 完了前の軽量チェック OK。重い e2e / 連合テスト / Playwright は必要時に個別実行する。
```

`#### 詳細を分けて見たい時のみ (optional)` で個別 typecheck (`bun run --bun --filter backend typecheck` / `bun run --bun --filter frontend typecheck`) も回した場合のみ、その結果を追加行として表示する:

```text
Quality Gate (repo):

Lint:        PASS  (0 errors, 2 warnings)
Backend tc:  PASS  (0 errors)        # optional 実行時のみ
Frontend tc: PASS  (0 errors)        # optional 実行時のみ
Backend ut:  PASS  (412/412)
Frontend ut: PASS  (87/87)
```

失敗時は最初に落ちたフェーズで停止して詳細を見せる。

## 関連 skill / コマンド

- [`shipping-misskey-change` スキル](../skills/shipping-misskey-change/SKILL.md) — commit / PR 直前の最終チェックリスト (misskey-js 再生成 / SPDX / CHANGELOG 等)
- [`shipping-misskey-change/references/tasks/regenerate-misskey-js.md`](../skills/shipping-misskey-change/references/tasks/regenerate-misskey-js.md) — API 変更時の `bun run build-misskey-js-with-types` 実行手順
- [.github/copilot-instructions.md §Validation コマンド](../../.github/copilot-instructions.md) — Bun コマンド一覧 (Copilot / Codex 向けに再掲)

## 元 ECC 版との差分

- ジェネリックな言語自動判定を排除し、Misskey 固定 pipeline に。
- formatter フェーズなし (必要なら `bun run format:ox` を明示実行)。
- e2e / federation / Playwright は重いため標準の軽量ゲートから除外。
