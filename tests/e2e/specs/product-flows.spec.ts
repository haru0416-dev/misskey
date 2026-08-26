/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { devices, type Browser, type Page } from '@playwright/test';
import { expect, test } from '../support/fixtures';
import {
	closeInitialUserSetup,
	login,
	registerUser,
	resetState,
	seedE2eLocalStorage,
	type TestUser,
	waitForPageCarryoverGuard,
} from '../support/helpers';

const passwords = {
	alice: 'alice1234',
	bob: 'bob1234',
};

test.describe('Product flows', () => {
	test.describe.configure({ timeout: 180_000 });

	test.afterEach(async ({ page }) => {
		await waitForPageCarryoverGuard(page);
	});

	test('Alice and Bob exchange 1:1 chat messages', async ({ page, browser }) => {
		const { alice } = await setupUsers(page);
		const bob = await registerUser(page, 'bob', passwords.bob);
		await follow(page, alice.token, bob.id);
		await follow(page, bob.token, alice.id);
		const aliceMessage = `Hello Bob ${Date.now()}`;
		const bobMessage = `Hello Alice ${Date.now()}`;
		const [alicePage, bobPage] = await Promise.all([
			loginAs(browser, alice.username, passwords.alice),
			loginAs(browser, bob.username, passwords.bob),
		]);

		try {
			await Promise.all([alicePage.goto(`/chat/user/${bob.id}`), bobPage.goto(`/chat/user/${alice.id}`)]);
			await expect(alicePage.getByPlaceholder('ここにメッセージを入力')).toBeVisible();
			await expect(bobPage.getByPlaceholder('ここにメッセージを入力')).toBeVisible();

			await sendChatMessage(alicePage, aliceMessage);
			await expect(bobPage.getByText(aliceMessage, { exact: true })).toBeVisible();

			await sendChatMessage(bobPage, bobMessage);
			await expect(alicePage.getByText(bobMessage, { exact: true })).toBeVisible();
		} finally {
			await alicePage
				.context()
				.close()
				.catch(() => undefined);
			await bobPage
				.context()
				.close()
				.catch(() => undefined);
		}
	});

	test('profile name and description save and persist', async ({ page, browser }) => {
		const { alice } = await setupUsers(page);
		const displayName = `Alice E2E ${Date.now()}`;
		const description = `Persistent profile description ${Date.now()}`;
		const alicePage = await loginAs(browser, alice.username, passwords.alice);

		try {
			await alicePage.goto('/settings/profile');
			let nameInput = alicePage.getByRole('textbox', { name: '名前', exact: true });
			let descriptionInput = alicePage.getByRole('textbox', { name: '自己紹介', exact: true });
			await expect(nameInput).toBeVisible();
			await expect(descriptionInput).toBeVisible();

			await nameInput.fill(displayName);
			await saveProfileField(alicePage, nameInput);
			await alicePage.reload();
			nameInput = alicePage.getByRole('textbox', { name: '名前', exact: true });
			descriptionInput = alicePage.getByRole('textbox', { name: '自己紹介', exact: true });
			await expect(nameInput).toHaveValue(displayName);

			await descriptionInput.fill(description);
			await expect(descriptionInput).toHaveValue(description);
			await saveProfileField(alicePage, descriptionInput);

			await alicePage.reload();
			await expect(nameInput).toHaveValue(displayName);
			await expect(descriptionInput).toHaveValue(description);

			await alicePage.goto(`/@${alice.username}`);
			await expect(alicePage.getByText(displayName, { exact: true }).first()).toBeVisible();
			await expect(alicePage.getByText(description, { exact: true })).toBeVisible();
		} finally {
			await alicePage
				.context()
				.close()
				.catch(() => undefined);
		}
	});

	test('searches for a unique note and opens it', async ({ page, browser }) => {
		const { admin, alice } = await setupUsers(page);
		const noteText = `unique-search-note-${Date.now()}`;
		const note = await createNote(page, alice.token, noteText);
		await grantNoteSearch(page, admin.token, alice.id);
		const alicePage = await loginAs(browser, alice.username, passwords.alice);

		try {
			await alicePage.goto('/search');
			const searchInput = alicePage.locator('input[type="search"]').first();
			await expect(searchInput).toBeVisible();
			await searchInput.fill(noteText);

			const searchResponse = alicePage.waitForResponse((response) => {
				return response.url().includes('/api/notes/search') && response.request().method() === 'POST';
			});
			await alicePage.getByRole('button', { name: '検索', exact: true }).click();
			expect((await searchResponse).ok()).toBe(true);

			const result = alicePage.locator(`[data-scroll-anchor="${note.id}"]`);
			await expect(result.getByText(noteText, { exact: true })).toBeVisible();
			await result.locator(`a[href="/notes/${note.id}"]`).click();
			await expect(alicePage).toHaveURL(new RegExp(`/notes/${note.id}$`));
			await expect(alicePage.getByText(noteText, { exact: true }).last()).toBeVisible();
		} finally {
			await alicePage
				.context()
				.close()
				.catch(() => undefined);
		}
	});
});

