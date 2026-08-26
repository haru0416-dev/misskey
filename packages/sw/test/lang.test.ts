/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';

const get = vi.fn().mockResolvedValue('en-US');
const set = vi.fn();

vi.mock('idb-keyval', () => ({ get, set }));

describe('SwLang', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	test('persists the language before fetching its locale', async () => {
		let finishPersistence: (() => void) | undefined;
		set.mockReturnValue(new Promise<void>(resolve => {
			finishPersistence = resolve;
		}));
		const response = new Response(JSON.stringify({ _lang_: 'ja-JP' }));
		const fetch = vi.fn().mockResolvedValue(response);
		const put = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal('fetch', fetch);
		vi.stubGlobal('caches', {
			match: vi.fn().mockResolvedValue(undefined),
			open: vi.fn().mockResolvedValue({ put }),
		});
		const { SwLang } = await import('@/scripts/lang.js');
		const swLang = new SwLang();

		const settingLang = swLang.setLang('ja-JP');
		await Promise.resolve();

		expect(set).toHaveBeenCalledWith('lang', 'ja-JP');
		expect(fetch).not.toHaveBeenCalled();

		finishPersistence?.();
		await settingLang;

		expect(fetch).toHaveBeenCalledWith('/assets/locales/ja-JP.test.json', expect.any(Object));
		expect(put).toHaveBeenCalled();
	});

	test.each([
		['cache open', vi.fn().mockRejectedValue(new Error('open failed'))],
		['cache put', vi.fn().mockResolvedValue({ put: vi.fn().mockRejectedValue(new Error('put failed')) })],
	])('keeps the fetched locale usable when %s fails', async (_name, open) => {
		set.mockResolvedValue(undefined);
		const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ _lang_: 'ja-JP' })));
		vi.stubGlobal('fetch', fetch);
		vi.stubGlobal('caches', {
			match: vi.fn().mockResolvedValue(undefined),
			open,
		});
		const { SwLang } = await import('@/scripts/lang.js');
		const swLang = new SwLang();

		const i18n = await swLang.setLang('ja-JP');

		expect(i18n).toBeDefined();
		await expect(swLang.i18n).resolves.toBe(i18n);
		expect(fetch).toHaveBeenCalledOnce();
	});

	test('uses the selected language when persistence fails', async () => {
		set.mockRejectedValue(new Error('persistence failed'));
		const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ _lang_: 'ja-JP' })));
		vi.stubGlobal('fetch', fetch);
		vi.stubGlobal('caches', {
			match: vi.fn().mockResolvedValue(undefined),
			open: vi.fn().mockResolvedValue({ put: vi.fn().mockResolvedValue(undefined) }),
		});
		const { SwLang } = await import('@/scripts/lang.js');
		const swLang = new SwLang();

		await expect(swLang.setLang('ja-JP')).resolves.toBeDefined();
		expect(fetch).toHaveBeenCalledWith('/assets/locales/ja-JP.test.json', expect.any(Object));
	});
});
