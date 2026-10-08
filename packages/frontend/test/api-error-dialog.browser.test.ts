/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { alertApiError, apiErrorDialogContent, popups, promiseDialog } from '@/os.js';
import { i18n } from '@/i18n.js';

describe('apiErrorDialogContent', () => {
	test('通信の失敗や JSON でない応答にも、code が無いまま例外にせず内容を返す', () => {
		expect(apiErrorDialogContent(new TypeError('Failed to fetch'))).toEqual({
			title: i18n.ts.somethingHappened,
			text: i18n.ts.serverIsDead,
		});
		expect(apiErrorDialogContent(new SyntaxError('Unexpected token < in JSON at position 0'))).toEqual({
			title: i18n.ts.gotInvalidResponseError,
			text: i18n.ts.gotInvalidResponseErrorDescription,
		});
	});

	test('利用者の中断では何も出さない', () => {
		expect(apiErrorDialogContent(new DOMException('aborted', 'AbortError'))).toBeNull();
	});

	test('API のエラーは code と id で出し分ける', () => {
		expect(apiErrorDialogContent({ code: 'TOO_MANY_CLIPS', id: 'x1', message: 'm' })).toEqual({
			title: i18n.ts.youCannotCreateAnymore,
			text: `${i18n.ts.error}: x1`,
		});
		expect(
			apiErrorDialogContent({ code: 'NO_SUCH_NOTE', id: 'x2', message: 'No such note.' }, { x2: { text: 'custom' } }),
		).toEqual({
			text: 'custom',
		});
		expect(apiErrorDialogContent({ code: 'NO_SUCH_NOTE', id: 'x3', message: 'No such note.' })).toEqual({
			text: 'No such note.\nx3',
		});
		expect(apiErrorDialogContent({ code: 'INTERNAL_ERROR', id: 'x4', message: '' })).toMatchObject({ internal: true });
	});
});

function errorDialogProps() {
	return popups.value.map((p) => p.props).filter((props) => props['type'] === 'error');
}

describe('alertApiError', () => {
	test('promiseDialog の既定の失敗表示は、エラーのオブジェクトではなく文言を本文に出す', async () => {
		popups.value = [];
		const failed = promiseDialog(
			Promise.reject(Object.assign(new Error('No such object.'), { code: 'NO_SUCH_OBJECT', id: 'e1' })),
		);
		await expect(failed).rejects.toMatchObject({ code: 'NO_SUCH_OBJECT' });
		await vi.waitFor(() => expect(errorDialogProps()).toHaveLength(1));
		expect(errorDialogProps()[0]).toMatchObject({ text: 'No such object.\ne1' });
		popups.value = [];
	});

	test('通信の失敗にも本文のある内容を出し、利用者の中断では何も出さない', async () => {
		popups.value = [];
		void alertApiError(new TypeError('Failed to fetch'));
		void alertApiError(new DOMException('aborted', 'AbortError'));
		await vi.waitFor(() => expect(errorDialogProps()).toHaveLength(1));
		expect(errorDialogProps()[0]).toMatchObject({ title: i18n.ts.somethingHappened, text: i18n.ts.serverIsDead });
		popups.value = [];
	});
});