test.describe('Mobile Chromium smoke', () => {
	test.describe.configure({ timeout: 120_000 });
	test.use({
		viewport: devices['Pixel 5'].viewport,
		userAgent: devices['Pixel 5'].userAgent,
		deviceScaleFactor: devices['Pixel 5'].deviceScaleFactor,
		isMobile: devices['Pixel 5'].isMobile,
		hasTouch: devices['Pixel 5'].hasTouch,
	});

	test.afterEach(async ({ page }) => {
		await waitForPageCarryoverGuard(page);
	});

	test('logs in, opens the composer, and posts', async ({ page }) => {
		await resetState(page);
		await registerUser(page, 'admin', 'pass', true);
		await registerUser(page, 'alice', passwords.alice);
		await login(page, 'alice', passwords.alice);
		await closeInitialUserSetup(page);

		const noteText = `mobile-chromium-note-${Date.now()}`;
		const openComposer = page.locator('button:has(.ti-pencil)').last();
		await expect(openComposer).toBeVisible();
		await openComposer.click();
		await expect(page.locator('[data-cy-post-form-text]')).toBeVisible();
		await page.locator('[data-cy-post-form-text]').fill(noteText);

		const noteCreated = page.waitForResponse(isNoteCreateResponse);
		await page.locator('[data-cy-open-post-form-submit]').click();
		const noteResponse = await noteCreated;
		expect(noteResponse.ok()).toBe(true);
		const body = (await noteResponse.json()) as { createdNote: { id: string } };

		await page.goto(`/notes/${body.createdNote.id}`);
		await expect(page.getByText(noteText, { exact: true }).last()).toBeVisible();
	});
});

async function setupUsers(page: Page): Promise<{ admin: TestUser; alice: TestUser }> {
	await resetState(page);
	const admin = await registerUser(page, 'admin', 'pass', true);
	const alice = await registerUser(page, 'alice', passwords.alice);
	return { admin, alice };
}

async function loginAs(browser: Browser, username: string, password: string): Promise<Page> {
	const context = await browser.newContext({ locale: 'ja-JP' });
	try {
		await context.addInitScript(seedE2eLocalStorage);
		const page = await context.newPage();
		await login(page, username, password);
		await closeInitialUserSetup(page);
		await expect(page.locator('[data-cy-user-setup]')).toBeHidden();
		return page;
	} catch (error) {
		await context.close().catch(() => undefined);
		throw error;
	}
}

async function sendChatMessage(page: Page, text: string): Promise<void> {
	await page.getByPlaceholder('ここにメッセージを入力').fill(text);
	const messageCreated = page.waitForResponse((response) => {
		return response.url().includes('/api/chat/messages/create-to-user') && response.request().method() === 'POST';
	});
	await page.locator('button[title="送信"]').click();
	expect((await messageCreated).ok()).toBe(true);
	await expect(page.getByText(text, { exact: true })).toBeVisible();
}

async function saveProfileField(page: Page, field: ReturnType<Page['getByRole']>): Promise<void> {
	const saveButton = field
		.locator('..')
		.locator('..')
		.getByRole('button', { name: /保存/ });
	await expect(saveButton).toBeVisible();
	const update = page.waitForResponse((response) => {
		return response.url().includes('/api/i/update') && response.request().method() === 'POST';
	});
	await saveButton.click();
	expect((await update).ok()).toBe(true);
	await expect(saveButton).toBeHidden();
}

async function follow(page: Page, token: string, userId: string): Promise<void> {
	const response = await page.request.post('/api/following/create', {
		data: { i: token, userId },
	});
	expect(response.ok()).toBe(true);
}

async function grantNoteSearch(page: Page, adminToken: string, userId: string): Promise<void> {
	const roleResponse = await page.request.post('/api/admin/roles/create', {
		data: {
			i: adminToken,
			name: 'E2E note search',
			description: '',
			color: null,
			iconUrl: null,
			target: 'manual',
			condFormula: { id: 'e2e-note-search', type: 'isRemote' },
			isPublic: false,
			isModerator: false,
			isAdministrator: false,
			asBadge: false,
			canEditMembersByModerator: false,
			displayOrder: 0,
			policies: {
				canSearchNotes: { priority: 1, useDefault: false, value: true },
			},
		},
	});
	expect(roleResponse.ok()).toBe(true);
	const role = (await roleResponse.json()) as { id: string };
	const assignResponse = await page.request.post('/api/admin/roles/assign', {
		data: { i: adminToken, roleId: role.id, userId },
	});
	expect(assignResponse.ok()).toBe(true);
}

async function createNote(page: Page, token: string, text: string): Promise<{ id: string }> {
	const response = await page.request.post('/api/notes/create', {
		data: { i: token, text },
	});
	expect(response.ok()).toBe(true);
	const body = (await response.json()) as { createdNote: { id: string } };
	return body.createdNote;
}

function isNoteCreateResponse(response: { url(): string; request(): { method(): string } }): boolean {
	return response.url().includes('/api/notes/create') && response.request().method() === 'POST';
}
