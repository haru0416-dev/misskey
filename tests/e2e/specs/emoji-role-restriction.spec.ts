/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from '../support/fixtures.js';
import { closeInitialUserSetup, login, registerUser, resetState } from '../support/helpers.js';

const PNG_1PX = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
	'base64',
);

test.describe('絵文字の編集', () => {
	test('ロールの一覧を取得できなくても、保存で使えるロールの制限を消さない', async ({ page }) => {
		await resetState(page);
		const admin = await registerUser(page, 'alice', 'alice1234', true);
		const role = await (
			await page.request.post('/api/admin/roles/create', {
				data: {
					i: admin.token,
					name: 'emoji users',
					description: '',
					color: null,
					iconUrl: null,
					target: 'manual',
					condFormula: { id: 'always', type: 'isRemote' },
					isPublic: true,
					isModerator: false,
					isAdministrator: false,
					asBadge: false,
					canEditMembersByModerator: false,
					displayOrder: 0,
					policies: {},
				},
			})
		).json();
		const file = await (
			await page.request.post('/api/drive/files/create', {
				multipart: { i: admin.token, file: { name: 'restricted.png', mimeType: 'image/png', buffer: PNG_1PX } },
			})
		).json();
		const added = await page.request.post('/api/admin/emoji/add', {
			data: { i: admin.token, fileId: file.id, name: 'restricted', roleIdsThatCanBeUsedThisEmojiAsReaction: [role.id] },
		});
		expect(added.ok()).toBe(true);

		await login(page, 'alice', 'alice1234');
		await closeInitialUserSetup(page);

		await page.route('**/api/admin/roles/list', (route) =>
			route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":{}}' }),
		);
		const update = page.waitForRequest('**/api/admin/emoji/update');

		await page.goto('/about#emojis');
		// 分類ごとの一覧は畳まれているので、検索で出す。
		await page.getByPlaceholder('検索').fill('restricted');
		await page.getByRole('button', { name: 'restricted' }).first().click();
		await page.getByRole('menuitem', { name: '編集' }).click();
		await page.getByRole('button', { name: '更新' }).click();

		const body = (await update).postDataJSON();
		expect(body.roleIdsThatCanBeUsedThisEmojiAsReaction).toEqual([role.id]);
	});
});
