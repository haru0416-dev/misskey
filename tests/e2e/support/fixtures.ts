/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test as base, expect } from '@playwright/test';

export const test = base.extend({
	page: async ({ page }, use) => {
		await page.addInitScript(() => {
			window.localStorage.setItem('__MISSKEY_E2E_TEST__', 'true');
		});

		await use(page);
	},
});

export { expect };
