/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { test, expect } from '../support/fixtures';
import { closeInitialUserSetup, login, registerUser, resetState } from '../support/helpers';

test.describe('Router transition', () => {
	test('redirect to user profile', async ({ page }) => {
		await resetState(page);
		await registerUser(page, 'admin', 'pass', true);
		await registerUser(page, 'alice', 'alice1234');
		await login(page, 'alice', 'alice1234');
		await closeInitialUserSetup(page);

		await page.goto('/redirect-test');

		await expect(page).toHaveURL(/\/@alice/);
	});
});
