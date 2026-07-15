/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { parseQueueDatabaseInfo } from '@/core/QueueAdminLogic.js';
import { contentDisposition } from '@/misc/content-disposition.js';
import { dateUTC } from '@/misc/prelude/time.js';
import { parseLocalApUri } from '@/server/rest/ap-resolve.js';

describe('misc:content-disposition', () => {
	test('inline', () => {
		expect(contentDisposition('inline', 'foo bar')).toMatch(/^inline; filename="?foo_bar"?; filename\*=UTF-8''foo%20bar$/);
	});
	test('attachment', () => {
		expect(contentDisposition('attachment', 'foo bar')).toMatch(/^attachment; filename="?foo_bar"?; filename\*=UTF-8''foo%20bar$/);
	});
	test('non ascii', () => {
		expect(contentDisposition('attachment', 'ファイル名')).toMatch(/^attachment; filename="?_____"?; filename\*=UTF-8''%E3%83%95%E3%82%A1%E3%82%A4%E3%83%AB%E5%90%8D$/);
	});
});

describe('core:queue-admin', () => {
	const requiredInfo = [
		'valkey_version:8.1.0',
		'server_mode:standalone',
		'run_id:test-run',
		'process_id:123',
		'tcp_port:6379',
		'os:Linux',
		'uptime_in_seconds:42',
		'maxmemory:512',
		'used_memory:100',
		'connected_clients:3',
	].join('\n');

	test('optional INFO fields use response-safe fallbacks', () => {
		expect(parseQueueDatabaseInfo(requiredInfo)).toMatchObject({
			memory: {
				total: 512,
				used: 100,
				fragmentationRatio: 0,
				peak: 100,
			},
			clients: {
				connected: 3,
				blocked: 0,
			},
		});
	});

	test('missing required INFO fields are rejected', () => {
		expect(() => parseQueueDatabaseInfo(requiredInfo.replace('used_memory:100\n', ''))).toThrow('used_memory');
	});
});

describe('activitypub:local-uri', () => {
	const config = { runtime: { host: 'example.test' } };

	test('same-host paths without an object id remain local', () => {
		expect(parseLocalApUri(config, 'https://example.test/inbox')).toEqual({
			local: true,
			type: 'inbox',
			id: undefined,
			rest: undefined,
		});
	});

	test('different-host paths remain remote', () => {
		expect(parseLocalApUri(config, 'https://remote.test/inbox')).toEqual({
			local: false,
			uri: 'https://remote.test/inbox',
		});
	});
});

describe('misc:time', () => {
	test('dense date parts are passed through to Date.UTC', () => {
		expect(dateUTC([2020, 0, 2, 3, 4, 5, 6]).toISOString()).toBe('2020-01-02T03:04:05.006Z');
	});

	test('the Unix epoch is accepted', () => {
		expect(dateUTC([1970, 0]).getTime()).toBe(0);
	});

	test('sparse date parts are rejected', () => {
		const sparse = new Array<number>(4);
		sparse[0] = 2020;
		sparse[1] = 0;
		sparse[3] = 3;
		expect(() => dateUTC(sparse)).toThrow('wrong number of arguments');
	});
});
