/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Bun.sql 経路を検証するため、vitest は起動元の Bun ランタイムで動かす。
// zod は vitest.config.ts で Vite の変換対象に含める必要がある。

const extraArgs = process.argv.slice(2);

// `run` を明示しないと、非対話実行でも vitest が
// watch モードに入ってしまい、プロセスが終了せず残り続ける (ビルド成果物の変化等で
// 再起動を繰り返し、プロセスが際限なく積み上がる事故につながった)。
const test = Bun.spawn(
	[process.execPath, 'run', '--bun', 'vitest', 'run', '--config', 'vitest.config.unit.ts', ...extraArgs],
	{
		stdin: 'ignore',
		stdout: 'inherit',
		stderr: 'inherit',
	},
);

process.exit(await test.exited);
