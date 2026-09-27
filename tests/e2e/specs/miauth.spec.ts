/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from '../support/fixtures.js';
import { closeInitialUserSetup, login, registerUser, resetState } from '../support/helpers.js';

test.describe('MiAuth', () => {
	test.beforeEach(async ({ page }) => {
		await resetState(page);
		await registerUser(page, 'alice', 'alice1234', true);
		await login(page, 'alice', 'alice1234');
		await closeInitialUserSetup(page);
	});

	test('戻り先が使えない URL なら、トークンを発行せずに失敗を表示する', async ({ page }) => {
		let tokenRequests = 0;
		await page.route('**/api/miauth/gen-token', async (route) => {
			tokenRequests++;
			await route.continue();
		});

		const session = crypto.randomUUID();
		await page.goto(
			`/miauth/${session}?name=test&permission=read:account&callback=${encodeURIComponent('javascript:alert(1)')}`,
		);
		await page.getByText('アカウントを選択してください').waitFor();
		// ラジオボタンは見た目の部品に隠れているので、ラベルを押して選ぶ。
		await page.locator('label[for^="account-"]').first().click();
		await page.getByRole('button', { name: '続ける' }).click();
		await page.getByRole('button', { name: '許可' }).click();

		await expect(page.getByText('問題が発生しました')).toBeVisible();
		expect(tokenRequests).toBe(0);
	});
});
