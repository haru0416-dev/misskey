/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { captureWebhook } from '../utils.js';

describe('captureWebhook', () => {
	let server: ReturnType<typeof createServer>;
	let port: number;

	async function listen(portNumber: number) {
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(portNumber, () => {
				server.off('error', reject);
				resolve();
			});
		});
	}

	async function close() {
		if (server.listening) {
			await new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
			});
		}
	}

	beforeEach(async () => {
		server = createServer();
		await listen(0);
		port = (server.address() as AddressInfo).port;
	});

	afterEach(close);

	test('rejects a listen error without running the action', async () => {
		let called = false;
		await expect(
			captureWebhook(async () => {
				called = true;
			}, port),
		).rejects.toMatchObject({ code: 'EADDRINUSE' });
		expect(called).toBe(false);
	}, 1000);

	test('captures JSON and releases the port', async () => {
		await close();
		const payload = { type: 'test', body: { value: 1 } };
		const result = await captureWebhook(async () => {
			const missing = await fetch(`http://localhost:${port}/missing`);
			expect(missing.status).toBe(404);
			await missing.text();
			const response = await fetch(`http://localhost:${port}/`, {
				method: 'POST',
				body: JSON.stringify(payload),
			});
			expect(response.status).toBe(200);
			expect(await response.text()).toBe('ok');
		}, port);
		expect(result).toEqual(payload);
		await listen(port);
	});

	test('propagates an action error and releases the port', async () => {
		await close();
		const error = new Error('action failed');
		await expect(
			captureWebhook(async () => {
				throw error;
			}, port),
		).rejects.toBe(error);
		await listen(port);
	});

	test('times out and releases the port when no webhook arrives', async () => {
		await close();
		await expect(captureWebhook(async () => {}, port)).rejects.toThrow('timeout');
		await listen(port);
	}, 5000);

	test('releases the port when the payload is invalid JSON', async () => {
		await close();
		await expect(
			captureWebhook(async () => {
				const response = await fetch(`http://localhost:${port}/`, { method: 'POST', body: '{' });
				await response.text();
			}, port),
		).rejects.toBeInstanceOf(SyntaxError);
		await listen(port);
	});
});
