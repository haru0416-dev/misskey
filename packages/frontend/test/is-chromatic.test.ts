/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import isChromatic from '@/utility/is-chromatic.js';

function fakeWindow(userAgent: string, href: string): Window {
	return { navigator: { userAgent }, location: { href } } as Window;
}

const REAL_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

describe('isChromatic', () => {
	test('Chromatic の UA なら真', () => {
		expect(isChromatic(fakeWindow(`${REAL_UA} Chromatic`, 'https://example.com/'))).toBe(true);
	});

	test('URL に chromatic=true があれば真', () => {
		expect(isChromatic(fakeWindow(REAL_UA, 'https://example.com/?chromatic=true'))).toBe(true);
	});

	// 通常の閲覧で真になると時刻表示が固定され、アニメーションも止まる。
	test('通常のブラウザでは偽', () => {
		expect(isChromatic(fakeWindow(REAL_UA, 'https://example.com/'))).toBe(false);
	});

	test('紛らわしい値でも偽', () => {
		// 小文字の chromatic は UA 判定に一致しない (大文字始まりのみ)
		expect(isChromatic(fakeWindow(`${REAL_UA} chromatic`, 'https://example.com/'))).toBe(false);
		// クエリ名が違えば一致しない
		expect(isChromatic(fakeWindow(REAL_UA, 'https://example.com/?chromatic=false'))).toBe(false);
		expect(isChromatic(fakeWindow(REAL_UA, 'https://example.com/?notchromatic=true'))).toBe(true);
	});
});
