/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono } from 'hono';
import { describe, expect, test } from 'vitest';
import type { Config } from '@/config.js';
import type { MiMeta } from '@/models/Meta.js';
import { acceptsActivityPub, registerHttpMiddleware } from '@/server/app.js';

describe('acceptsActivityPub', () => {
	test('ActivityPub のメディア型を含む Accept を見分ける', () => {
		expect(acceptsActivityPub('application/activity+json')).toBe(true);
		expect(acceptsActivityPub('Application/Activity+JSON')).toBe(true);
		expect(acceptsActivityPub('application/ld+json; profile="https://www.w3.org/ns/activitystreams"')).toBe(true);
		expect(acceptsActivityPub('text/html, application/ld+json; profile="https://www.w3.org/ns/activitystreams"')).toBe(
			true,
		);
		expect(acceptsActivityPub('text/html')).toBe(false);
		expect(acceptsActivityPub('application/ld+json')).toBe(false);
		expect(acceptsActivityPub('')).toBe(false);
	});

	test('プロファイルは同じメディア型の中にあるときだけ数える', () => {
		expect(acceptsActivityPub('application/ld+json, text/plain; x=activitystreams')).toBe(false);
	});

	test('長い Accept も入力長に比例する時間で判定する', () => {
		// `ld\\+json.+activitystreams` の形だと長さの 2 乗で伸び、32 KB で約 42 ms かかる。
		const started = performance.now();
		expect(acceptsActivityPub('application/ld+json;'.repeat(16_384))).toBe(false);
		expect(performance.now() - started).toBeLessThan(50);
	});
});

describe('HSTS', () => {
	function createApp(url: string, hsts: boolean): Hono {
		const app = new Hono();
		registerHttpMiddleware(app, {
			config: { instance: { url }, server: { http: { hsts } } } as unknown as Config,
			meta: { allowExternalApRedirect: true } as MiMeta,
		});
		// API・静的ファイル・SSR は Response を直接返す。redirect は headers が変更不可の Response になる。
		app.get('/raw', () => new Response('raw'));
		app.get('/redirect', () => Response.redirect('https://example.com/', 302));
		app.get('/text', (c) => c.text('text'));
		return app;
	}

	test('https の URL なら、Response を直接返すルートにも付ける', async () => {
		const app = createApp('https://example.com', true);
		for (const path of ['/raw', '/redirect', '/text']) {
			const res = await app.request(path);
			expect(res.headers.get('strict-transport-security'), path).toBe('max-age=15552000; preload');
		}
		expect(await (await app.request('/raw')).text()).toBe('raw');
	});

	test('http の URL や無効にした設定では付けない', async () => {
		for (const app of [createApp('http://example.com', true), createApp('https://example.com', false)]) {
			expect((await app.request('/raw')).headers.get('strict-transport-security')).toBeNull();
		}
	});
});
