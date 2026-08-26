/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as path from 'node:path';
import * as url from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { serveLocales } from './lib/vite-plugin-serve-locales.js';
import { getConfig } from './vite.config.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const base = getConfig();
const baseAlias = (base.resolve?.alias ?? {}) as Record<string, string>;

/**
 * story の play を実ブラウザで走らせる。jsdom / happy-dom では layout も pointer も無く、
 * userEvent.click / hover を伴う検証が成立しない。
 */
export default defineConfig({
	...base,
	plugins: [...(base.plugins ?? []), serveLocales()],
	// mockServiceWorker.js を配信する。
	publicDir: path.join(__dirname, 'public'),

	resolve: {
		...base.resolve,
		// story の render は文字列 template を返すので、実行時コンパイラを含むビルドが要る。
		alias: [
			...Object.entries(baseAlias).map(([find, replacement]) => ({ find, replacement })),
			{ find: /^vue$/, replacement: 'vue/dist/vue.esm-bundler.js' },
		],
	},

	define: {
		...base.define,
		// story は Options API (computed / this.args) で書かれている。
		__VUE_OPTIONS_API__: true,
	},

	test: {
		name: 'stories',
		include: ['test/stories.browser.ts'],
		setupFiles: ['./test/stories.setup.ts'],
		browser: {
			enabled: true,
			provider: playwright(),
			headless: true,
			instances: [{ browser: 'chromium' }],
		},
	},
});
