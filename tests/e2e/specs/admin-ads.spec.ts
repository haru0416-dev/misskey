/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from '../support/fixtures.js';
import { closeInitialUserSetup, login, registerUser, resetState } from '../support/helpers.js';

test.describe('広告の管理', () => {
	test('新しい広告の保存を続けて押しても、作成は 1 回だけ送る', async ({ page }) => {
		await resetState(page);
		await registerUser(page, 'alice', 'alice1234', true);
		await login(page, 'alice', 'alice1234');
		await closeInitialUserSetup(page);

		let created = 0;
		await page.route('**/api/admin/ad/create', async (route) => {
			created++;
			await new Promise((resolve) => setTimeout(resolve, 1000));
			await route.continue();
		});

		await page.goto('/admin/ads');
		await page.getByRole('button', { name: '追加' }).first().click();
		const save = page.getByRole('button', { name: '保存' }).first();
		await save.click();
		await save.click({ force: true });
		await save.click({ force: true });
		await page.waitForTimeout(2500);
		expect(created).toBe(1);
	});
});
