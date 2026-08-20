import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Raise the global EventEmitter listener limit before Vitest wires CLI listeners.
EventEmitter.defaultMaxListeners = 20;

export const baseConfig = defineConfig({
	test: {
		dir: import.meta.dirname,
		exclude: ['node_modules', 'dist'],
		server: {
			deps: {
				// bun ランタイムで vitest を動かすための設定。vite の module runner が外部化した
				// zod をネイティブ import すると、bun では named export の interop 解析に失敗して
				// `The requested module 'zod' does not provide an export named 'z'` で全ファイルが
				// 即死する (bun 1.3〜1.4 で確認)。zod を vite の変換経路に通す (inline) と回避できる。
				// node で動かす場合は無害。
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
