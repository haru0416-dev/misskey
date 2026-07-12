/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it, vi } from 'vitest';
import { I18n } from '@shared/utility/i18n.js';
import type { ILocale, ParameterizedString } from 'i18n';

describe('i18n', () => {
	it('missing development locale keys degrade to strings', () => {
		const i18n = new I18n({} as ILocale, true);

		expect((i18n.ts as unknown as Record<string, unknown>).missing).toBe('missing');
	});

	it('tsx (nested)', () => {
		const i18n = new I18n({
			foo: 'foo',
			bar: {
				baz: 'baz',
				qux: 'qux {0}' as unknown as ParameterizedString<'0'>,
				quux: 'quux {0} {1}' as unknown as ParameterizedString<'0' | '1'>,
			},
		});

		expect(i18n.ts.foo).toBe('foo');
		expect(i18n.ts.bar.baz).toBe('baz');
		expect(i18n.tsx.bar.qux({ 0: 'hoge' })).toBe('qux hoge');
		expect(i18n.tsx.bar.quux({ 0: 'hoge', 1: 'fuga' })).toBe('quux hoge fuga');
	});
	it('ts', () => {
		const i18n = new I18n({
			foo: 'foo',
			bar: {
				baz: 'baz',
				qux: 'qux {0}' as unknown as ParameterizedString<'0'>,
				quux: 'quux {0} {1}' as unknown as ParameterizedString<'0' | '1'>,
			},
		});

		expect(i18n.ts.foo).toBe('foo');
		expect(i18n.ts.bar.baz).toBe('baz');
	});
	it('tsx', () => {
		const i18n = new I18n({
			foo: 'foo',
			bar: {
				baz: 'baz',
				qux: 'qux {0}' as unknown as ParameterizedString<'0'>,
				quux: 'quux {0} {1}' as unknown as ParameterizedString<'0' | '1'>,
			},
		});

		expect(i18n.tsx.bar.qux({ 0: 'hoge' })).toBe('qux hoge');
		expect(i18n.tsx.bar.quux({ 0: 'hoge', 1: 'fuga' })).toBe('quux hoge fuga');
	});

	it('preserves unmatched braces without hanging', () => {
		const i18n = new I18n({
			message: 'Hello {} {name}, tail {' as unknown as ParameterizedString<'name'>,
			nested: 'Hello {broken {name}' as unknown as ParameterizedString<'name'>,
			empty: 'Empty {} braces',
		});

		expect(i18n.tsx.message({ name: 'Ai' })).toBe('Hello {} Ai, tail {');
		expect(i18n.tsx.nested({ name: 'Ai' })).toBe('Hello {broken Ai');
		expect((i18n.tsx as unknown as Record<string, unknown>).empty).toBeUndefined();
	});

	it('preserves missing placeholders and reports them in dev mode', () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const i18n = new I18n(
				{
					message: 'Hello {name}' as unknown as ParameterizedString<'name'>,
				},
				true,
			);
			const interpolate = i18n.tsx.message as unknown as (arg: Readonly<Record<string, string | number>>) => string;

			expect(interpolate({})).toBe('Hello {name}');
			expect(consoleError).toHaveBeenCalledWith('Missing locale parameters: name at message');
		} finally {
			consoleError.mockRestore();
		}
	});
});
