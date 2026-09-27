/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.js';
import { closeInitialUserSetup, login, registerUser, resetState } from '../support/helpers.js';

// 起動時のアカウント情報の再取得 (/api/i) が失敗したとき、保存済みの認証情報を消すのは
// アカウントがもう使えないと応答が明示した場合 (凍結・削除・トークン失効) だけにする。
async function reloadWithAccountError(page: Page, status: number, error: { code: string; id: string }) {
	// 失敗したアカウントを外したあと残りのトークンでログインし直す経路があるので、差し替えは最後まで外さない。
	await page.route('**/api/i', (route) =>
		route.fulfill({
			status,
			contentType: 'application/json',
			body: JSON.stringify({ error: { message: error.code, kind: 'client', ...error } }),
		}),
	);
	await page.reload();
	// 通知はログインし直しのたびにも出るので、出なくなるまで閉じる。
	const ok = page.locator('[data-cy-modal-dialog-ok]');
	await ok.first().click({ timeout: 30_000 });
	for (;;) {
		try {
			await ok.first().click({ timeout: 5_000 });
		} catch {
			break;
		}
	}
}

const hasSavedAccount = (page: Page) => page.evaluate(() => window.localStorage.getItem('account') != null);
// アカウント切り替えの一覧 (preferences の accounts) に残っているか。
const isInAccountList = (page: Page, userId: string) =>
	page.evaluate(
		(id) =>
			JSON.stringify(
				JSON.parse(window.localStorage.getItem('preferences') ?? '{}').preferences?.accounts ?? [],
			).includes(id),
		userId,
	);
let userId = '';

test.describe('起動時のアカウント再取得の失敗', () => {
	test.beforeEach(async ({ page }) => {
		await resetState(page);
		userId = (await registerUser(page, 'alice', 'alice1234', true)).id;
		await login(page, 'alice', 'alice1234');
		await closeInitialUserSetup(page);
		expect(await hasSavedAccount(page)).toBe(true);
	});

	test('一時的なエラー (回数制限) ではサインアウトしない', async ({ page }) => {
		await reloadWithAccountError(page, 429, {
			code: 'RATE_LIMIT_EXCEEDED',
			id: 'd5826d14-3982-4d2e-8011-b9e9f02499ef',
		});
		expect(await hasSavedAccount(page)).toBe(true);
		expect(await isInAccountList(page, userId)).toBe(true);
		await expect(page.locator('[data-cy-signin]')).toHaveCount(0);
	});

	test('トークンが失効したと明示されたらサインアウトする', async ({ page }) => {
		await reloadWithAccountError(page, 401, {
			code: 'AUTHENTICATION_FAILED',
			id: 'b0a7f5f8-dc2f-4171-b91f-de88ad238e14',
		});
		await expect(page.locator('[data-cy-signin]')).toBeVisible({ timeout: 30_000 });
		expect(await hasSavedAccount(page)).toBe(false);
	});
});
