/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

const createHighlighterCore = vi.fn();

vi.mock('shiki/core', () => ({
	createHighlighterCore,
}));

vi.mock('shiki/engine/javascript', () => ({
	createJavaScriptRegexEngine: vi.fn(() => ({})),
}));

vi.mock('shiki/themes', () => ({
	bundledThemesInfo: [],
}));

vi.mock('shiki/langs', () => ({
	bundledLanguagesInfo: [],
}));

describe('getHighlighter', () => {
	beforeEach(() => {
		vi.resetModules();
		createHighlighterCore.mockReset();
	});

	test('shares initialization between concurrent callers', async () => {
		const highlighter = {};
		createHighlighterCore.mockResolvedValue(highlighter);
		const { getHighlighter } = await import('@/features/code/code-highlighter.js');

		const [first, second] = await Promise.all([getHighlighter(), getHighlighter()]);

		expect(first).toBe(highlighter);
		expect(second).toBe(highlighter);
		expect(createHighlighterCore).toHaveBeenCalledOnce();
	});
});
