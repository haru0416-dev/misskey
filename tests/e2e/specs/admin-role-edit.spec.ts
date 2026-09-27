/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from '../support/fixtures.js';
import { closeInitialUserSetup, login, registerUser, resetState } from '../support/helpers.js';

test.describe('ロールの編集', () => {
	test('保存が終わってからロールのページへ移り、新しい値を表示する', async ({ page }) => {
		await resetState(page);
		const admin = await registerUser(page, 'alice', 'alice1234', true);
		const role = await (
			await page.request.post('/api/admin/roles/create', {
				data: {
					i: admin.token,
					name: 'old role name',
					description: '',
					color: null,
					iconUrl: null,
					target: 'manual',
					condFormula: { id: 'always', type: 'isRemote' },
					isPublic: false,
					isModerator: false,
					isAdministrator: false,
					asBadge: false,
					canEditMembersByModerator: false,
					displayOrder: 0,
					policies: {},
				},
			})
		).json();
		await login(page, 'alice', 'alice1234');
		await closeInitialUserSetup(page);

		await page.route('**/api/admin/roles/update', async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 2000));
			await route.continue();
		});

		await page.goto(`/admin/roles/${role.id}/edit`);
		const name = page.getByRole('textbox', { name: 'ロール名' });
		await name.fill('new role name');
		await page.getByRole('button', { name: '保存' }).click();

		await expect(page).toHaveURL(new RegExp(`/admin/roles/${role.id}$`), { timeout: 10_000 });
		await expect(page.getByText('new role name').first()).toBeVisible({ timeout: 10_000 });
	});
});
