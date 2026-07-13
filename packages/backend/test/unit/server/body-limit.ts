/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono } from 'hono';
import { describe, expect, test } from 'vitest';
import { readRequestBodyWithLimit } from '@/server/body-limit.js';

const textDecoder = new TextDecoder();
class BodyLimitExceeded extends Error {}

function createApp(limit: number): Hono {
	const app = new Hono();
	app.post('/', async (c) => {
		try {
			const body = await readRequestBodyWithLimit(c.req.raw, limit, () => new BodyLimitExceeded());
			return c.text(textDecoder.decode(body));
		} catch (error) {
			if (error instanceof BodyLimitExceeded) return c.body(null, 413);
			throw error;
		}
	});
	return app;
}

function streamedRequest(chunks: string[], headers: Record<string, string> = {}): Request {
	const encoder = new TextEncoder();
	return new Request('http://localhost/', {
		method: 'POST',
		headers,
		body: new ReadableStream({
			start(controller) {
				for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
				controller.close();
			},
		}),
		duplex: 'half',
	} as RequestInit & { duplex: 'half' });
}

describe('readRequestBodyWithLimit', () => {
	test('reads a fixed-length body', async () => {
		const response = await createApp(2).request('/', {
			method: 'POST',
			headers: { 'Content-Length': '2' },
			body: '{}',
		});

		expect(response.status).toBe(200);
		expect(await response.text()).toBe('{}');
	});

	test('rejects a declared length over the limit', async () => {
		const response = await createApp(1).request('/', {
			method: 'POST',
			headers: { 'Content-Length': '2' },
			body: '{}',
		});

		expect(response.status).toBe(413);
	});

	test('rejects an actual body larger than its declared length', async () => {
		const response = await createApp(1).request('/', {
			method: 'POST',
			headers: { 'Content-Length': '1' },
			body: '{}',
		});

		expect(response.status).toBe(413);
	});

	test('reads a streamed body without Content-Length', async () => {
		const response = await createApp(4).request(streamedRequest(['ab', 'cd']));

		expect(response.status).toBe(200);
		expect(await response.text()).toBe('abcd');
	});

	test('rejects a streamed body over the limit', async () => {
		let pullCount = 0;
		let cancelled = false;
		const encoder = new TextEncoder();
		const request = new Request('http://localhost/', {
			method: 'POST',
			body: new ReadableStream({
				pull(controller) {
					pullCount++;
					if (pullCount === 1) {
						controller.enqueue(encoder.encode('ab'));
					} else {
						controller.enqueue(encoder.encode('cd'));
						controller.close();
					}
				},
				cancel() {
					cancelled = true;
				},
			}),
			duplex: 'half',
		} as RequestInit & { duplex: 'half' });
		const response = await createApp(1).request(request);

		expect(response.status).toBe(413);
		expect(cancelled).toBe(true);
		expect(pullCount).toBe(1);
	});

	test('uses the streamed path when Transfer-Encoding is present', async () => {
		const response = await createApp(4).request(streamedRequest(['ab', 'cd'], {
			'Content-Length': '100',
			'Transfer-Encoding': 'chunked',
		}));

		expect(response.status).toBe(200);
		expect(await response.text()).toBe('abcd');
	});

	test('uses the streamed path for malformed Content-Length', async () => {
		const response = await createApp(4).request(streamedRequest(['ab', 'cd'], {
			'Content-Length': '4.0',
		}));

		expect(response.status).toBe(200);
		expect(await response.text()).toBe('abcd');
	});
});
