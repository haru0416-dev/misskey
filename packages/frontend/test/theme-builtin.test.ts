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

	// themeProps に無いキーは compile が黙って捨てる (theme.ts の filter)。
	// 型も `props: Record<string, string>` なので、プロパティ名を 1 文字間違えても
	// エラーも警告も出ないまま「なぜか色が変わらない」状態になる。ここで止める。
	//
	// `X` 接頭辞はテーマ内でだけ使う中間値 (`@X10` のように参照して出力からは落とす)。
	// d-u0 / l-u0 が使っている。
	for (const [path, theme] of Object.entries(builtins)) {
		const name = path.replace(/^.*\//, '');

		test(`${name} に未知のプロパティ名が無い`, () => {
			const unknown = Object.keys(theme.props).filter((key) => !themeProps.includes(key) && !key.startsWith('X'));
			expect(unknown, `${name} の未知のプロパティ`).toEqual([]);
		});
	}

	test('色は sRGB 表記に解決される', () => {
		// テーマの記法は hex に統一してある。compile はそれを rgb()/rgba() へ落とす。
		const compiled = compile(builtins['../../frontend-shared/themes/l-erebia.json5']!);
		expect(compiled['accent']).toBe('rgb(92, 98, 216)');
		expect(compiled['bg']).toBe('rgb(246, 247, 250)');
	});
});
