/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from '../support/fixtures.js';
import { closeInitialUserSetup, login, registerUser, resetState } from '../support/helpers.js';

// 取得に失敗した画面は、読み込み中のまま止めず再試行できるエラーを出す。
test.describe('取得に失敗した画面', () => {
	test.beforeEach(async ({ page }) => {
		await resetState(page);
		await registerUser(page, 'alice', 'alice1234', true);
		await login(page, 'alice', 'alice1234');
		await closeInitialUserSetup(page);
	});

	const fail = (route: import('@playwright/test').Route) =>
		route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"code":"INTERNAL_ERROR"}}' });

	test('存在しないチャットのメッセージ', async ({ page }) => {
		await page.goto('/chat/messages/0000000000000000');
		await expect(page.getByRole('button', { name: '再試行' })).toBeVisible({ timeout: 15_000 });
	});

	test('ドライブの設定の使用量', async ({ page }) => {
		await page.route('**/api/drive', fail);
		await page.goto('/settings/drive');
		await expect(page.getByRole('button', { name: '再試行' })).toBeVisible({ timeout: 15_000 });
	});

	test('管理画面の概要', async ({ page }) => {
		await page.route('**/api/stats', fail);
		await page.goto('/admin/overview');
		await expect(page.getByRole('button', { name: '再試行' }).first()).toBeVisible({ timeout: 15_000 });
	});

	test('ドライブのファイル情報 (失敗を「空」と出さない)', async ({ page }) => {
		const token = await page.evaluate(() => JSON.parse(localStorage.getItem('account') ?? '{}').token as string);
		const uploaded = await page.request.post('/api/drive/files/create', {
			multipart: { i: token, file: { name: 'info.txt', mimeType: 'text/plain', buffer: Buffer.from('info') } },
		});
		const file = await uploaded.json();
		await page.route('**/api/drive/files/show', fail);
		await page.goto(`/my/drive/file/${file.id}`);
		await expect(page.getByRole('button', { name: '再試行' })).toBeVisible({ timeout: 15_000 });
	});
});
