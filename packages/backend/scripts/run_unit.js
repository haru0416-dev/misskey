/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// かつては Bun 上で vitest を実行すると外部化された zod の ESM interop 解析に失敗して
// 全テストファイルが即死したため、本物の Node.js へ respawn していた (respawn_with_node.js)。
// vitest.config.ts の `server.deps.inline: ['zod']` で回避できると分かったため respawn は
// 撤去し、vitest は起動元のランタイム (通常は `bun run --bun` 経由の Bun) でそのまま動かす。
// Bun 実行時は DB ドライバも本番同様 Bun.sql が選ばれる (src/runtime-dependencies.ts)。

import { execa } from 'execa';

const extraArgs = process.argv.slice(2);

// `run` を明示しないと、execa 経由で stdin が TTY でなくなる状況で vitest が
// watch モードに入ってしまい、プロセスが終了せず残り続ける (ビルド成果物の変化等で
// 再起動を繰り返し、プロセスが際限なく積み上がる事故につながった)。
const result = await execa('vitest', ['run', '--config', 'vitest.config.unit.ts', ...extraArgs], {
	stdout: process.stdout,
	stderr: process.stderr,
	preferLocal: true,
	reject: false,
});

process.exit(result.exitCode ?? 1);
