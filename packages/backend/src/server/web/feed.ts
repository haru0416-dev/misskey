/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono, type Context, type Next } from 'hono';
import type { Feed } from 'feed';
import type { Config } from '@/config.js';
import { fetchUserByUsernameAndHostFromDatabase } from '@/core/UserStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import * as Acct from '@/misc/acct.js';
import type { MiMeta } from '@/models/_.js';
import { packFeed } from './feed-packer.js';

export type FeedDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	resolveFeed?: (acct: string) => Promise<Feed | null>;
};

async function resolveFeed(deps: FeedDependencies, acct: string) {
	if (deps.resolveFeed) return await deps.resolveFeed(acct);

	const { username, host } = Acct.parse(acct);
	const user = await fetchUserByUsernameAndHostFromDatabase(deps.db, username, host ?? null);

	if (user == null || user.isSuspended || user.requireSigninToViewContents) return null;

	return await packFeed(deps, user);
}

function feedResponse(c: Context, body: string, contentType: string): Response {
	return new Response(c.req.method === 'HEAD' ? null : body, {
		status: 200,
		headers: {
			'Content-Type': contentType,
		},
	});
}

type FeedFormat = 'atom' | 'rss' | 'json';

function parseFeedRequest(c: Context): {
	acct: string;
	format: FeedFormat;
} | null {
	const pathname = new URL(c.req.url).pathname;
	if (!pathname.startsWith('/@')) return null;

	const match = pathname.slice(2).match(/^(.*)\.(atom|rss|json)$/);
	if (match == null) return null;

	return {
		acct: decodeURIComponent(match[1]),
		format: match[2] as FeedFormat,
	};
}

export function createFeedApp(deps: FeedDependencies): Hono {
	const app = new Hono();

	app.on(['GET', 'HEAD'], '*', async (c: Context, next: Next) => {
		const request = parseFeedRequest(c);
		if (request == null) return await next();

		const feed = await resolveFeed(deps, request.acct);
		if (feed == null) return c.body(null, 404);

		switch (request.format) {
			case 'atom': return feedResponse(c, feed.atom1(), 'application/atom+xml; charset=utf-8');
			case 'rss': return feedResponse(c, feed.rss2(), 'application/rss+xml; charset=utf-8');
			case 'json': return feedResponse(c, feed.json1(), 'application/json; charset=utf-8');
		}
	});

	return app;
}
