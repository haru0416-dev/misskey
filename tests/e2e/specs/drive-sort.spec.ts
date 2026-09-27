/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from '../support/fixtures.js';
import { closeInitialUserSetup, login, registerUser, resetState } from '../support/helpers.js';

test.describe('ドライブの並び順', () => {
	test('登録日の昇順で見ているとき、新しく追加したファイルは末尾に出る', async ({ page }) => {
		await resetState(page);
		const alice = await registerUser(page, 'alice', 'alice1234', true);
		const upload = async (name: string) => {
			const res = await page.request.post('/api/drive/files/create', {
				// 同じ内容は既存のファイルとしてまとめられるので、内容を変える。
				multipart: { i: alice.token, name, file: { name, mimeType: 'text/plain', buffer: Buffer.from(name) } },
			});
			expect(res.ok()).toBe(true);
		};
		for (const name of ['first.txt', 'second.txt', 'third.txt']) await upload(name);
		await login(page, 'alice', 'alice1234');
		await closeInitialUserSetup(page);

		await page.goto('/my/drive');
		await page.getByRole('button', { name: 'メニュー' }).click();
		await page.getByRole('menuitem', { name: 'ソート' }).click();
		await page.getByRole('menuitem', { name: '登録日 (昇順)' }).click();
		const files = page.locator('[data-cy-drive-file]');
		await expect(files).toHaveCount(3);
		await expect(files.first()).toHaveAttribute('title', /first\.txt/);

		await upload('fourth.txt');
		await expect(files).toHaveCount(4);
		await expect(files.last()).toHaveAttribute('title', /fourth\.txt/);
	});

	test('URL からのアップロードが失敗したら、受け付けた表示で終わらせず失敗を出す', async ({ page }) => {
		await resetState(page);
		await registerUser(page, 'alice', 'alice1234', true);
		await login(page, 'alice', 'alice1234');
		await closeInitialUserSetup(page);

		await page.goto('/my/drive');
		await page.getByRole('button', { name: 'メニュー' }).click();
		await page.getByRole('menuitem', { name: 'URLから' }).click();
		// 受け付けた後のダウンロードで失敗する宛先 (ループバックは取得が拒否される)。
		await page.getByPlaceholder('アップロードしたいファイルのURL').fill('http://127.0.0.1:9/missing.png');
		await page.locator('[data-cy-modal-dialog-ok]').click();

		await expect(page.getByText('問題が発生しました')).toBeVisible({ timeout: 30_000 });
	});
});
