/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { Hono } from 'hono';
import type { Config } from '@/config.js';
import { getRequestIp } from '@/server/rest/shell-helpers.js';

async function resolveRequestIp(trustProxy: Config['trustProxy'], forwardedFor: string, remoteAddress: string): Promise<string> {
	const app = new Hono();
	app.get('/', c => c.text(getRequestIp(c, { trustProxy } as Config)));
	const response = await app.request('/', {
		headers: {
			'x-forwarded-for': forwardedFor,
			'x-misskey-remote-address': remoteAddress,
		},
	});
	return await response.text();
}

describe('getRequestIp', () => {
	test('does not trust forwarded headers from an untrusted peer', async () => {
		expect(await resolveRequestIp(['10.0.0.0/8'], '203.0.113.10', '198.51.100.20')).toBe('198.51.100.20');
	});

	test('returns the first untrusted address when traversing trusted proxies', async () => {
		expect(await resolveRequestIp(['10.0.0.0/8'], '192.0.2.1, 203.0.113.10, 10.0.0.2', '10.0.0.3')).toBe('203.0.113.10');
	});

	test('supports hop-count trust configuration', async () => {
		expect(await resolveRequestIp(1, '192.0.2.1, 203.0.113.10', '10.0.0.3')).toBe('203.0.113.10');
	});

	test('trusts the left-most address only when all proxies are trusted', async () => {
		expect(await resolveRequestIp(true, '192.0.2.1, 203.0.113.10', '10.0.0.3')).toBe('192.0.2.1');
	});
});
