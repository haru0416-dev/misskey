/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, type APIResponse, type Page } from '@playwright/test';

export type TestUser = {
	id: string;
	token: string;
	username: string;
	[key: string]: unknown;
};

const setupPassword = 'example_password_please_change_this_or_you_will_get_hacked';

async function expectOk(response: APIResponse): Promise<void> {
	if (!response.ok()) {
		throw new Error(`${response.url()} failed: ${response.status()} ${await response.text()}`);
	}
}

export async function visitHome(page: Page): Promise<void> {
	await page.goto('/');
	await expect(page.locator('button').first()).toBeVisible({ timeout: 30_000 });
}

export async function resetState(page: Page): Promise<void> {
	const response = await page.request.post('/api/reset-db', { data: {} });
	expect(response.status()).toBe(204);

	if (page.url() !== 'about:blank') {
		await page.reload({ waitUntil: 'domcontentloaded' });
	}
}

export async function registerUser(page: Page, username: string, password: string, isAdmin = false): Promise<TestUser> {
	const route = isAdmin ? '/api/admin/accounts/create' : '/api/signup';
	const response = await page.request.post(route, {
		data: {
			username,
			password,
			...(isAdmin ? { setupPassword } : {}),
		},
	});

	await expectOk(response);
	return (await response.json()) as TestUser;
}

export async function login(page: Page, username: string, password: string): Promise<void> {
	await visitHome(page);

	const signin = page.waitForResponse((response) => {
		return response.url().includes('/api/signin-flow') && response.request().method() === 'POST';
	});

	await page.locator('[data-cy-signin]').click();
	await expect(page.locator('[data-cy-signin-page-input]')).toBeVisible({ timeout: 1_000 });
	await page.locator('[data-cy-signin-username] input').fill(username);
	await page.locator('[data-cy-signin-username] input').press('Enter');
	await expect(page.locator('[data-cy-signin-page-password]')).toBeVisible({ timeout: 10_000 });
	await page.locator('[data-cy-signin-password] input').fill(password);
	await page.locator('[data-cy-signin-password] input').press('Enter');

	await signin;
}

export async function closeInitialUserSetup(page: Page): Promise<void> {
	const close = page.locator('[data-cy-user-setup] [data-cy-modal-window-close]');
	await expect(close).toBeVisible({ timeout: 30_000 });
	const persisted = page.waitForResponse((response) => {
		if (!response.url().includes('/api/i/registry/set') || response.request().method() !== 'POST') return false;
		const body = response.request().postDataJSON() as { scope?: unknown; key?: unknown; value?: unknown };
		return Array.isArray(body.scope) && body.scope.join('/') === 'client/base' && body.key === 'accountSetupWizard' && body.value === -1;
	});
	await close.click();
	await page.locator('[data-cy-modal-dialog-ok]').click();
	const response = await persisted;
	if (!response.ok()) throw new Error(`${response.url()} failed: ${response.status()}`);
	await expect(page.locator('[data-cy-user-setup]')).toBeHidden();
}

export async function waitForPageCarryoverGuard(page: Page): Promise<void> {
	await page.goto('about:blank', { waitUntil: 'load' });
}
