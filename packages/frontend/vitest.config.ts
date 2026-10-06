/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineBrowserCommand, playwright } from '@vitest/browser-playwright';
import { configDefaults, defineConfig } from 'vitest/config';
import { getConfig } from './vite.config.js';
import { serveLocales } from './builder/vite-plugin-serve-locales.js';

const base = getConfig();
const baseAlias = (base.resolve?.alias ?? {}) as Record<string, string>;

export default defineConfig({
	...base,
	plugins: [...(base.plugins ?? []), serveLocales()],
	server: {
		...base.server,
		hmr: false,
		warmup: {},
		strictPort: false,
	},
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: 'node',
					environment: 'node',
					include: ['**/*.test.ts'],
					exclude: [...configDefaults.exclude, '**/*.browser.test.ts'],
				},
			},
			{
				extends: true,
				resolve: {
					...base.resolve,
					alias: [
						...Object.entries(baseAlias).map(([find, replacement]) => ({ find, replacement })),
						{ find: /^vue$/, replacement: 'vue/dist/vue.esm-bundler.js' },
					],
				},
				define: {
					...base.define,
					__VUE_OPTIONS_API__: true,
					'process.env.VTL_SKIP_AUTO_CLEANUP': false,
					'process.env.VTL_SKIP_WARN_EVENT_UPDATE': false,
				},
				test: {
					name: 'browser',
					include: ['**/*.browser.test.ts'],
					setupFiles: ['./test/init.ts'],
					browser: {
						enabled: true,
						provider: playwright(),
						headless: true,
						instances: [{ browser: 'chromium' }],
						commands: {
							isolateNetwork: defineBrowserCommand(async ({ page }) => {
								const origin = new URL(page.url()).origin;
								await page.context().route('**/*', (route) => {
									// Vitest の module mock も context.route を使うため、同一 origin は次の handler へ渡す。
									return new URL(route.request().url()).origin === origin
										? route.fallback()
										: route.abort('blockedbyclient');
								});
							}),
						},
					},
				},
			},
		],
	},
});
