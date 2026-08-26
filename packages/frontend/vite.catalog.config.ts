/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as path from 'node:path';
import * as url from 'node:url';
import { defineConfig } from 'vite';
import { serveLocales } from './lib/vite-plugin-serve-locales.js';
import { getConfig } from './vite.config.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

const base = getConfig();
const baseAlias = (base.resolve?.alias ?? {}) as Record<string, string>;

export default defineConfig({
	...base,
	plugins: [...(base.plugins ?? []), serveLocales()],
	base: '/',
	root: path.join(__dirname, 'catalog'),
	publicDir: path.join(__dirname, 'public'),

	resolve: {
		...base.resolve,
		// story の render は文字列 template を返すので、実行時コンパイラを含むビルドが要る。
		alias: [
			...Object.entries(baseAlias).map(([find, replacement]) => ({ find, replacement })),
			{ find: /^vue$/, replacement: 'vue/dist/vue.esm-bundler.js' },
			// story の play が使う expect はテスト専用。カタログでは実行しないので差し替える。
			{ find: /^vitest$/, replacement: path.join(__dirname, 'catalog/vitest-stub.ts') },
		],
	},

	define: {
		...base.define,
		// story は Options API (computed / this.args) で書かれている。
		__VUE_OPTIONS_API__: true,
	},

	server: {
		host: '127.0.0.1',
		port: 6006,
		strictPort: false,
	},

	build: {
		target: base.build?.target,
		outDir: path.join(__dirname, 'catalog-dist'),
		emptyOutDir: true,
	},
});
