/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test, expect } from '../support/fixtures';
import {
	closeInitialUserSetup,
	login,
	registerUser,
	resetState,
	type TestUser,
	visitHome,
	waitForPageCarryoverGuard,
} from '../support/helpers';

test.describe('Before setup instance', () => {
	test.beforeEach(async ({ page }) => {
		await resetState(page);
	});

	test.afterEach(async ({ page }) => {
		await waitForPageCarryoverGuard(page);
	});

	test('successfully loads', async ({ page }) => {
		await visitHome(page);
	});

	test('setup instance', async ({ page }) => {
		await visitHome(page);

		await page
			.locator('[data-cy-admin-initial-password] input')
			.fill('example_password_please_change_this_or_you_will_get_hacked');
		await page.locator('[data-cy-admin-username] input').fill('admin');
		await page.locator('[data-cy-admin-password] input').fill('admin1234');

		const signup = page.waitForResponse(
			(response) => response.url().includes('/api/admin/accounts/create') && response.request().method() === 'POST',
		);
		await page.locator('[data-cy-admin-ok]').click();
		await signup;

		const updateMeta = page.waitForResponse(
			(response) => response.url().includes('/api/admin/update-meta') && response.request().method() === 'POST',
		);
		await page.locator('[data-cy-next]').click();
		await page.locator('[data-cy-server-name] input').fill('Testskey');
		await page.locator('[data-cy-server-setup-wizard-apply]').click();
		await updateMeta;
	});
});

test.describe('After setup instance', () => {
	test.beforeEach(async ({ page }) => {
		await resetState(page);
		await registerUser(page, 'admin', 'pass', true);
	});

	test.afterEach(async ({ page }) => {
		await waitForPageCarryoverGuard(page);
	});

	test('successfully loads', async ({ page }) => {
		await visitHome(page);
	});

	test('signup', async ({ page }) => {
		await visitHome(page);

		await page.locator('[data-cy-signup]').click();
		await expect(page.locator('[data-cy-signup-rules-continue]')).toBeDisabled();
		await page.locator('[data-cy-signup-rules-notes-agree] [data-cy-switch-toggle]').click();
		await page.locator('[data-cy-modal-dialog-ok]').click();
		await expect(page.locator('[data-cy-signup-rules-continue]')).toBeEnabled();
		await page.locator('[data-cy-signup-rules-continue]').click();

		await expect(page.locator('[data-cy-signup-submit]')).toBeDisabled();
		await page.locator('[data-cy-signup-username] input').fill('alice');
		await expect(page.locator('[data-cy-signup-submit]')).toBeDisabled();
		await page.locator('[data-cy-signup-password] input').fill('alice1234');
		await expect(page.locator('[data-cy-signup-submit]')).toBeDisabled();
		await page.locator('[data-cy-signup-password-retype] input').fill('alice1234');
		await expect(page.locator('[data-cy-signup-submit]')).toBeDisabled();
		await page.locator('[data-cy-signup-invitation-code] input').fill('test-invitation-code');
		await expect(page.locator('[data-cy-signup-submit]')).toBeEnabled();

		const signup = page.waitForResponse(
			(response) => response.url().includes('/api/signup') && response.request().method() === 'POST',
		);
		await page.locator('[data-cy-signup-submit]').click();
		await signup;
	});

	test('signup with duplicated username', async ({ page }) => {
		await registerUser(page, 'alice', 'alice1234');

		await visitHome(page);

		await page.locator('[data-cy-signup]').click();
		await expect(page.locator('[data-cy-signup-rules-continue]')).toBeDisabled();
		await page.locator('[data-cy-signup-rules-notes-agree] [data-cy-switch-toggle]').click();
		await page.locator('[data-cy-modal-dialog-ok]').click();
		await expect(page.locator('[data-cy-signup-rules-continue]')).toBeEnabled();
		await page.locator('[data-cy-signup-rules-continue]').click();

		await page.locator('[data-cy-signup-username] input').fill('alice');
		await page.locator('[data-cy-signup-password] input').fill('alice1234');
		await page.locator('[data-cy-signup-password-retype] input').fill('alice1234');
		await expect(page.locator('[data-cy-signup-submit]')).toBeDisabled();
	});
});

