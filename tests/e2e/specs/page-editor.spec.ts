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
		const duplicated = page.waitForResponse((response) => {
			return response.url().includes('/api/pages/create') && response.request().method() === 'POST';
		});
		await page.getByRole('button', { name: '複製' }).click();
		// 複製が名前の衝突で失敗し、その失敗を表示し終えてから保存する。
		expect((await duplicated).status()).toBe(400);
		await expect(page.getByText('指定されたページURLは既に存在しています')).toBeVisible();
		await page.locator('[data-cy-modal-dialog-ok]').click();

		const update = page.waitForResponse('**/api/pages/update');
		await page.getByRole('button', { name: '保存' }).click();
		const updated = await update;
		expect(updated.ok()).toBe(true);
		const body = updated.request().postDataJSON();
		expect(body.pageId).toBe(original.id);
		expect(body.title).toBe('original');
		expect(body.name).toBe('original');
		const stored = await (
			await page.request.post('/api/pages/show', { data: { i: alice.token, pageId: original.id } })
		).json();
		expect([stored.title, stored.name]).toEqual(['original', 'original']);
	});
});
