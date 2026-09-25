/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { acceptsActivityPub } from '@/server/app.js';

describe('acceptsActivityPub', () => {
	test('ActivityPub のメディア型を含む Accept を見分ける', () => {
		expect(acceptsActivityPub('application/activity+json')).toBe(true);
		expect(acceptsActivityPub('Application/Activity+JSON')).toBe(true);
		expect(acceptsActivityPub('application/ld+json; profile="https://www.w3.org/ns/activitystreams"')).toBe(true);
		expect(acceptsActivityPub('text/html, application/ld+json; profile="https://www.w3.org/ns/activitystreams"')).toBe(
			true,
		);
		expect(acceptsActivityPub('text/html')).toBe(false);
		expect(acceptsActivityPub('application/ld+json')).toBe(false);
		expect(acceptsActivityPub('')).toBe(false);
	});

	test('プロファイルは同じメディア型の中にあるときだけ数える', () => {
		expect(acceptsActivityPub('application/ld+json, text/plain; x=activitystreams')).toBe(false);
	});

	test('長い Accept も入力長に比例する時間で判定する', () => {
		// `ld\\+json.+activitystreams` の形だと長さの 2 乗で伸び、32 KB で約 42 ms かかる。
		const started = performance.now();
		expect(acceptsActivityPub('application/ld+json;'.repeat(16_384))).toBe(false);
		expect(performance.now() - started).toBeLessThan(50);
	});
});
