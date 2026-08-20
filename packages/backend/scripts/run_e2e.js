/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// かつては (1) Bun 上の vitest が zod の ESM interop で全滅するため Node.js へ respawn し、
// (2) 実行順の決定性のためソート済みファイルを明示引数で渡していた。
// (1) は vitest.config.ts の `server.deps.inline: ['zod']` で解消し、(2) は
// vitest.config.e2e.ts の AlphabeticalSequencer に移した (bun では多数のファイル引数を
// 渡すと vitest が起動後にハングするため、include glob + sequencer 方式が必須)。
// vitest は起動元のランタイム (通常は `bun run --bun` 経由の Bun) でそのまま動く。
// Bun 実行時はテスト対象アプリの DB ドライバも本番同様 Bun.sql が選ばれる。

import { execa } from 'execa';

const extraArgs = process.argv.slice(2);

// `run` を明示しないと、execa 経由で stdin が TTY でなくなる状況で vitest が
// watch モードに入ってしまい、プロセスが終了せず残り続ける。
const result = await execa('vitest', ['run', '--config', 'vitest.config.e2e.ts', ...extraArgs], {
	stdout: process.stdout,
	stderr: process.stderr,
	preferLocal: true,
	reject: false,
});

process.exit(result.exitCode ?? 1);
