/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Feed } from 'feed';
import { Hono } from 'hono';
import { describe, expect, test } from 'vitest';
import { createFeedApp } from '@/server/hono-feed.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/Meta.js';

function createTestFeed(): Feed {
	return new Feed({
		id: 'http://example.test/@alice',
		title: 'alice',
		link: 'http://example.test/@alice',
	});
}

function createApp(feed: Feed | null = createTestFeed()) {
	return createFeedApp({
		config: { url: 'http://example.test' } as Config,
		db: {} as MiDrizzleDatabase,
		meta: {} as MiMeta,
		resolveFeed: async () => feed,
	});
}

function createMountedApp(feed: Feed | null = createTestFeed()) {
	const app = new Hono();
	app.route('/', createApp(feed));
	app.get('*', (c) => c.text('client fallback'));
	return app;
}

describe('createFeedApp', () => {
	test.each([
		{ path: '/@alice.atom', contentType: 'application/atom+xml; charset=utf-8', body: '<feed' },
		{ path: '/@alice.rss', contentType: 'application/rss+xml; charset=utf-8', body: '<rss' },
		{ path: '/@alice.json', contentType: 'application/json; charset=utf-8', body: '"version": "https://jsonfeed.org/version/1"' },
	])('GET $path returns a feed', async ({ path, contentType, body }) => {
		const res = await createMountedApp().request(`http://example.test${path}`);

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe(contentType);
		expect(await res.text()).toContain(body);
	});

	test('HEAD returns feed headers without a body', async () => {
		const res = await createMountedApp().request('http://example.test/@alice.atom', { method: 'HEAD' });

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('application/atom+xml; charset=utf-8');
		expect(await res.text()).toBe('');
	});

	test('passes non-feed user paths through', async () => {
		const res = await createMountedApp().request('http://example.test/@alice');

		expect(res.status).toBe(200);
		expect(await res.text()).toBe('client fallback');
	});

	test('returns 404 when the user has no visible feed', async () => {
		const res = await createMountedApp(null).request('http://example.test/@missing.atom');

		expect(res.status).toBe(404);
		expect(await res.text()).toBe('');
	});
});
