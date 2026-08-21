/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { createTargetFileMatcher } from '../lib/search-index-target-matcher.js';

describe('createTargetFileMatcher', () => {
	const matches = createTargetFileMatcher('/project', ['src/pages/settings/**/*.vue', 'src/pages/admin/**/*.vue']);

	test('matches configured Vue files', () => {
		expect(matches('/project/src/pages/settings/profile.vue')).toBe(true);
		expect(matches('/project/src/pages/admin/users/detail.vue')).toBe(true);
	});

	test('rejects unrelated files and dot paths', () => {
		expect(matches('/project/src/pages/home.vue')).toBe(false);
		expect(matches('/project/src/pages/settings/.private/form.vue')).toBe(false);
	});
});
