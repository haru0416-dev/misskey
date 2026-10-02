/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// backend のテストを vitest で実行する。使い方: bun run-vitest.js <unit|e2e> [vitest の引数...]
//
// Bun.sql の経路を検証するため、vitest とテスト対象のアプリは、起動元の Bun のランタイムで動かす。
// unit: zod は vitest.config.ts で Vite の変換対象に含める必要がある。
// e2e: 多数のファイル引数を渡すと Bun 上の vitest が起動後にハングするため、対象と順序は
// vitest.config.e2e.ts の include と AlphabeticalSequencer で固定する。
const [target, ...extraArgs] = process.argv.slice(2);
if (target !== 'unit' && target !== 'e2e') {
	throw new Error('Usage: run-vitest.js <unit|e2e> [vitest arguments...]');
}

// watch モードでプロセスを残さないよう、`run` を明示する。
const test = Bun.spawn(
	[process.execPath, 'run', '--bun', 'vitest', 'run', '--config', `vitest.config.${target}.ts`, ...extraArgs],
	{
		// 設定の読み込み先 (built/.config.test.json) は NODE_ENV で決まる。vitest 任せにせず明示する。
		env: { ...process.env, NODE_ENV: 'test' },
		stdin: 'ignore',
		stdout: 'inherit',
		stderr: 'inherit',
	},
);
process.exit(await test.exited);
