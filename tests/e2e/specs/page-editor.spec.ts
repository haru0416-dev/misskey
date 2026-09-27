/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from '../support/fixtures.js';
import { closeInitialUserSetup, login, registerUser, resetState } from '../support/helpers.js';

test.describe('ページのエディタ', () => {
	test('複製に失敗しても、元のページのタイトルと名前を変えない', async ({ page }) => {
		await resetState(page);
		const alice = await registerUser(page, 'alice', 'alice1234', true);
		const create = async (title: string, name: string) =>
			await (
				await page.request.post('/api/pages/create', {
					data: { i: alice.token, title, name, content: [], variables: [], script: '' },
				})
			).json();
		const original = await create('original', 'original');
		// 複製の名前 (original-copy) を先に使っておき、複製を名前の衝突で失敗させる。
		await create('taken', 'original-copy');
		await login(page, 'alice', 'alice1234');
		await closeInitialUserSetup(page);

		await page.goto(`/pages/edit/${original.id}`);
		await page.getByRole('button', { name: '複製' }).click();
		await page.locator('[data-cy-modal-dialog-ok]').click();

		const update = page.waitForRequest('**/api/pages/update');
		await page.getByRole('button', { name: '保存' }).click();
		const body = (await update).postDataJSON();
		expect(body.title).toBe('original');
		expect(body.name).toBe('original');
	});
});
