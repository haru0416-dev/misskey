import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Vitest が CLI リスナーを登録する前に、EventEmitter の上限を引き上げる必要がある。
EventEmitter.defaultMaxListeners = 20;

export const baseConfig = defineConfig({
	test: {
		dir: import.meta.dirname,
		exclude: ['node_modules', 'dist'],
		server: {
			deps: {
				// Vite が外部化した zod を Bun でネイティブ import すると named export の解析に失敗し、
				// `The requested module 'zod' does not provide an export named 'z'` で全ファイルが
				// 全テストが起動時に失敗する (Bun 1.3〜1.4 で確認)。zod は Vite の変換対象に含める。
				inline: ['zod'],
			},
		},
		coverage: {
			provider: 'v8',
			reportsDirectory: 'coverage',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts'],
		},
		restoreMocks: true,
		testTimeout: 60000,
		maxWorkers: 1,
		logHeapUsage: true,
		vmMemoryLimit: 1024,
		maxConcurrency: 32,
	},
	resolve: {
		alias: {
			'@': resolve(__dirname, './src'),
		},
	},
});

export default baseConfig;
