/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Bun.sql 経路を検証するため、vitest は起動元の Bun ランタイムで動かす。
// zod は vitest.config.ts で Vite の変換対象に含める必要がある。

const extraArgs = process.argv.slice(2);

// watch モードでプロセスを残さないよう、`run` を明示する。
const test = Bun.spawn(
	[process.execPath, 'run', '--bun', 'vitest', 'run', '--config', 'vitest.config.unit.ts', ...extraArgs],
	{
		// 設定の読み込み先 (built/.config.test.json) は NODE_ENV で決まる。vitest 任せにせず明示する。
		env: { ...process.env, NODE_ENV: 'test' },
		stdin: 'ignore',
		stdout: 'inherit',
		stderr: 'inherit',
	},
);

process.exit(await test.exited);
