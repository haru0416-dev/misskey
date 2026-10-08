/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect } from '@playwright/test';
import type { APIResponse, Locator, Page } from '@playwright/test';

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

/**
 * アカウント操作を初回の AGPL §13 告知で遮らないよう、この fixture だけ既読状態で開始する。
 */
export function seedE2eLocalStorage(): void {
	window.localStorage.setItem('__MISSKEY_E2E_TEST__', 'true');
	window.localStorage.setItem('modifiedVersionMustProminentlyOfferInAgplV3Section13Read', 'true');
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
	await expect(page.locator('[data-cy-signin-page-input]')).toBeVisible({ timeout: 1000 });
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
		if (!response.url().includes('/api/i/registry/set') || response.request().method() !== 'POST') {
			return false;
		}
		const body = response.request().postDataJSON() as { scope?: unknown; key?: unknown; value?: unknown };
		return (
			Array.isArray(body.scope) &&
			body.scope.join('/') === 'client/base' &&
			body.key === 'accountSetupWizard' &&
			body.value === -1
		);
	});
	await close.click();
	await page.locator('[data-cy-modal-dialog-ok]').click();
	const response = await persisted;
	if (!response.ok()) {
		throw new Error(`${response.url()} failed: ${response.status()}`);
	}
	await expect(page.locator('[data-cy-user-setup]')).toBeHidden();
}

export async function waitForPageCarryoverGuard(page: Page): Promise<void> {
	await page.goto('about:blank', { waitUntil: 'load' });
}

/** 表示された img が実際に画像を読み込めたことを確かめる。壊れた画像でも要素は表示されるので、表示だけでは足りない。 */
export async function expectLoadedImage(image: Locator): Promise<void> {
	await expect
		.poll(() => image.evaluate((element: HTMLImageElement) => (element.complete ? element.naturalWidth : 0)))
		.toBeGreaterThan(0);
}

/**
 * 既に届いた応答の処理と、それに続く描画が終わるまで待つ。「何も起きない」ことを確かめる前に使う。
 *
 * 新しい要求の応答は、それより前に受信を終えた応答の後に処理される。その後の 2 フレームで描画も反映される。
 */
export async function settlePage(page: Page): Promise<void> {
	await page.evaluate(async () => {
		await fetch('/api/ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
		for (let i = 0; i < 2; i++) await new Promise((resolve) => requestAnimationFrame(resolve));
	});
}
