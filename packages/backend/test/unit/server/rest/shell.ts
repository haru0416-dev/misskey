/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { createApiShellApp } from '@/server/rest/shell.js';

function expectApiHeaders(response: Response): void {
	expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
	expect(response.headers.get('Cache-Control')).toBe('private, max-age=0, must-revalidate');
}

describe('API shell headers', () => {
	const app = createApiShellApp({} as never);

	test('sets API headers on JSON responses', async () => {
		const response = await app.request('/ping', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: '{}',
		});

		expect(response.status).toBe(200);
		expectApiHeaders(response);
	});

	test('sets API headers on preflight responses', async () => {
		const response = await app.request('/ping', {
			method: 'OPTIONS',
			headers: { 'Access-Control-Request-Headers': 'authorization, content-type' },
		});

		expect(response.status).toBe(204);
		expectApiHeaders(response);
		expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET,HEAD,POST,OPTIONS');
		expect(response.headers.get('Access-Control-Allow-Headers')).toBe('authorization, content-type');
	});

	test('sets API headers on utility responses', async () => {
		const response = await app.request('/clear-browser-cache', { method: 'POST' });

		expect(response.status).toBe(204);
		expectApiHeaders(response);
		expect(response.headers.get('Clear-Site-Data')).toContain('cache');
	});

	test('sets API headers on unknown endpoint responses', async () => {
		const response = await app.request('/does-not-exist', { method: 'POST' });

		expect(response.status).toBe(404);
		expectApiHeaders(response);
	});
});
