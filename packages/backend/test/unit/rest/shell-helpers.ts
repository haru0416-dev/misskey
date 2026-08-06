/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { Hono } from 'hono';
import type { Config } from '@/config.js';
import { getRequestIp, jsonBody, runApiEndpoint } from '@/server/rest/shell-helpers.js';

async function resolveRequestIp(
	trustedNetworks: string[],
	forwardedFor: string,
	remoteAddress: string,
): Promise<string> {
	const app = new Hono();
	app.get('/', (c) =>
		c.text(
			getRequestIp(c, {
				server: { reverseProxy: { trustedNetworks } },
			} as Config),
		),
	);
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
		expect(await resolveRequestIp(['10.0.0.0/8'], '192.0.2.1, 203.0.113.10, 10.0.0.2', '10.0.0.3')).toBe(
			'203.0.113.10',
		);
	});

	test('ignores forwarded headers when no trusted proxy network is configured', async () => {
		expect(await resolveRequestIp([], '192.0.2.1, 203.0.113.10', '10.0.0.3')).toBe('10.0.0.3');
	});
});

describe('runApiEndpoint', () => {
	test('treats an empty JSON request body as an empty object', async () => {
		const app = new Hono();
		app.post('/', (c) => runApiEndpoint(c, async () => c.json(await jsonBody(c))));

		const response = await app.request('/', { method: 'POST' });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({});
	});

	test('returns the JSON error contract for non-Error throws', async () => {
		const app = new Hono();
		app.get('/', (c) => runApiEndpoint(c, () => Promise.reject('unexpected')));

		const response = await app.request('/');
		expect(response.status).toBe(500);
		expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
		expect(await response.json()).toMatchObject({
			error: {
				message: 'Internal error occurred. Please contact us if the error persists.',
				code: 'INTERNAL_ERROR',
				id: '5d37dbcb-891e-41ca-a3d6-e690c97775ac',
				kind: 'server',
				info: { id: expect.any(String) },
			},
		});
	});
});
