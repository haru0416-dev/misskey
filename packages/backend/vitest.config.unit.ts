import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import { baseConfig } from './vitest.config.js';

const include = ['test/unit/**/*.ts', 'src/**/*.test.ts'];

// ファイルごとにモジュールを読み直す分離では、import に時間がかかる。
// vi.mock / vi.doMock の差し替えが他ファイルへ漏れないよう、該当ファイルは分離する。
const moduleMockingFiles = include
	.flatMap((pattern) => globSync(pattern, { cwd: import.meta.dirname }))
	.filter((file) => /\bvi\.(?:mock|doMock)\(/.test(readFileSync(resolve(import.meta.dirname, file), 'utf8')));

// outbox 全体の件数を検査するため、他ファイルが残す publishing 状態の notePostCreate に影響される。
// groupOrder 1 で他の unit プロジェクトの完了後に実行する。
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
