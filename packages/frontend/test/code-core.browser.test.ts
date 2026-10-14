/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/vue';
import MkCodeCore from '@/features/code/components/MkCode.Core.vue';

// ほかのテストが読み込まない言語を使い、最初の表示で言語のチャンクを読み込む状態を作る
const LANGUAGE = 'zig';

describe('MkCode.Core', () => {
	afterEach(() => {
		cleanup();
	});

	test('言語を読み込む間に書き換えたコードもすぐ表示し、読み込み後は待たずに色を付ける', async () => {
		const result = render(MkCodeCore, { props: { code: 'const a = 1;', lang: LANGUAGE, codeEditor: true } });
		const code = () => result.container.querySelector('code')!;

		// 読み込みが終わる前の書き換え。MkCodeEditor は入力欄の文字を透明にしてこの表示を重ねるので、古いままだと打った文字が見えない
		await result.rerender({ code: 'const b = 2;', lang: LANGUAGE, codeEditor: true });
		expect(code().textContent).toBe('const b = 2;');

		await waitFor(() => expect(code().querySelector('span[style*="--sh-keyword"]')).not.toBeNull());
		expect(code().textContent).toBe('const b = 2;');

		// 読み込み済みなら、書き換えた直後から色付きで出す
		await result.rerender({ code: 'const c = 3;', lang: LANGUAGE, codeEditor: true });
		expect(code().textContent).toBe('const c = 3;');
		expect(code().querySelector('span[style*="--sh-keyword"]')).not.toBeNull();
	});
});
