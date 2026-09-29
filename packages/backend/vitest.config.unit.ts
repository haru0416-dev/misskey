import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import { baseConfig } from './vitest.config.js';

const include = ['test/unit/**/*.ts', 'src/**/*.test.ts'];

// ファイルごとにモジュールを読み直す分離では、全体 95 秒のうち import だけで 32.7 秒かかる。
// 分離が要るのは vi.mock でモジュールを差し替えるファイルで、分離を外すと差し替えが他のファイルへ
// 漏れて落ちる。これらだけ分離して実行し、残りはワーカー内でモジュールを使い回す。
const moduleMockingFiles = include
	.flatMap((pattern) => globSync(pattern, { cwd: import.meta.dirname }))
	.filter((file) => /\bvi\.(?:mock|doMock)\(/.test(readFileSync(resolve(import.meta.dirname, file), 'utf8')));

// outbox 全体を配送し、全体の件数を検査するファイル。同じテスト DB を使う前のファイルが投稿の後処理を途中で
// 置いていくと、その行 (publishing のままの notePostCreate) で件数がずれる (シャッフル実行の seed 405 /
// 10941656 / 10941658 で再現)。別の組 (groupOrder 1) にして、unit の組が終わってから単独で走らせる。
const wholeOutboxFiles = ['test/unit/queue/queue-outbox.ts'];

export default mergeConfig(
	baseConfig,
	defineConfig({
		test: {
			globalSetup: './test/setup.unit.ts',
			environment: './test/environment.unit.ts',
			projects: [
				{
					extends: true,
					test: { name: 'unit', include, exclude: [...moduleMockingFiles, ...wholeOutboxFiles], isolate: false },
				},
				{
					extends: true,
					test: { name: 'unit-module-mocks', include: moduleMockingFiles, isolate: true },
				},
				{
					extends: true,
					test: { name: 'unit-whole-outbox', include: wholeOutboxFiles, sequence: { groupOrder: 1 } },
				},
			],
		},
	}),
);
