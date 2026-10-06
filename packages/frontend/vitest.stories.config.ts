/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as path from 'node:path';
import * as url from 'node:url';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { serveLocales } from './builder/vite-plugin-serve-locales.js';
import { getConfig } from './vite.config.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const base = getConfig();
const baseAlias = (base.resolve?.alias ?? {}) as Record<string, string>;

/**
 * layout や pointer 操作を伴う story の play は実ブラウザで検証する。
 */
export default defineConfig({
	...base,
	plugins: [...(base.plugins ?? []), serveLocales()],
	// mockServiceWorker.js を配信する。
	publicDir: path.join(__dirname, 'catalog/public'),

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

	// `--run` の一回きり実行では HMR が不要。CI では接続に失敗して
	// `WebSocket closed without opened.` が未捕捉の rejection になり、
	// テストが全件通っていても exit 1 になる。
	server: {
		...base.server,
		hmr: false,
		// story は本体の起動処理を通らないので、本体用の warmup は要らない。
		strictPort: false,
		warmup: {},
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
