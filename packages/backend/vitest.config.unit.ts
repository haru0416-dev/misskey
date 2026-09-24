import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import { baseConfig } from './vitest.config.js';

const include = ['test/unit/**/*.ts', 'src/**/*.test.ts'];

// ファイルごとにモジュールを読み直す分離は、全体 95 秒のうち import だけで 32.7 秒かかっていた。
// 分離が要るのは vi.mock でモジュールを差し替えるファイルで、分離を外すと差し替えが他のファイルへ
// 漏れて落ちる。これらだけ分離して実行し、残りはワーカー内でモジュールを使い回す。
const moduleMockingFiles = include
	.flatMap((pattern) => globSync(pattern, { cwd: import.meta.dirname }))
	.filter((file) => /\bvi\.(?:mock|doMock)\(/.test(readFileSync(resolve(import.meta.dirname, file), 'utf8')));

export default mergeConfig(
	baseConfig,
	defineConfig({
		test: {
			globalSetup: './test/setup.unit.ts',
			environment: './test/environment.unit.ts',
			projects: [
				{
					extends: true,
					test: { name: 'unit', include, exclude: moduleMockingFiles, isolate: false },
				},
				{
					extends: true,
					test: { name: 'unit-module-mocks', include: moduleMockingFiles, isolate: true },
				},
			],
		},
	}),
);
