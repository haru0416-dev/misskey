/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineConfig } from 'oxlint';
import core from 'ultracite/oxlint/core';
import vitest from 'ultracite/oxlint/vitest';
import vue from 'ultracite/oxlint/vue';
import project from './.oxlintrc.json' with { type: 'json' };

export default defineConfig({
	env: project.env,
	extends: [core, vue],
	globals: project.globals,
	ignorePatterns: [...(core.ignorePatterns ?? []), ...project.ignorePatterns],
	// Playwright のテストには Vitest の import や matcher を適用しない。
	overrides: vitest.overrides?.map((override) => ({
		...override,
		files: override.files?.map((pattern) => `packages/${pattern}`),
	})),
});
