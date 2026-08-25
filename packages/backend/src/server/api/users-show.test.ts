/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */


import { describe, test, expect } from 'vitest';
import { getValidator } from '../../../test/prelude/get-api-validator.js';
import { endpointMetas } from './endpoint-metas.js';

const paramDef = endpointMetas['users/show'].paramDef;

const VALID = true;
const INVALID = false;

describe('api:users/show', () => {
	describe('validation', () => {
		const v = getValidator(paramDef);

		test('Reject empty', () => expect(v({})).toBe(INVALID));
		test('Reject host only', () => expect(v({ host: 'misskey.test' })).toBe(INVALID));
		test('Accept userId only', () => expect(v({ userId: '1' })).toBe(VALID));
		test('Accept username and host', () => expect(v({ username: 'alice', host: 'misskey.test' })).toBe(VALID));
	});
});
