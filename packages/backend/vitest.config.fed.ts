import { defineConfig, mergeConfig } from 'vitest/config';
import { baseConfig } from './vitest.config.js';

export default mergeConfig(
	baseConfig,
	defineConfig({
		test: {
			include: ['test-federation/test/**/*.test.ts'],
			// beforeAll でのアカウント作成はレート制限回避の signin 待ち (1秒/回) と
			// 連合ラウンドトリップを含むため、既定の10秒では負荷時にタイムアウトする
			hookTimeout: 60_000,
		},
	}),
);
