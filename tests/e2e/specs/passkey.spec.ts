/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHmac } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.js';
import { closeInitialUserSetup, registerUser, resetState } from '../support/helpers.js';

// WebAuthn の RP ID はテスト設定の instance.url (http://misskey.local) のホスト名になり、ページのオリジンと一致しないと
// 登録も認証も失敗する。画面は misskey.local で開き、http でも WebAuthn が使えるよう安全なオリジンとして扱わせる。
// 既定の headless shell はこのフラグを無視して isSecureContext が false のままなので、通常の Chromium で動かす。
const origin = 'http://misskey.local';
test.use({
	channel: 'chromium',
	launchOptions: {
		args: [
			'--host-resolver-rules=MAP misskey.local:80 127.0.0.1:61812',
			`--unsafely-treat-insecure-origin-as-secure=${origin}`,
		],
	},
});

const password = 'alice1234';

/** RFC 6238 の TOTP (SHA-1・6 桁・30 秒)。 */
function totp(base32Secret: string): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	let bits = '';
	for (const char of base32Secret.replace(/=+$/, '').toUpperCase()) {
		bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
	}
	const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => Number.parseInt(byte, 2)));
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
	const hmac = createHmac('sha1', key).update(counter).digest();
	const offset = hmac[hmac.length - 1]! & 0xf;
	return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

async function answerPasswordDialog(page: Page, secret: string): Promise<void> {
	await expect(page.getByText('続けるには認証を行ってください')).toBeVisible();
	const submit = page.getByRole('button', { name: '続ける' }).last();
	// 開いた直後に入力すると、ダイアログの表示が終わる時点で値が消えることがある。入力が効いて送信できるまで入れ直す。
	await expect(async () => {
		await page.getByPlaceholder('パスワード').last().fill(password);
		await page.locator('input[autocomplete="one-time-code"]').last().fill(totp(secret));
		await expect(submit).toBeEnabled({ timeout: 1_000 });
	}).toPass();
	await submit.click();
	await expect(page.getByText('続けるには認証を行ってください')).toBeHidden();
}

test('パスキーを画面から登録し、そのパスキーでログインできる', async ({ page }) => {
	await resetState(page);
	const alice = await registerUser(page, 'alice', password);

	// パスキーの登録には認証アプリの設定が先に要る。ここは画面を通さず API で済ませる。
	const registered = await (
		await page.request.post('/api/i/2fa/register', { data: { i: alice.token, password } })
	).json();
	const secret = registered.secret as string;
	expect((await page.request.post('/api/i/2fa/done', { data: { i: alice.token, token: totp(secret) } })).ok()).toBe(
		true,
	);

	const cdp = await page.context().newCDPSession(page);
	await cdp.send('WebAuthn.enable');
	await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			automaticPresenceSimulation: true,
		},
	});

	// 登録したユーザーの token で misskey.local 側にログイン状態を作る。
	await page.goto(`${origin}/`);
	const me = await (await page.request.post('/api/i', { data: { i: alice.token } })).json();
	await page.evaluate((account) => window.localStorage.setItem('account', JSON.stringify(account)), {
		...me,
		token: alice.token,
	});
	await page.goto(`${origin}/settings/security`);
	await closeInitialUserSetup(page);

	await page.getByText('セキュリティキー・パスキー', { exact: true }).click();
	await page.getByRole('button', { name: 'セキュリティキー・パスキーを登録する' }).click();
	await answerPasswordDialog(page, secret);
	// 名前の入力欄はラベルと結び付いていないが、開いた時点でフォーカスされている。
	await expect(page.getByText('キーの名前を入力')).toBeVisible();
	await page.keyboard.type('virtual key');
	await page.locator('[data-cy-modal-dialog-ok]').click();
	const keyDone = page.waitForResponse((response) => response.url().endsWith('/api/i/2fa/key-done'));
	await answerPasswordDialog(page, secret);
	expect((await keyDone).ok()).toBe(true);
	const afterRegistration = await (await page.request.post('/api/i', { data: { i: alice.token } })).json();
	expect(afterRegistration.securityKeysList.map((key: { name: string }) => key.name)).toEqual(['virtual key']);

	expect((await page.request.post('/api/i/2fa/password-less', { data: { i: alice.token, value: true } })).ok()).toBe(
		true,
	);

	// ログアウトした状態から、パスキーだけでログインする。
	await page.evaluate(() => {
		window.localStorage.removeItem('account');
		window.localStorage.removeItem('accounts');
	});
	await page.goto(`${origin}/`);
	await page.locator('[data-cy-signin]').click();
	const signin = page.waitForResponse(
		(response) =>
			response.url().endsWith('/api/signin-with-passkey') &&
			response.request().method() === 'POST' &&
			response.request().postDataJSON()?.credential != null,
	);
	await page.getByRole('button', { name: 'パスキーでログイン' }).click();
	expect((await signin).ok()).toBe(true);
	await expect
		.poll(
			() =>
				page.evaluate(() => JSON.parse(window.localStorage.getItem('account') ?? '{}').username as string | undefined),
			{ timeout: 15_000 },
		)
		.toBe('alice');
});
