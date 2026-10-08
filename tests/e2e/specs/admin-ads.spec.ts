/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from '../support/fixtures.js';
import { closeInitialUserSetup, login, registerUser, resetState } from '../support/helpers.js';

test.describe('広告の管理', () => {
	test('新しい広告の保存を続けて押しても、作成は 1 回だけ送る', async ({ page }) => {
		await resetState(page);
		const alice = await registerUser(page, 'alice', 'alice1234', true);
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
		// URL と画像 URL は必須。空のままだと作成は検証で失敗し、成功した作成の回数を数えられない。
		await page.locator('input[type="url"]').nth(0).fill('https://example.com/');
		await page.locator('input[type="url"]').nth(1).fill('https://example.com/ad.png');
		const save = page.getByRole('button', { name: '保存' }).first();
		await save.click();
		// 最初の作成が止まっている間に押す。二重に送る実装なら、この時点で要求が出る。
		await save.click({ force: true });
		await save.click({ force: true });
		// 最初の作成の完了 (保存の通知) まで待ってから数え、保存されたのが 1 件であることも確かめる。
		await expect(page.getByText('保存しました')).toBeVisible();
		expect(created).toBe(1);
		const listed = await page.request.post('/api/admin/ad/list', { data: { i: alice.token } });
		expect(listed.ok()).toBe(true);
		expect(await listed.json()).toHaveLength(1);
	});

	test('必須項目が空のまま保存すると、失敗の理由を表示する', async ({ page }) => {
		await resetState(page);
		await registerUser(page, 'alice', 'alice1234', true);
		await login(page, 'alice', 'alice1234');
		await closeInitialUserSetup(page);

		await page.goto('/admin/ads');
		await page.getByRole('button', { name: '追加' }).first().click();
		const created = page.waitForResponse('**/api/admin/ad/create');
		await page.getByRole('button', { name: '保存' }).first().click();
		expect((await created).status()).toBe(400);
		const dialog = page.getByRole('alertdialog');
		await expect(dialog).toContainText('パラメータエラー');
		await expect(dialog).toContainText('リクエストパラメータに問題があります');
	});
});
