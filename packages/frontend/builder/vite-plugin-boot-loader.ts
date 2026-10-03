/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { transform as transformCss } from 'lightningcss';
import { build } from 'rolldown';
import type { Plugin } from 'vite';

/**
 * ブートローダー (src/loader/) を <base>loader/boot.js と <base>loader/style.css として出す。
 * バックエンドは本番ではこの 2 つを HTML に埋め込み (取りに行く往復を 1 回減らす)、ファイルが無い開発時は URL で読む。
 * ローダーは Vite のバンドルより前に普通のスクリプトとして動くので、入口ごとに import を 1 つのスクリプトへまとめる。
 */
export function pluginBootLoader(options: { entry: string; css: string }): Plugin {
	const root = path.resolve(import.meta.dirname, '..');
	const entry = path.resolve(root, options.entry);
	const cssFile = path.resolve(root, options.css);

	async function bundleScript(minify: boolean): Promise<string> {
		const result = await build({
			input: entry,
			write: false,
			platform: 'browser',
			resolve: {
				alias: { '@': path.join(root, 'src') },
				extensionAlias: { '.js': ['.ts', '.js'] },
			},
			output: { format: 'iife', minify },
		});
		const [chunk] = result.output;
		if (chunk?.type !== 'chunk' || result.output.length !== 1) {
			throw new Error(`Boot loader ${options.entry} must bundle into a single script`);
		}
		return chunk.code;
	}

	async function readCss(minify: boolean): Promise<string> {
		const code = await fs.readFile(cssFile);
		return minify ? transformCss({ filename: cssFile, code, minify: true }).code.toString() : code.toString();
	}

	let base = '/';

	return {
		name: 'boot-loader',

		configResolved(config) {
			base = config.base;
		},

		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				const url = req.url?.split('?')[0];
				try {
					if (url === `${base}loader/boot.js`) {
						res.setHeader('Content-Type', 'text/javascript');
						res.end(await bundleScript(false));
						return;
					}
					if (url === `${base}loader/style.css`) {
						res.setHeader('Content-Type', 'text/css');
						res.end(await readCss(false));
						return;
					}
				} catch (err) {
					next(err);
					return;
				}
				next();
			});
		},

		async generateBundle() {
			this.emitFile({ type: 'asset', fileName: 'loader/boot.js', source: await bundleScript(true) });
			this.emitFile({ type: 'asset', fileName: 'loader/style.css', source: await readCss(true) });
		},
	};
}
