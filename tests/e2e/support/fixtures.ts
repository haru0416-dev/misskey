/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test as base, expect } from '@playwright/test';
import { seedE2eLocalStorage } from './helpers.js';

// テスト用の設定 (.github/misskey/test.yml ほか) は instance.url が http://misskey.local で、ブラウザからは名前解決できない。
// ドライブのファイル URL などサーバーが組み立てる絶対 URL はこのホストを指すので、テストサーバーへ転送しないと画像が全て読み込みに失敗する。
const instanceOrigin = 'http://misskey.local';

export const test = base.extend({
	page: async ({ page, baseURL }, use) => {
		await page.addInitScript(seedE2eLocalStorage);
		await page.route(`${instanceOrigin}/**`, async (route) => {
			const url = new URL(route.request().url());
			await route.fulfill({ response: await route.fetch({ url: new URL(url.pathname + url.search, baseURL).href }) });
		});

		await use(page);
	},
});

export { expect };
