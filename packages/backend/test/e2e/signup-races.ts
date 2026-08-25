/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */


import * as assert from 'node:assert';
import { describe, expect, test } from 'vitest';
import { api, castAsError } from '../utils.js';

const setupPassword = 'example_password_please_change_this_or_you_will_get_hacked';

describe('Signup races', () => {
	test('concurrent initial root claims return one success and one access denied error', async () => {
		const responses = await Promise.all([
			api('admin/accounts/create', {
				username: 'initialroota',
				password: 'test',
				setupPassword,
			}),
			api('admin/accounts/create', {
				username: 'initialrootb',
				password: 'test',
				setupPassword,
			}),
		]);
		const success = responses.filter((response) => response.status === 200);
		const denied = responses.filter((response) => response.status === 400);

		expect(success.length).toBe(1);
		expect(denied.length).toBe(1);
		expect(castAsError(denied[0]!.body as any).error.code).toBe('ACCESS_DENIED');
	});

	test('concurrent signup requests for the same username return one controlled error', async () => {
		const responses = await Promise.all([
			api('signup', { username: 'signupcollision', password: 'test' }),
			api('signup', { username: 'signupcollision', password: 'test' }),
		]);
		const success = responses.filter((response) => response.status === 200);
		const rejected = responses.filter((response) => response.status === 400);

		expect(success.length).toBe(1);
		expect(rejected.length).toBe(1);
		assert.ok(['DUPLICATED_USERNAME', 'USED_USERNAME'].includes(castAsError(rejected[0]!.body as any).error.code));
	});
});
