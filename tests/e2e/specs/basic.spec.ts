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
	visitHome,
	waitForPageCarryoverGuard,
} from '../support/helpers';
import type { TestUser } from '../support/helpers';

test.describe('Before setup instance', () => {
	test.beforeEach(async ({ page }) => {
		await resetState(page);
	});

	test.afterEach(async ({ page }) => {
		await waitForPageCarryoverGuard(page);
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
		expect((await signup).status()).toBe(200);

		const updateMeta = page.waitForResponse(
			(response) => response.url().includes('/api/admin/update-meta') && response.request().method() === 'POST',
		);
		await page.locator('[data-cy-next]').click();
		await page.locator('[data-cy-server-name] input').fill('Testskey');
		await page.locator('[data-cy-server-setup-wizard-apply]').click();
		expect((await updateMeta).status()).toBe(204);
		const meta = await page.request.post('/api/meta', { data: {} });
		expect(meta.status()).toBe(200);
		expect(await meta.json()).toMatchObject({ name: 'Testskey' });
	});
});

test.describe('After setup instance', () => {
	let admin: TestUser;
	test.beforeEach(async ({ page }) => {
		await resetState(page);
		admin = await registerUser(page, 'admin', 'pass', true);
	});

	test.afterEach(async ({ page }) => {
		await waitForPageCarryoverGuard(page);
	});

	test('does not offer another announcement page when the admin list is empty', async ({ page }) => {
		await login(page, 'admin', 'pass');
		await closeInitialUserSetup(page);
		const listed = page.waitForResponse(
			(response) => response.url().includes('/api/admin/announcements/list') && response.request().method() === 'POST',
		);
		await page.goto('/admin/announcements');
		expect((await listed).ok()).toBe(true);
		await expect(page.locator('[data-cy-announcements-more]')).toHaveCount(0);
	});

	// 一覧の取得に失敗したとき、読み込み表示のまま止まらず、再試行で取り直せる。
	test('shows a retryable error when the announcement list fails to load', async ({ page }) => {
		const created = await page.request.post('/api/admin/announcements/create', {
			data: { i: admin.token, title: 'Loaded after retry', text: 'Body', imageUrl: null },
		});
		expect(created.ok()).toBe(true);

		await login(page, 'admin', 'pass');
		await closeInitialUserSetup(page);
		let fail = true;
		await page.route('**/api/admin/announcements/list', (route) =>
			fail
				? route.fulfill({
						status: 500,
						contentType: 'application/json',
						body: JSON.stringify({
							error: {
								message: 'x',
								code: 'INTERNAL_ERROR',
								id: '5d37dbcb-891e-41ca-a3d6-e690c97775ac',
								kind: 'server',
							},
						}),
					})
				: route.continue(),
		);
		await page.goto('/admin/announcements');
		const retry = page.getByRole('button', { name: '再試行' });
		await expect(retry).toBeVisible();

		fail = false;
		await retry.click();
		await expect(page.getByText('Loaded after retry')).toBeVisible();
		await expect(retry).toHaveCount(0);
	});

	test('loads the remaining announcements without offering an empty page', async ({ page }) => {
		for (let index = 0; index < 11; index++) {
			const created = await page.request.post('/api/admin/announcements/create', {
				data: { i: admin.token, title: `Announcement ${index}`, text: 'Body', imageUrl: null },
			});
			expect(created.ok()).toBe(true);
		}

		await login(page, 'admin', 'pass');
		await closeInitialUserSetup(page);
		await page.goto('/admin/announcements');
		const more = page.locator('[data-cy-announcements-more]');
		await expect(more).toBeVisible();
		await expect(page.getByText('Announcement 0')).toHaveCount(0);
		await more.click();
		await expect(page.getByText('Announcement 0')).toBeVisible();
		await expect(more).toHaveCount(0);
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
		expect((await signup).status()).toBe(200);
		await expect(page.locator('[data-cy-user-setup-continue]')).toBeVisible();
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
		await page.locator('[data-cy-signup-invitation-code] input').fill('test-invitation-code');
		await expect(page.locator('[data-cy-signup-username]')).toContainText('利用できません');
		await expect(page.locator('[data-cy-signup-submit]')).toBeDisabled();
		await page.locator('[data-cy-signup-username] input').fill('bob');
		await expect(page.locator('[data-cy-signup-submit]')).toBeEnabled();
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

	test('signin', async ({ page }) => {
		await login(page, 'alice', 'alice1234');
		await expect(page.locator('[data-cy-user-setup-continue]')).toBeVisible();
		await page.reload();
		await expect(page.locator('[data-cy-user-setup-continue]')).toBeVisible();
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
		await expect(page.locator('[data-cy-signin-page-input]')).toBeVisible({ timeout: 1000 });
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

	test('account setup wizard', async ({ page }) => {
		await page.locator('[data-cy-user-setup-continue]').click({ timeout: 30_000 });

		// 名前と自己紹介は、ステップを進めるときにまとめて保存される。
		await page.locator('[data-cy-user-setup-user-name] input').fill('ありす');
		await page.locator('[data-cy-user-setup-user-description] textarea').fill('ほげ');

		await page.locator('[data-cy-user-setup-continue]').click();
		await page.locator('[data-cy-user-setup-continue]').click();
		await page.locator('[data-cy-user-setup-continue]').click();
		await page.locator('[data-cy-user-setup-continue]').click();
		await page.locator('[data-cy-user-setup-continue]').click();

		// ウィザードを抜け、入力した名前と自己紹介がアカウントに保存されている。
		await expect(page.locator('[data-cy-user-setup]')).toBeHidden();
		const me = await page.evaluate(async () => {
			const account = JSON.parse(localStorage.getItem('account') ?? '{}') as { token?: string };
			const res = await fetch('/api/i', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ i: account.token }),
			});
			return (await res.json()) as { name: string | null; description: string | null };
		});
		expect(me.name).toBe('ありす');
		expect(me.description).toBe('ほげ');
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
