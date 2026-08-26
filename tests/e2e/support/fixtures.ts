/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test as base, expect } from '@playwright/test';
import { seedE2eLocalStorage } from './helpers.js';

export const test = base.extend({
	page: async ({ page }, use) => {
		await page.addInitScript(seedE2eLocalStorage);

		await use(page);
	},
});

export { expect };
