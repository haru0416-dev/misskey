/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { loadBuiltLocales, runVerification, verifyLocales } from '../scripts/verify.js';

describe('verifyLocales', () => {
	test('loads locale records from the built locales export', async () => {
		const locales = await loadBuiltLocales();

		expect(locales['ja-JP']).toBeTypeOf('object');
		expect(locales['en-US']).toBeTypeOf('object');
	});

	test('reports mismatched locale value types', () => {
		const errors = verifyLocales({
			'ja-JP': { section: { label: 'ラベル' }, title: 'タイトル' },
			'en-US': { section: 'Label', title: { text: 'Title' } },
		});

		expect(errors).toEqual([
			{ type: 'mismatched_type', lang: 'en-US', tree: 'section', data: { expected: 'object', actual: 'string' } },
			{ type: 'mismatched_type', lang: 'en-US', tree: 'title', data: { expected: 'string', actual: 'object' } },
		]);
	});

	test('reports placeholders missing from a translation', () => {
		const locales = {
			'ja-JP': { greeting: 'こんにちは、{name}。{count}件あります。' },
			'en-US': { greeting: 'Hello, {name}.' },
		};
		const errors = verifyLocales(locales);

		expect(errors).toEqual([
			{ type: 'missing_parameter', lang: 'en-US', tree: 'greeting', data: { parameter: 'count' } },
		]);

		const writeError = vi.fn();
		expect(runVerification(locales, writeError)).toBe(1);
		expect(writeError).toHaveBeenCalledWith(errors[0]);
	});
});
