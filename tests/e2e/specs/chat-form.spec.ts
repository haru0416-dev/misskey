/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from '../support/fixtures.js';
import { closeInitialUserSetup, login, registerUser, resetState } from '../support/helpers.js';
import type { TestUser } from '../support/helpers.js';

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';

let bob: TestUser;

test.describe('チャットの入力欄', () => {
	test.beforeEach(async ({ page }) => {
		await resetState(page);
		const alice = await registerUser(page, 'alice', 'alice1234', true);
		bob = await registerUser(page, 'bob', 'bob12345');
		// デフォルトのチャットの相手は相互フォローに限られる。
		await page.request.post('/api/following/create', { data: { i: alice.token, userId: bob.id } });
		await page.request.post('/api/following/create', { data: { i: bob.token, userId: alice.id } });
		await login(page, 'alice', 'alice1234');
		await closeInitialUserSetup(page);
	});

	test('送信中に送信キーを続けて押しても、1 回だけ送る', async ({ page }) => {
		let sent = 0;
		await page.route('**/api/chat/messages/create-to-user', async (route) => {
			sent++;
			await new Promise((resolve) => setTimeout(resolve, 1000));
			await route.continue();
		});

		await page.goto(`/chat/user/${bob.id}`);
		const input = page.getByRole('textbox', { name: 'ここにメッセージを入力' });
		await input.fill('hello');
		// デフォルトでは Enter は改行で、Ctrl+Enter で送る。
		await input.press('Control+Enter');
		await input.press('Control+Enter');
		await input.press('Control+Enter');
		await expect(input).toHaveValue('', { timeout: 10_000 });
		expect(sent).toBe(1);
	});

	test('ファイルをドロップすると、アップロードして添付する', async ({ page }) => {
		await page.goto(`/chat/user/${bob.id}`);
		await page.getByRole('textbox', { name: 'ここにメッセージを入力' }).waitFor();
		await page.locator('[data-cy-chat-form]').evaluate((element, base64) => {
			const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
			const dataTransfer = new DataTransfer();
			dataTransfer.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }));
			element.dispatchEvent(new DragEvent('drop', { dataTransfer, bubbles: true, cancelable: true }));
		}, PNG_1PX);
		await page.getByRole('button', { name: 'アップロード' }).click();

		await expect(page.getByRole('button', { name: /^dropped.*（削除）$/ })).toBeVisible({ timeout: 15_000 });
	});

	test('相手の取得に失敗したら、読み込み中のままにせず再試行できるエラーを出す', async ({ page }) => {
		await page.route('**/api/users/show', (route) =>
			route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{"code":"INTERNAL_ERROR"}}' }),
		);
		await page.goto(`/chat/user/${bob.id}`);
		await expect(page.getByRole('button', { name: '再試行' })).toBeVisible({ timeout: 15_000 });
	});
});
