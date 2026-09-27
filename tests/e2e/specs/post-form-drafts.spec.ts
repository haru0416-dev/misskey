/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.js';
import { closeInitialUserSetup, login, registerUser, resetState } from '../support/helpers.js';

async function restoreDraft(page: Page, text: string) {
	await page.locator('[data-cy-post-form-account]').click();
	await page.getByRole('menuitem', { name: '下書き一覧' }).click();
	const draft = page.locator('[data-cy-note-draft]').filter({ hasText: text });
	await draft.getByRole('button', { name: '復元' }).click();
}

test.describe('投稿フォームの下書き', () => {
	test('続けて復元しても、前の下書きの宛先が後から混ざらない', async ({ page }) => {
		await resetState(page);
		const alice = await registerUser(page, 'alice', 'alice1234', true);
		const bob = await registerUser(page, 'bob', 'bob12345');
		const carol = await registerUser(page, 'carol', 'carol1234');
		for (const [text, recipient] of [
			['draft to bob', bob],
			['draft to carol', carol],
		] as const) {
			const created = await page.request.post('/api/notes/drafts/create', {
				data: { i: alice.token, text, visibility: 'specified', visibleUserIds: [recipient.id] },
			});
			expect(created.ok()).toBe(true);
		}
		await login(page, 'alice', 'alice1234');
		await closeInitialUserSetup(page);

		// bob の下書きの宛先の取得だけを遅らせ、carol の下書きを復元した後に届くようにする。
		await page.route('**/api/users/show', async (route) => {
			if ((route.request().postData() ?? '').includes(bob.id)) {
				await new Promise((resolve) => setTimeout(resolve, 3000));
			}
			await route.continue();
		});

		await page.locator('[data-cy-open-post-form]').first().click();
		await restoreDraft(page, 'draft to bob');
		await restoreDraft(page, 'draft to carol');
		await expect(page.locator('[data-cy-post-form-text]')).toHaveValue('draft to carol');

		const recipients = page
			.locator('[data-cy-post-form-text]')
			.locator('xpath=ancestor::*[.//button[@data-cy-post-form-account]][1]');
		await expect(recipients.getByText('@carol')).toBeVisible();
		await page.waitForTimeout(4000);
		await expect(recipients.getByText('@bob')).toHaveCount(0);
	});
});
