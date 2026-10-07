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
	// 再取得の失敗を通知するまで待ち、認証情報を外す処理も同じ応答に従わせる。
	await page.route('**/api/i', (route) =>
		route.fulfill({
			status,
			contentType: 'application/json',
			body: JSON.stringify({ error: { message: error.code, kind: 'client', ...error } }),
		}),
	);
	const refreshed = page.waitForResponse('**/api/i');
	await page.reload();
	expect((await refreshed).status()).toBe(status);
	const ok = page.locator('[data-cy-modal-dialog-ok]');
	await ok.click({ timeout: 30_000 });
	await expect(ok).toBeHidden();
}

const readSavedAccount = (page: Page) =>
	page.evaluate(() => {
		const account = JSON.parse(window.localStorage.getItem('account') ?? 'null') as {
			id: string;
			token: string;
		} | null;
		return account == null ? null : { id: account.id, token: account.token };
	});
// accounts は端末共通の設定。選択中の世代のグローバルスコープだけを読む。
const isInAccountList = (page: Page, userId: string) =>
	page.evaluate((id) => {
		const generation = window.localStorage.getItem('preferences:active');
		if (generation == null) return false;
		const host = new URL(
			document.querySelector<HTMLMetaElement>('meta[property="instance_url"]')?.content || window.location.href,
		).host;
		const identity = JSON.stringify(['accounts', JSON.stringify([null, null, null]), 0]);
		const record = JSON.parse(window.localStorage.getItem(`preferences:${generation}:record:${identity}`) ?? 'null') as
			| [unknown, [string, { id: string }][], unknown]
			| null;
		return record?.[1].some(([accountHost, user]) => accountHost === host && user.id === id) ?? false;
	}, userId);
let userId = '';
let savedAccount: { id: string; token: string } | null = null;

test.describe('起動時のアカウント再取得の失敗', () => {
	test.beforeEach(async ({ page }) => {
		await resetState(page);
		userId = (await registerUser(page, 'alice', 'alice1234', true)).id;
		await login(page, 'alice', 'alice1234');
		await closeInitialUserSetup(page);
		savedAccount = await readSavedAccount(page);
		expect(savedAccount?.id).toBe(userId);
		expect(savedAccount?.token).toBeTruthy();
		expect(await isInAccountList(page, userId)).toBe(true);
	});

	test('一時的なエラー (回数制限) ではサインアウトしない', async ({ page }) => {
		await reloadWithAccountError(page, 429, {
			code: 'RATE_LIMIT_EXCEEDED',
			id: 'd5826d14-3982-4d2e-8011-b9e9f02499ef',
		});
		expect(await readSavedAccount(page)).toEqual(savedAccount);
		expect(await isInAccountList(page, userId)).toBe(true);
		await expect(page.locator('[data-cy-signin]')).toHaveCount(0);
	});

	test('トークンが失効したと明示されたらサインアウトする', async ({ page }) => {
		await reloadWithAccountError(page, 401, {
			code: 'AUTHENTICATION_FAILED',
			id: 'b0a7f5f8-dc2f-4171-b91f-de88ad238e14',
		});
		await expect(page.locator('[data-cy-signin]')).toBeVisible({ timeout: 30_000 });
		expect(await readSavedAccount(page)).toBeNull();
		expect(await isInAccountList(page, userId)).toBe(false);
	});
});
