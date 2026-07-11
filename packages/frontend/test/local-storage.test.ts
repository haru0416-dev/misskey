/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { getStorageItemAsJson, isJsonObject, isStringArray, miLocalStorage } from '@/local-storage.js';

beforeEach(() => {
	window.localStorage.clear();
	window.sessionStorage.clear();
});

describe('miLocalStorage JSON values', () => {
	test('reads a valid JSON value as unknown', () => {
		window.localStorage.setItem('debug', '{"enabled":true}');

		expect(miLocalStorage.getItemAsJson('debug')).toStrictEqual({ enabled: true });
	});

	test('returns a value accepted by the supplied type guard', () => {
		window.localStorage.setItem('debug', '42');

		expect(miLocalStorage.getItemAsJson('debug', (value): value is number => typeof value === 'number')).toBe(42);
	});

	test.each(['{', 'undefined'])('removes malformed JSON without throwing: %s', (stored) => {
		window.localStorage.setItem('debug', stored);

		expect(miLocalStorage.getItemAsJson('debug')).toBeUndefined();
		expect(window.localStorage.getItem('debug')).toBeNull();
	});

	test('removes a value rejected by the supplied type guard', () => {
		window.localStorage.setItem('debug', '"not a number"');

		expect(miLocalStorage.getItemAsJson('debug', (value): value is number => typeof value === 'number')).toBeUndefined();
		expect(window.localStorage.getItem('debug')).toBeNull();
	});

	test('provides reusable object and string-array guards', () => {
		expect(isJsonObject({ key: 'value' })).toBe(true);
		expect(isJsonObject([])).toBe(false);
		expect(isStringArray(['one', 'two'])).toBe(true);
		expect(isStringArray(['one', 2])).toBe(false);
	});

	test('safely reads and repairs another Web Storage implementation', () => {
		window.sessionStorage.setItem('test-cache', '["one","two"]');
		expect(getStorageItemAsJson(window.sessionStorage, 'test-cache', isStringArray)).toStrictEqual(['one', 'two']);

		window.sessionStorage.setItem('test-cache', '{');
		expect(getStorageItemAsJson(window.sessionStorage, 'test-cache')).toBeUndefined();
		expect(window.sessionStorage.getItem('test-cache')).toBeNull();
	});

	test('removes a key when the value cannot be represented in JSON', () => {
		window.localStorage.setItem('debug', 'true');

		miLocalStorage.setItemAsJson('debug', undefined);

		expect(window.localStorage.getItem('debug')).toBeNull();
	});
});
