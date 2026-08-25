/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */


import * as assert from 'assert';
import { describe, expect, test } from 'vitest';
import { relativeFetch } from '../utils.js';

describe('nodeinfo', () => {
	test('nodeinfo 2.1', async () => {
		const res = await relativeFetch('nodeinfo/2.1');
		assert.ok(res.ok);
		expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');

		const nodeInfo = (await res.json()) as any;
		expect(nodeInfo.software.name).toBe('erebia');
		expect(nodeInfo.software.homepage).toBe(nodeInfo.metadata.repositoryUrl);
		expect(nodeInfo.software.repository).toBe(nodeInfo.metadata.repositoryUrl);
	});

	test('nodeinfo 2.0', async () => {
		const res = await relativeFetch('nodeinfo/2.0');
		assert.ok(res.ok);
		expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');

		const nodeInfo = (await res.json()) as any;
		expect(nodeInfo.software.name).toBe('erebia');
		expect(nodeInfo.software.homepage).toBe(nodeInfo.metadata.repositoryUrl);
	});
});
