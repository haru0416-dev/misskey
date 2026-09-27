/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from '../support/fixtures.js';
import { registerUser, resetState } from '../support/helpers.js';

test.describe('サーバー情報', () => {
	test('サーバー名は HTML としてではなく文字のまま表示する', async ({ page }) => {
		await resetState(page);
		const admin = await registerUser(page, 'alice', 'alice1234', true);
		const updated = await page.request.post('/api/admin/update-meta', {
			data: { i: admin.token, name: '<i>tag</i> & co' },
		});
		expect(updated.ok()).toBe(true);

		await page.goto('/about');
		await expect(page.getByText('<i>tag</i> & coは、オープンソースのプラットフォーム')).toBeVisible();
	});
});
