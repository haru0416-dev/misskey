/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createReadStream } from 'node:fs';
import { createRequire } from 'node:module';
import type { Plugin } from 'vite';

const require = createRequire(import.meta.url);

export function serveEmojiAssets(): Plugin {
	return {
		name: 'serve-emoji-assets',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const match = /^\/(fluent-emoji|twemoji)\/([a-f0-9-]+\.(png|svg))(?:\?|$)/.exec(req.url ?? '');
				if (match == null) return next();
				let asset: string;
				try {
					asset = require.resolve(`@misskey-dev/emoji-assets/${match[1]}/${match[2]}`);
				} catch {
					res.statusCode = 404;
					res.end();
					return;
				}
				res.setHeader('content-type', match[3] === 'png' ? 'image/png' : 'image/svg+xml');
				const stream = createReadStream(asset);
				stream.on('error', (error) => {
					res.destroy(error);
				});
				stream.pipe(res);
			});
		},
	};
}
