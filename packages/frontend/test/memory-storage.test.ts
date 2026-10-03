/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { createMemoryStorage } from '@/utility/memory-storage.js';
import type { MemoryStorage } from '@/utility/memory-storage.js';

let storage: MemoryStorage;

beforeEach(() => {
	storage = createMemoryStorage();
});

describe('MemoryStorage', () => {
	test('returns a value accepted by a type guard', () => {
		storage.setItem('number', 42);

		expect(storage.getItem('number', (value): value is number => typeof value === 'number')).toBe(42);
	});

	test('removes a value rejected by a type guard', () => {
		storage.setItem('number', 'invalid');

		expect(storage.getItem('number', (value): value is number => typeof value === 'number')).toBeNull();
		expect(storage.has('number')).toBe(false);
	});
});
