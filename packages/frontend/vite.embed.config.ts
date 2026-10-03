/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 外部サイトに埋め込む画面 (/embed/*) のビルド。他人のページの中で開かれるため、本体とは別のバンドルにして
// 本体の起動処理・設定・メニューを読み込まない。src/embed/ から本体の部品を使う場合も、ここから到達するものだけが入る。
import path from 'node:path';
import pluginVue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import type { UserConfig } from 'vite';
import pluginJson5 from './builder/vite-plugin-json5.js';
import { removeUnrefI18n } from './builder/remove-unref-i18n.js';
import { pluginRewriteChunks } from './builder/rewrite-chunks.js';
import { pluginBootLoader } from './builder/vite-plugin-boot-loader.js';
import { getDevServerConfig, getSharedConfig } from './vite.config.js';

export function getEmbedConfig(): UserConfig {
	const { output, ...shared } = getSharedConfig();

	return {
		...shared,
		base: '/embed_vite/',
		// 本体の Vite と同じ root なので、依存の事前バンドルの置き場を分ける。共有すると、設定の違いを理由に互いのキャッシュを消し合う。
		cacheDir: 'node_modules/.vite-embed',

		server: {
			...getDevServerConfig('MISSKEY_EMBED_VITE_PORT', 'MISSKEY_EMBED_VITE_HMR_CLIENT_PORT', 5174),
			// 起動処理から届くモジュールを、サーバーの起動直後に変換しておく。
			warmup: {
				clientFiles: ['./src/embed/boot.ts'],
			},
		},

		plugins: [
			pluginVue(),
			pluginRewriteChunks([removeUnrefI18n()]),
			pluginBootLoader({ entry: 'src/loader/embed.ts', css: 'src/loader/embed.css' }),
			pluginJson5(),
		],

		build: {
			...shared.build,
			rolldownOptions: {
				experimental: {
					nativeMagicString: true,
				},
				input: {
					i18n: './src/i18n.ts',
					entry: './src/embed/boot.ts',
				},
				preserveEntrySignatures: 'allow-extension',
				output: {
					...output,
					codeSplitting: {
						groups: [
							{
								name: 'vue',
								test: /node_modules[\\/]vue/,
							},
							{
								name: 'i18n',
								includeDependenciesRecursively: false,
								test: /i18n\.ts|locale\.ts/,
							},
						],
					},
				},
			},
			outDir: path.join(import.meta.dirname, '../../built/_frontend_embed_vite_'),
		},
	};
}

export default defineConfig(getEmbedConfig());
