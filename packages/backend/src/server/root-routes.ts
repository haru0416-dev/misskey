/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono, type Context } from 'hono';
import { fetchEmojiByNameAndHostFromDatabase } from '@/core/EmojiStore.js';
import { fetchUserByUsernameAndHostFromDatabase } from '@/core/UserStore.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/_.js';
import type { MiEmoji } from '@/models/Emoji.js';
import type { MiUser } from '@/models/User.js';
import * as Acct from '@/misc/acct.js';
import { genIdenticon } from '@/misc/gen-identicon.js';
import { getIdenticonUrl } from '@/core/IdenticonUrl.js';

export type RootRouteStores = {
	fetchEmojiByNameAndHost: (db: MiDrizzleDatabase, name: MiEmoji['name'], host: MiEmoji['host']) => Promise<MiEmoji | null>;
	fetchUserByUsernameAndHost: (db: MiDrizzleDatabase, username: string, host: MiUser['host']) => Promise<MiUser | null>;
};

export type RootRouteDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	stores?: RootRouteStores;
};

const defaultStores: RootRouteStores = {
	fetchEmojiByNameAndHost: fetchEmojiByNameAndHostFromDatabase,
	fetchUserByUsernameAndHost: fetchUserByUsernameAndHostFromDatabase,
};

function pathAfter(requestUrl: string, prefix: string): string {
	const pathname = new URL(requestUrl).pathname;
	return pathname.startsWith(prefix) ? pathname.slice(prefix.length) : '';
}

function queryHas(requestUrl: string, key: string): boolean {
	return new URL(requestUrl).searchParams.has(key);
}

function cacheHeaders(): Record<string, string> {
	return {
		'Cache-Control': 'public, max-age=86400',
	};
}

function setCacheHeader(c: Context): void {
	c.header('Cache-Control', 'public, max-age=86400');
}

export function createRootRoutes(deps: RootRouteDependencies): Hono {
	const app = new Hono();
	const stores = deps.stores ?? defaultStores;

	app.get('/emoji/*', async (c) => {
		const path = pathAfter(c.req.url, '/emoji/');
		const headers = cacheHeaders();
		setCacheHeader(c);

		if (!path.match(/^[a-zA-Z0-9\-_@.]+?\.webp$/)) {
			return c.body(null, 404, headers);
		}

		const emojiPath = path.replace(/\.webp$/i, '');
		const pathChunks = emojiPath.split('@');

		if (pathChunks.length > 2) {
			return c.body(null, 400, headers);
		}

		const name = pathChunks.shift();
		const host = pathChunks.pop();
		const emoji = await stores.fetchEmojiByNameAndHost(
			deps.db,
			name!,
			(host === undefined || host === '.') ? null : host,
		);

		headers['Content-Security-Policy'] = 'default-src \'none\'; style-src \'unsafe-inline\'';
		c.header('Content-Security-Policy', headers['Content-Security-Policy']);

		if (emoji == null) {
			if (queryHas(c.req.url, 'fallback')) {
				return c.redirect('/static-assets/emoji-unknown.png');
			}

			return c.body(null, 404, headers);
		}

		let url: URL;
		if (queryHas(c.req.url, 'badge')) {
			url = new URL(`${deps.config.media.proxyUrl}/emoji.png`);
			url.searchParams.set('url', emoji.publicUrl || emoji.originalUrl);
			url.searchParams.set('badge', '1');
		} else {
			url = new URL(`${deps.config.media.proxyUrl}/emoji.webp`);
			url.searchParams.set('url', emoji.publicUrl || emoji.originalUrl);
			url.searchParams.set('emoji', '1');
			if (queryHas(c.req.url, 'static')) url.searchParams.set('static', '1');
		}

		return c.redirect(url.toString(), 301);
	});

	app.get('/avatar/*', async (c) => {
		const path = pathAfter(c.req.url, '/avatar/');
		const headers = cacheHeaders();
		setCacheHeader(c);

		if (!path.startsWith('@')) {
			return c.body(null, 404, headers);
		}

		const { username, host } = Acct.parse(path.slice(1));
		const user = await stores.fetchUserByUsernameAndHost(
			deps.db,
			username,
			(host == null) || (host === deps.config.runtime.host) ? null : host,
		);

		if (user && !user.isSuspended) {
			return c.redirect((user.avatarId == null ? null : user.avatarUrl) ?? getIdenticonUrl(deps.config, deps.meta, user));
		}

		return c.redirect('/static-assets/user-unknown.png');
	});

	app.get('/identicon/:x', async (c) => {
		const headers = cacheHeaders();
		headers['Content-Type'] = 'image/png';
		setCacheHeader(c);
		c.header('Content-Type', 'image/png');

		if (!deps.meta.enableIdenticonGeneration) {
			return c.redirect('/static-assets/avatar.png');
		}

		return new Response(await genIdenticon(c.req.param('x')), {
			status: 200,
			headers,
		});
	});

	return app;
}
