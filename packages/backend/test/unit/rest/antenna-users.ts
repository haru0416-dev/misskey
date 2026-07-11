/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { antennaUsersIncludes } from '@/server/rest/antennas.js';

const config = { host: 'local.example' };

describe('antennaUsersIncludes', () => {
	test('matches a specific account without changing existing behavior', () => {
		expect(antennaUsersIncludes(config, ['@Alice@Remote.Example'], { username: 'alice', host: 'remote.example' })).toBe(true);
		expect(antennaUsersIncludes(config, ['@alice@remote.example'], { username: 'bob', host: 'remote.example' })).toBe(false);
	});

	test('matches every account on a specified server', () => {
		expect(antennaUsersIncludes(config, ['*@REMOTE.EXAMPLE'], { username: 'alice', host: 'remote.example' })).toBe(true);
		expect(antennaUsersIncludes(config, ['*@remote.example'], { username: 'bob', host: 'other.example' })).toBe(false);
	});

	test('normalizes internationalized domains and supports the local server', () => {
		expect(antennaUsersIncludes(config, ['*@例え.テスト'], { username: 'alice', host: 'xn--r8jz45g.xn--zckzah' })).toBe(true);
		expect(antennaUsersIncludes(config, ['*@local.example'], { username: 'alice', host: null })).toBe(true);
	});

	test('does not treat a hostless wildcard as every account', () => {
		expect(antennaUsersIncludes(config, ['*'], { username: 'alice', host: 'remote.example' })).toBe(false);
	});
});
