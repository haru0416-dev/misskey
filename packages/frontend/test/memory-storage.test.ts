/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { createMemoryStorage } from '@/memory-storage.js';
import type { MemoryStorage } from '@/memory-storage.js';

let storage: MemoryStorage;

beforeEach(() => {
	storage = createMemoryStorage();
});

describe('MemoryStorage', () => {
	test('stores unknown values without type assertions', () => {
		storage.setItem('object', { value: 1 });

		expect(storage.getItem('object')).toStrictEqual({ value: 1 });
		expect(storage.has('object')).toBe(true);
		expect(storage.size).toBe(1);
	});

	test('returns a value accepted by a type guard', () => {
		storage.setItem('number', 42);

		expect(storage.getItem('number', (value): value is number => typeof value === 'number')).toBe(42);
	});

	test('removes a value rejected by a type guard', () => {
		storage.setItem('number', 'invalid');

		expect(storage.getItem('number', (value): value is number => typeof value === 'number')).toBeNull();
		expect(storage.has('number')).toBe(false);
	});

	test('supports removing and clearing values', () => {
		storage.setItem('first', 1);
		storage.setItem('second', 2);
		storage.removeItem('first');
		expect(storage.getItem('first')).toBeNull();

		storage.clear();
		expect(storage.size).toBe(0);
	});
});
