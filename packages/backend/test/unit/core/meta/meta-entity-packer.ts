/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { parseTheme } from '@/core/meta/MetaEntityPacker.js';

describe('core:meta:parseTheme', () => {
	test('JSON5 の記法を受け付ける', () => {
		// 管理画面のテーマは JSON5 で入力されるので、コメント・末尾カンマ・
		// クォート無しキー・16 進数がそのまま通ること。
		expect(parseTheme('{ /* c */ id: "x", base: "dark", props: { bg: 0xff, }, }')).toBe(
			'{"id":"x","base":"dark","props":{"bg":255}}',
		);
		expect(parseTheme("{ id: 'y' } // 行コメント")).toBe('{"id":"y"}');
	});

	test('素の JSON も通る', () => {
		expect(parseTheme('{"id":"z"}')).toBe('{"id":"z"}');
	});

	test('壊れた入力は null にする', () => {
		expect(parseTheme('{ id: ')).toBeNull();
		expect(parseTheme(null)).toBeNull();
	});
});
