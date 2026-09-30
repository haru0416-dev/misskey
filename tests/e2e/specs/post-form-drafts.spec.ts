/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.js';
import { closeInitialUserSetup, login, registerUser, resetState } from '../support/helpers.js';
import type { TestUser } from '../support/helpers.js';

async function switchAccount(page: Page, user: TestUser, firstUse = false) {
	const response = await page.request.post('/api/i', { data: { i: user.token } });
	expect(response.ok()).toBe(true);
	const me = (await response.json()) as Record<string, unknown>;
	await page.evaluate((account) => window.localStorage.setItem('account', JSON.stringify(account)), {
		...me,
		token: user.token,
	});
	await page.reload();
	if (firstUse) await closeInitialUserSetup(page);
}

async function openTargetComposer(page: Page, kind: 'reply' | 'quote') {
	if (kind === 'reply') {
		await page.locator('button:has(.ti-arrow-back-up)').first().click();
	} else {
		await page.locator('button:has(.ti-repeat)').first().click();
		await page.getByRole('menuitem', { name: '引用', exact: true }).click();
	}
	await expect(page.locator('[data-cy-post-form-text]')).toBeVisible();
	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
			}),
	);
}

async function closeLocalComposer(page: Page) {
	await page.locator('[data-cy-post-form-text]').press('Escape');
	await expect(page.locator('[data-cy-post-form-text]')).toBeHidden();
}

async function writeLocalComposer(page: Page, text: string) {
	await page.locator('[data-cy-post-form-text]').fill(text);
	await expect
		.poll(() =>
			page.evaluate((value) => {
				const drafts = JSON.parse(window.localStorage.getItem('drafts') ?? '{}') as Record<
					string,
					{ data?: { text?: string } }
				>;
				return Object.values(drafts).some((draft) => draft.data?.text === value);
			}, text),
		)
		.toBe(true);
}

async function restoreDraft(page: Page, text: string) {
	await page.locator('[data-cy-post-form-account]').click();
	await page.getByRole('menuitem', { name: '下書き一覧' }).click();
	const draft = page.locator('[data-cy-note-draft]').filter({ hasText: text });
	await draft.getByRole('button', { name: '復元' }).click();
}

test.describe('投稿フォームの下書き', () => {
	test('続けて復元しても、前の下書きの宛先が後から混ざらない', async ({ page }) => {
		await resetState(page);
		const alice = await registerUser(page, 'alice', 'alice1234', true);
		const bob = await registerUser(page, 'bob', 'bob12345');
		const carol = await registerUser(page, 'carol', 'carol1234');
		for (const [text, recipient] of [
			['draft to bob', bob],
			['draft to carol', carol],
		] as const) {
			const created = await page.request.post('/api/notes/drafts/create', {
				data: { i: alice.token, text, visibility: 'specified', visibleUserIds: [recipient.id] },
			});
			expect(created.ok()).toBe(true);
		}
		await login(page, 'alice', 'alice1234');
		await closeInitialUserSetup(page);

		// bob の下書きの宛先の取得だけを遅らせ、carol の下書きを復元した後に届くようにする。
		await page.route('**/api/users/show', async (route) => {
			if ((route.request().postData() ?? '').includes(bob.id)) {
				await new Promise((resolve) => setTimeout(resolve, 3000));
			}
			await route.continue();
		});

		await page.locator('[data-cy-open-post-form]').first().click();
		await restoreDraft(page, 'draft to bob');
		await restoreDraft(page, 'draft to carol');
		await expect(page.locator('[data-cy-post-form-text]')).toHaveValue('draft to carol');

		const recipients = page
			.locator('[data-cy-post-form-text]')
			.locator('xpath=ancestor::*[.//button[@data-cy-post-form-account]][1]');
		await expect(recipients.getByText('@carol')).toBeVisible();
		await page.waitForTimeout(4000);
		await expect(recipients.getByText('@bob')).toHaveCount(0);
	});

	for (const kind of ['reply', 'quote'] as const) {
		test(`同じノートへの${kind === 'reply' ? '返信' : '引用'}下書きをアカウント間で復元・上書き・削除しない`, async ({
			page,
		}) => {
			await resetState(page);
			const alice = await registerUser(page, 'alice', 'alice1234', true);
			const bob = await registerUser(page, 'bob', 'bob12345');
			const carol = await registerUser(page, 'carol', 'carol1234');
			const created = await page.request.post('/api/notes/create', {
				data: { i: carol.token, text: 'shared local draft target' },
			});
			expect(created.ok()).toBe(true);
			const { createdNote } = (await created.json()) as { createdNote: { id: string } };
			await login(page, 'alice', 'alice1234');
			await closeInitialUserSetup(page);
			await page.goto(`/notes/${createdNote.id}`);

			const aliceText = `alice ${kind} draft`;
			const bobText = `bob ${kind} draft`;
			await openTargetComposer(page, kind);
			await writeLocalComposer(page, aliceText);
			await closeLocalComposer(page);

			// 同じ端末ストレージを保ったままログイン主体だけを切り替える。
			await switchAccount(page, bob, true);
			await openTargetComposer(page, kind);
			await expect(page.locator('[data-cy-post-form-text]')).not.toHaveValue(aliceText);
			await writeLocalComposer(page, bobText);
			await closeLocalComposer(page);

			await switchAccount(page, alice);
			await openTargetComposer(page, kind);
			await expect(page.locator('[data-cy-post-form-text]')).toHaveValue(aliceText);
			await closeLocalComposer(page);

			await switchAccount(page, bob);
			await openTargetComposer(page, kind);
			await expect(page.locator('[data-cy-post-form-text]')).toHaveValue(bobText);
			const posted = page.waitForResponse(
				(response) => response.url().includes('/api/notes/create') && response.request().method() === 'POST',
			);
			await page.locator('[data-cy-open-post-form-submit]').click();
			expect((await posted).ok()).toBe(true);
			await expect(page.locator('[data-cy-post-form-text]')).toBeHidden();

			await openTargetComposer(page, kind);
			await expect(page.locator('[data-cy-post-form-text]')).not.toHaveValue(bobText);
			await closeLocalComposer(page);
			await switchAccount(page, alice);
			await openTargetComposer(page, kind);
			await expect(page.locator('[data-cy-post-form-text]')).toHaveValue(aliceText);
		});
	}
});
