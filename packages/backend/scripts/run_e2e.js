/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Bun.sql 経路を検証するため、vitest とテスト対象アプリは起動元の Bun ランタイムで動かす。
// 多数のファイル引数を渡すと Bun 上の vitest が起動後にハングするため、対象と順序は
// vitest.config.e2e.ts の include と AlphabeticalSequencer で固定する。

const extraArgs = process.argv.slice(2);

// `run` を明示しないと、非対話実行でも vitest が
// watch モードに入ってしまい、プロセスが終了せず残り続ける。
const test = Bun.spawn(
	[process.execPath, 'run', '--bun', 'vitest', 'run', '--config', 'vitest.config.e2e.ts', ...extraArgs],
	{
		stdin: 'ignore',
		stdout: 'inherit',
		stderr: 'inherit',
	},
);

process.exit(await test.exited);
