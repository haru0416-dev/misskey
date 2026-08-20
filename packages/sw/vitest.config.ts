/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	define: {
		_VERSION_: JSON.stringify('test'),
		_DEV_: false,
	},
	resolve: {
		alias: {
			'@': path.resolve(import.meta.dirname, 'src'),
			'@shared': path.resolve(import.meta.dirname, '../frontend-shared'),
		},
	},
	test: {
		include: ['test/**/*.ts'],
	},
});
