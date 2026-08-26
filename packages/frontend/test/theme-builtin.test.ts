/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { compile, themeProps } from '@shared/utility/theme.js';
import type { Theme } from '@shared/utility/theme.js';

const builtins = import.meta.glob<Theme>('../../frontend-shared/themes/*.json5', {
	eager: true,
	import: 'default',
});

describe('組み込みテーマ', () => {
	test('23 テーマすべてが json5 から読める', () => {
		// glob の取りこぼしに気付けるよう件数を明示する。
		expect(Object.keys(builtins).length).toBe(23);
	});

	for (const [path, theme] of Object.entries(builtins)) {
		const name = path.replace(/^.*\//, '');

		test(`${name} がコンパイルでき、全プロパティが CSS の値になる`, () => {
			const compiled = compile(theme);

			for (const prop of themeProps) {
				const value = compiled[prop];
				expect(value, `${name} の ${prop}`).toBeDefined();
				// 未解決の参照 (@foo) や関数 (:alpha<...) が残っていないこと。
				expect(value, `${name} の ${prop}`).not.toMatch(/^[@:]/);
			}
		});
	}

	test('色は sRGB 表記に解決される', () => {
		// テーマの記法は hex に統一してある。compile はそれを rgb()/rgba() へ落とす。
		const compiled = compile(builtins['../../frontend-shared/themes/l-erebia.json5']!);
		expect(compiled['accent']).toBe('rgb(92, 98, 216)');
		expect(compiled['bg']).toBe('rgb(246, 247, 250)');
	});
});
