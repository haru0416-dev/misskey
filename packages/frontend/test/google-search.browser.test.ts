/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import MkGoogle from '@/features/search/components/MkGoogle.vue';

vi.mock('@/preferences.js', () => ({
	prefer: { searchEngine: 'google' },
}));

describe('MkGoogle', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	test('描いただけでは検索を開かず、送信したときだけ開く', async () => {
		const open = vi.spyOn(window, 'open').mockReturnValue(null);
		const result = render(MkGoogle, { props: { q: 'MFM' } });

		// 検索構文を含む投稿を見るたびに、見た人のブラウザで検索のタブが開いてはいけない
		expect(open).not.toHaveBeenCalled();
		const input = result.container.querySelector('input');
		expect(input?.value).toBe('MFM');

		await fireEvent.submit(result.container.querySelector('form')!);
		expect(open).toHaveBeenCalledTimes(1);
		expect(String(open.mock.calls[0]?.[0])).toBe('https://www.google.com/search?q=MFM');
	});
});
