/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import locales from 'i18n';
import type { Plugin } from 'vite';

/**
 * 本体は `/assets/locales/<lang>.<version>.json` をバックエンドから受け取る。
 * バックエンドを立てないカタログ / story テストでは、ここで同じ形の応答を返す。
 */
export function serveLocales(): Plugin {
	return {
		name: 'serve-locales',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const match = /^\/assets\/locales\/([a-zA-Z-]+)\./.exec(req.url ?? '');
				if (match == null) return next();

				const lang = match[1] as keyof typeof locales;
				res.setHeader('content-type', 'application/json; charset=utf-8');
				res.end(JSON.stringify(locales[lang] ?? locales['ja-JP']));
			});
		},
	};
}
