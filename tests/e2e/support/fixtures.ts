/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test as base, expect } from '@playwright/test';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { seedE2eLocalStorage } from './helpers.js';

// テスト用の設定 (.github/misskey/test.yml ほか) は instance.url が http://misskey.local で、ブラウザからは名前解決できない。
// ドライブのファイル URL などサーバーが組み立てる絶対 URL はこのホストを指すので、テストサーバーへ転送しないと画像が全て読み込みに失敗する。
const instanceOrigin = 'http://misskey.local';

/** fixture の page と同じ前提 (告知の既読化と instance.url の転送) をページまたはコンテキストに入れる。 */
async function prepare(target: Page | BrowserContext, baseURL: string | undefined): Promise<void> {
	await target.addInitScript(seedE2eLocalStorage);
	await target.route(`${instanceOrigin}/**`, async (route) => {
		const url = new URL(route.request().url());
		await route.fulfill({ response: await route.fetch({ url: new URL(url.pathname + url.search, baseURL).href }) });
	});
}

/** browser.newContext() で別の利用者を開くときに使う。素の newContext には fixture の前提が入らない。 */
export async function newE2eContext(browser: Browser): Promise<BrowserContext> {
	const { baseURL } = test.info().project.use;
	const context = await browser.newContext({ locale: 'ja-JP', ...(baseURL != null ? { baseURL } : {}) });
	await prepare(context, baseURL);
	return context;
}

export const test = base.extend({
	page: async ({ page, baseURL }, use) => {
		await prepare(page, baseURL);
		await use(page);
	},
});

export { expect };
