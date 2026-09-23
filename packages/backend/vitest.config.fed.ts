/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineConfig, mergeConfig } from 'vitest/config';
import { baseConfig } from './vitest.config.js';

export default mergeConfig(
	baseConfig,
	defineConfig({
		test: {
			include: ['test-federation/test/**/*.test.ts'],
			// 障害注入は宛先ごとなので、別ファイルの配送を同じ試行へ混ぜない。
			fileParallelism: false,
			hookTimeout: 180_000,
			testTimeout: 180_000,
			reporters: ['default', 'json'],
			outputFile: { json: `test-federation/results/${process.env['FEDERATION_PEER_B_KIND'] ?? 'fork'}.json` },
		},
	}),
);
