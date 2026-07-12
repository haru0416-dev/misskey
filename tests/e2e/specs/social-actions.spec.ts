/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from '../support/fixtures';
import {
	closeInitialUserSetup,
	login,
	registerUser,
	resetState,
	type TestUser,
	waitForPageCarryoverGuard,
} from '../support/helpers';
import type { Browser, Page } from '@playwright/test';

const passwords = {
	alice: 'alice1234',
	bob: 'bob1234',
	charlie: 'charlie1234',
};

test.describe('Social actions', () => {
	test.describe.configure({ timeout: 180_000 });

	test.afterEach(async ({ page }) => {
		await waitForPageCarryoverGuard(page);
	});

	test('Bob replies and reacts in the UI, then Alice opens the note from notifications', async ({ page, browser }) => {
		const alice = await setupAlice(page);
		const bob = await registerUser(page, 'bob', passwords.bob);
		const originalText = 'Alice note for Bob actions';
		const replyText = 'Bob replies from the UI';
		const note = await createNote(page, alice.token, originalText);

		const bobPage = await loginAs(browser, bob.username, passwords.bob);
		try {
			await bobPage.goto(`/notes/${note.id}`);
			const originalNote = noteByText(bobPage, originalText);
			await expect(originalNote).toBeVisible();

			await originalNote.locator('button:has(.ti-arrow-back-up)').first().click();
			await bobPage.locator('[data-cy-post-form-text]').fill(replyText);
			const replyCreated = bobPage.waitForResponse(isNoteCreateResponse);
			await bobPage.locator('[data-cy-open-post-form-submit]').click();
			expect((await replyCreated).ok()).toBe(true);

			const reactionCreated = bobPage.waitForResponse((response) => {
				return response.url().includes('/api/notes/reactions/create') && response.request().method() === 'POST';
			});
			await originalNote.locator('button:has(.ti-plus)').first().click();
			await bobPage.locator('input[type="search"]').last().fill('thumbs up');
			await bobPage.getByRole('button', { name: '👍' }).click();
			expect((await reactionCreated).ok()).toBe(true);
		} finally {
			await bobPage
				.context()
				.close()
				.catch(() => undefined);
		}

		const alicePage = await loginAs(browser, alice.username, passwords.alice);
		try {
			await alicePage.goto('/my/notifications');
			await expect(alicePage.getByText(replyText, { exact: true }).first()).toBeVisible();
			const reactionNotificationLink = alicePage
				.locator(`a[href="/notes/${note.id}"]`)
				.filter({ hasText: originalText })
				.first();
			await expect(reactionNotificationLink).toBeVisible();
			await reactionNotificationLink.click();
			await expect(alicePage).toHaveURL(new RegExp(`/notes/${note.id}$`));
			await expect(alicePage.getByText(originalText, { exact: true }).last()).toBeVisible();
		} finally {
			await alicePage
				.context()
				.close()
				.catch(() => undefined);
		}
	});

	test('specified note is visible to Bob but not Charlie', async ({ page, browser }) => {
		const alice = await setupAlice(page);
		const bob = await registerUser(page, 'bob', passwords.bob);
		const charlie = await registerUser(page, 'charlie', passwords.charlie);
		const directText = 'Direct note for Bob only';
		const noteResponse = await page.request.post('/api/notes/create', {
			data: {
				i: alice.token,
				text: directText,
				visibility: 'specified',
				visibleUserIds: [bob.id],
			},
		});
		expect(noteResponse.ok()).toBe(true);
		const body = (await noteResponse.json()) as { createdNote: { id: string } };

		const bobPage = await loginAs(browser, bob.username, passwords.bob);
		try {
			await bobPage.goto(`/notes/${body.createdNote.id}`);
			await expect(bobPage.getByText(directText, { exact: true }).first()).toBeVisible();
		} finally {
			await bobPage
				.context()
				.close()
				.catch(() => undefined);
		}

		const charliePage = await loginAs(browser, charlie.username, passwords.charlie);
		try {
			await charliePage.goto(`/notes/${body.createdNote.id}`);
			await expect(charliePage.getByText(directText, { exact: true })).toHaveCount(0);
		} finally {
			await charliePage
				.context()
				.close()
				.catch(() => undefined);
		}
	});

	test('Bob follows and unfollows Alice in the UI', async ({ page, browser }) => {
		const alice = await setupAlice(page);
		const bob = await registerUser(page, 'bob', passwords.bob);
		const bobPage = await loginAs(browser, bob.username, passwords.bob);
		try {
			await bobPage.goto(`/@${alice.username}`);

			const followButton = bobPage.getByRole('button', { name: 'フォロー' });
			const followed = bobPage.waitForResponse((response) => {
				return response.url().includes('/api/following/create') && response.request().method() === 'POST';
			});
			await followButton.click();
			await bobPage.locator('[data-cy-modal-dialog-ok]').click();
			expect((await followed).ok()).toBe(true);
			await bobPage.reload();
			await expect(bobPage.getByRole('button', { name: 'フォロー中' })).toBeVisible();

			const unfollowed = bobPage.waitForResponse((response) => {
				return response.url().includes('/api/following/delete') && response.request().method() === 'POST';
			});
			await bobPage.getByRole('button', { name: 'フォロー中' }).click();
			await bobPage.locator('[data-cy-modal-dialog-ok]').click();
			expect((await unfollowed).ok()).toBe(true);
			await bobPage.reload();
			await expect(followButton).toBeVisible();
		} finally {
			await bobPage
				.context()
				.close()
				.catch(() => undefined);
		}
	});

	test('Alice attaches a PNG and posts it in the UI', async ({ page, browser }) => {
		const alice = await setupAlice(page);
		const postText = 'PNG attachment from the UI';
		const alicePage = await loginAs(browser, alice.username, passwords.alice);

		try {
			await alicePage.locator('[data-cy-open-post-form]').click();
			await alicePage.locator('[data-cy-post-form-text]').fill(postText);
			const fileChooserPromise = alicePage.waitForEvent('filechooser');
			await alicePage.locator('button:has(.ti-photo-plus)').click();
			const fileChooser = await fileChooserPromise;
			await fileChooser.setFiles('packages/backend/test/resources/hw.png');
			await expect(alicePage.getByText(/hw\.png/)).toBeVisible();

			const noteCreated = alicePage.waitForResponse(isNoteCreateResponse);
			await alicePage.locator('[data-cy-open-post-form-submit]').click();
			const noteResponse = await noteCreated;
			expect(noteResponse.ok()).toBe(true);
			const body = (await noteResponse.json()) as { createdNote: { id: string; files: { name: string }[] } };
			expect(body.createdNote.files).toHaveLength(1);

			await alicePage.goto(`/notes/${body.createdNote.id}`);
			await expect(alicePage.locator('[title*="hw.png"]').first()).toBeVisible();
		} finally {
			await alicePage
				.context()
				.close()
				.catch(() => undefined);
		}
	});
});

