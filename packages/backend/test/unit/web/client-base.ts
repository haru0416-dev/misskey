/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { describe, expect, test } from 'vitest';
import { createClientBaseApp } from '@/server/web/client-base.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/Meta.js';
import type { CommonData } from '@/server/web/views/_.js';

function createCommonData(): CommonData {
	const config = {
		instance: { url: 'http://example.test' },
		runtime: { version: 'test-version' },
	} as Config;

	return {
		version: 'test-version',
		config,
		langs: ['ja-JP'],
		instanceName: 'Testkey',
		icon: null,
		appleTouchIcon: null,
		themeColor: '#86b300',
		serverErrorImageUrl: 'https://example.test/error.jpg',
		infoImageUrl: 'https://example.test/info.jpg',
		notFoundImageUrl: 'https://example.test/not-found.jpg',
		instanceUrl: 'http://example.test',
		now: 0,
		federationEnabled: true,
		frontendViteFiles: {
			entryJs: 'scripts/entry.js',
			css: ['assets/app.css'],
			modulePreloads: ['scripts/vendor.js'],
		},
		frontendBootloaderJs: null,
		frontendBootloaderCss: null,
		frontendEmbedViteFiles: null,
		frontendEmbedBootloaderJs: null,
		frontendEmbedBootloaderCss: null,
		metaJson: '{"name":"Testkey"}',
	};
}

function createApp(): Hono {
	return createClientBaseApp({
		config: createCommonData().config,
		db: {} as MiDrizzleDatabase,
		meta: {
			name: 'Testkey',
			description: 'Test instance',
			bannerUrl: null,
		} as MiMeta,
		getCommonData: async () => createCommonData(),
	});
}

describe('createClientBaseApp', () => {
	test('GET / renders the SPA base HTML', async () => {
		const res = await createApp().request('http://example.test/');
		const body = await res.text();

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(res.headers.get('x-frame-options')).toBe('DENY');
		expect(res.headers.get('cache-control')).toBe('public, max-age=30');
		expect(body).toContain('<!DOCTYPE html>');
		expect(body).toContain('<title>Testkey</title>');
		expect(body).toContain('<script type="application/json" id="misskey_meta"');
		expect(body).toContain('const CLIENT_ENTRY = "scripts/entry.js";');
		expect(body).toContain('const CLIENT_PRELOADS = ["scripts/vendor.js"];');
	});

	test('GET /tags/:tag renders a noindex base page', async () => {
		const res = await createApp().request('http://example.test/tags/test');
		const body = await res.text();

		expect(res.status).toBe(200);
		expect(body).toContain('<meta name="robots" content="noindex"');
	});

	test('HEAD requests return headers without a body', async () => {
		const res = await createApp().request('http://example.test/settings', {
			method: 'HEAD',
		});
		const body = await res.text();

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(body).toBe('');
	});
});