test.describe('After user signup', () => {
	let admin: TestUser;
	let alice: TestUser;

	test.beforeEach(async ({ page }) => {
		await resetState(page);
		admin = await registerUser(page, 'admin', 'pass', true);
		alice = await registerUser(page, 'alice', 'alice1234');
	});

	test.afterEach(async ({ page }) => {
		await waitForPageCarryoverGuard(page);
	});

	test('successfully loads', async ({ page }) => {
		await visitHome(page);
	});

	test('signin', async ({ page }) => {
		await login(page, 'alice', 'alice1234');
	});

	test('suspend', async ({ page }) => {
		await page.request.post('/api/admin/suspend-user', {
			data: {
				i: admin.token,
				userId: alice.id,
			},
		});

		await visitHome(page);
		await page.locator('[data-cy-signin]').click();
		await expect(page.locator('[data-cy-signin-page-input]')).toBeVisible({ timeout: 1_000 });
		await page.locator('[data-cy-signin-username] input').fill('alice');
		await page.locator('[data-cy-signin-username] input').press('Enter');

		await expect(
			page
				.locator('span')
				.filter({ hasText: /アカウントが凍結されています|This account has been suspended due to/gi })
				.first(),
		).toBeVisible();
	});
});

test.describe('After user signed in', () => {
	test.beforeEach(async ({ page }) => {
		await resetState(page);
		await registerUser(page, 'admin', 'pass', true);
		await registerUser(page, 'alice', 'alice1234');
		await login(page, 'alice', 'alice1234');
	});

	test.afterEach(async ({ page }) => {
		await waitForPageCarryoverGuard(page);
	});

	test('successfully loads', async ({ page }) => {
		await expect(page.locator('[data-cy-user-setup-continue]')).toBeVisible({ timeout: 30_000 });
	});

	test('account setup wizard', async ({ page }) => {
		await page.locator('[data-cy-user-setup-continue]').click({ timeout: 30_000 });

		await page.locator('[data-cy-user-setup-user-name] input').fill('ありす');
		await page.locator('[data-cy-user-setup-user-description] textarea').fill('ほげ');

		await page.locator('[data-cy-user-setup-continue]').click();
		await page.locator('[data-cy-user-setup-continue]').click();
		await page.locator('[data-cy-user-setup-continue]').click();
		await page.locator('[data-cy-user-setup-continue]').click();
		await page.locator('[data-cy-user-setup-continue]').click();
	});
});

test.describe('After user setup', () => {
	test.beforeEach(async ({ page }) => {
		await resetState(page);
		await registerUser(page, 'admin', 'pass', true);
		await registerUser(page, 'alice', 'alice1234');
		await login(page, 'alice', 'alice1234');
		await closeInitialUserSetup(page);
	});

	test.afterEach(async ({ page }) => {
		await waitForPageCarryoverGuard(page);
	});

	test('note', async ({ page }) => {
		await expect(page.locator('[data-cy-open-post-form]')).toBeVisible();
		await page.locator('[data-cy-open-post-form]').click();
		await page.locator('[data-cy-post-form-text]').pressSequentially('Hello, Misskey!');

		const noteCreated = page.waitForResponse((response) => {
			return response.url().includes('/api/notes/create') && response.request().method() === 'POST';
		});
		await page.locator('[data-cy-open-post-form-submit]').click();
		const noteResponse = await noteCreated;
		expect(noteResponse.ok()).toBe(true);

		const note = (await noteResponse.json()) as { createdNote: { text: string | null } };
		expect(note.createdNote.text).toBe('Hello, Misskey!');
	});

	test('open note form with hotkey', async ({ page }) => {
		await expect(page.locator('[data-cy-open-post-form]')).toBeVisible();
		await page.evaluate(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', code: 'KeyL', bubbles: true }));
		});

		await expect(page.locator('[data-cy-post-form-text]')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('[data-cy-post-form-text]')).toBeHidden();
	});
});