async function setupAlice(page: Page): Promise<TestUser> {
	await resetState(page);
	await registerUser(page, 'admin', 'pass', true);
	return registerUser(page, 'alice', passwords.alice);
}

async function loginAs(browser: Browser, username: string, password: string): Promise<Page> {
	const context = await browser.newContext({ locale: 'ja-JP' });
	let ready = false;
	try {
		await context.addInitScript(() => {
			window.localStorage.setItem('__MISSKEY_E2E_TEST__', 'true');
		});
		const page = await context.newPage();
		await login(page, username, password);
		await closeInitialUserSetup(page);
		await expect(page.locator('[data-cy-user-setup]')).toBeHidden();
		ready = true;
		return page;
	} finally {
		if (!ready) {
			await context.close().catch(() => undefined);
		}
	}
}

async function createNote(page: Page, token: string, text: string): Promise<{ id: string }> {
	const response = await page.request.post('/api/notes/create', {
		data: { i: token, text },
	});
	expect(response.ok()).toBe(true);
	const body = (await response.json()) as { createdNote: { id: string } };
	return body.createdNote;
}

function noteByText(page: Page, text: string) {
	return page.locator('div[tabindex="0"]', { has: page.getByText(text, { exact: true }) }).first();
}

function isNoteCreateResponse(response: { url(): string; request(): { method(): string } }): boolean {
	return response.url().includes('/api/notes/create') && response.request().method() === 'POST';
}
