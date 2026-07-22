import { defineConfig, mergeConfig } from 'vitest/config';
import { baseConfig } from './vitest.config.js';

export default mergeConfig(
	baseConfig,
	defineConfig({
		test: {
			fileParallelism: false,
			include: ['./test/e2e/**/*.ts'],
			globalSetup: './test/target.ts',
			setupFiles: ['./test/setup.e2e.ts'],
		},
	}),
);
