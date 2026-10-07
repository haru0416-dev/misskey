/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Page, Route } from '@playwright/test';
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
}

async function closeLocalComposer(page: Page) {
	await page.locator('[data-cy-post-form-text]').press('Escape');
	await expect(page.locator('[data-cy-post-form-text]')).toBeHidden();
}

type LocalDraftTarget = { accountId: string; kind: 'reply' | 'quote'; noteId: string };

async function readLocalDraftText(page: Page, target: LocalDraftTarget) {
	return page.evaluate(({ accountId, kind, noteId }) => {
		const scope = JSON.stringify([accountId, null, kind === 'quote' ? 'renote' : 'reply', noteId]);
		let latest: { key: string; stamp: number; draft: { data?: { text?: string } } | null } | undefined;
		// 削除版も含めて同じ所有者・投稿先の最新を選ぶ。古い本文の存在だけでは保存成功としない。
		for (const key of Object.keys(window.localStorage)) {
			if (!key.startsWith('miux:local-draft:')) continue;
			const version = JSON.parse(window.localStorage.getItem(key) ?? 'null') as {
				scope: string;
				stamp: number;
				draft: { data?: { text?: string } } | null;
			} | null;
			if (version?.scope !== scope || !Number.isSafeInteger(version.stamp) || version.stamp < 0) continue;
			if (version.draft !== null && (typeof version.draft !== 'object' || Array.isArray(version.draft))) continue;
			if (!latest || version.stamp > latest.stamp || (version.stamp === latest.stamp && key > latest.key)) {
				latest = { key, stamp: version.stamp, draft: version.draft };
			}
		}
		// 未保存と削除を区別し、投稿後は削除版が確定したことを確認できるようにする。
		return latest?.draft === null ? null : latest?.draft?.data?.text;
	}, target);
}

async function writeLocalComposer(page: Page, target: LocalDraftTarget, text: string) {
	await page.locator('[data-cy-post-form-text]').fill(text);
	await expect.poll(() => readLocalDraftText(page, target)).toBe(text);
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

		// bob の宛先応答は carol の復元が画面に反映するまで止め、完了を待ってから混入を確認する。
		const delayedBob = Promise.withResolvers<Route>();
		await page.route('**/api/users/show', async (route) => {
			const body = route.request().postDataJSON() as { userIds?: string[] };
			if (body.userIds?.includes(bob.id)) {
				delayedBob.resolve(route);
			} else {
				await route.continue();
			}
		});

		await page.locator('[data-cy-open-post-form]').first().click();
		await restoreDraft(page, 'draft to bob');
		const delayedRoute = await delayedBob.promise;
		await restoreDraft(page, 'draft to carol');
		await expect(page.locator('[data-cy-post-form-text]')).toHaveValue('draft to carol');

		const recipients = page
			.locator('[data-cy-post-form-text]')
			.locator('xpath=ancestor::*[.//button[@data-cy-post-form-account]][1]');
		await expect(recipients.getByText('@carol')).toBeVisible();
		const bobResponded = page.waitForResponse((response) => response.request() === delayedRoute.request());
		await delayedRoute.continue();
		const response = await bobResponded;
		expect(response.ok()).toBe(true);
		expect(await response.finished()).toBeNull();
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
			const aliceTarget: LocalDraftTarget = { accountId: alice.id, kind, noteId: createdNote.id };
			const bobTarget: LocalDraftTarget = { accountId: bob.id, kind, noteId: createdNote.id };
			await openTargetComposer(page, kind);
			await writeLocalComposer(page, aliceTarget, aliceText);
			await closeLocalComposer(page);

			// 同じ端末ストレージを保ったままログイン主体だけを切り替える。
			await switchAccount(page, bob, true);
			await openTargetComposer(page, kind);
			await expect(page.locator('[data-cy-post-form-text]')).not.toHaveValue(aliceText);
			await writeLocalComposer(page, bobTarget, bobText);
			expect(await readLocalDraftText(page, aliceTarget)).toBe(aliceText);
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
			await expect.poll(() => readLocalDraftText(page, bobTarget)).toBeNull();
			expect(await readLocalDraftText(page, aliceTarget)).toBe(aliceText);

			await openTargetComposer(page, kind);
			await expect(page.locator('[data-cy-post-form-text]')).not.toHaveValue(bobText);
			expect(await readLocalDraftText(page, bobTarget)).toBeNull();
			await closeLocalComposer(page);
			await switchAccount(page, alice);
			await openTargetComposer(page, kind);
			await expect(page.locator('[data-cy-post-form-text]')).toHaveValue(aliceText);
		});
	}
});
