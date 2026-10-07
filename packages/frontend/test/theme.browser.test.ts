/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Theme } from '@/shared/utility/theme.js';
import lightTheme from '@/shared/themes/_light.json5';
import darkTheme from '@/shared/themes/_dark.json5';
import { themeManager, isPreviewMode } from '@/theme.js';

vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: {
			_theme: {
				alreadyInstalled: 'already installed',
				invalid: 'invalid',
			},
		},
	},
	updateI18n: vi.fn(),
}));

vi.mock('@/os.js', () => ({
	alert: vi.fn(),
}));

const cloneTheme = <T>(value: T): T => structuredClone(value);

const createTheme = (
	base: 'light' | 'dark',
	options: {
		id: string;
		name: string;
		accent: string;
		bg: string;
		fg: string;
	},
): Theme => {
	const builtin = base === 'dark' ? darkTheme : lightTheme;

	return {
		id: options.id,
		name: options.name,
		author: 'tester',
		base,
		props: {
			...cloneTheme(builtin.props),
			accent: options.accent,
			bg: options.bg,
			fg: options.fg,
		},
	};
};

const primaryTheme = createTheme('light', {
	id: 'primary-theme',
	name: 'Primary Theme',
	accent: '#224488',
	bg: '#faf7f2',
	fg: '#1a1a1a',
});

const previewTheme = createTheme('dark', {
	id: 'preview-theme',
	name: 'Preview Theme',
	accent: '#55aa33',
	bg: '#101820',
	fg: '#f4f4f4',
});

const replacementTheme = createTheme('dark', {
	id: 'replacement-theme',
	name: 'Replacement Theme',
	accent: '#bb5500',
	bg: '#18110f',
	fg: '#f6e7df',
});

const originalThemeMeta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
const originalThemeMetaContent = originalThemeMeta?.getAttribute('content') ?? null;
const originalRootClass = document.documentElement.className;
const originalRootStyle = document.documentElement.style.cssText;
const originalColorScheme = document.documentElement.getAttribute('data-color-scheme');
const originalViewTransition = Object.getOwnPropertyDescriptor(document, 'startViewTransition');
const originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState');
let themeMeta: HTMLMetaElement;
let removeTestListeners: (() => void)[] = [];

const resetDocument = () => {
	window.localStorage.clear();
	themeMeta = originalThemeMeta ?? document.createElement('meta');
	themeMeta.name = 'theme-color';
	themeMeta.content = '#000000';
	if (!themeMeta.isConnected) document.head.append(themeMeta);
	document.documentElement.className = originalRootClass;
	document.documentElement.removeAttribute('data-color-scheme');
	document.documentElement.style.cssText = originalRootStyle;
	// Chromium の実装は Document の prototype にあるため、削除では無効にならない。
	Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined });
	Object.defineProperty(document, 'visibilityState', {
		configurable: true,
		value: 'visible',
	});
};

describe('ThemeManager', () => {
	beforeEach(() => {
		resetDocument();
		const on = themeManager.on.bind(themeManager);
		vi.spyOn(themeManager, 'on').mockImplementation((event, listener, context) => {
			removeTestListeners.push(() => {
				themeManager.off(event, listener, context);
			});
			return on(event, listener, context);
		});
	});

	afterEach(() => {
		for (const remove of removeTestListeners) remove();
		removeTestListeners = [];
		window.localStorage.clear();
		vi.restoreAllMocks();
		if (originalViewTransition) {
			Object.defineProperty(document, 'startViewTransition', originalViewTransition);
		} else {
			Reflect.deleteProperty(document, 'startViewTransition');
		}
		if (originalVisibilityState) {
			Object.defineProperty(document, 'visibilityState', originalVisibilityState);
		} else {
			Reflect.deleteProperty(document, 'visibilityState');
		}
		document.documentElement.className = originalRootClass;
		document.documentElement.style.cssText = originalRootStyle;
		if (originalColorScheme === null) {
			document.documentElement.removeAttribute('data-color-scheme');
		} else {
			document.documentElement.setAttribute('data-color-scheme', originalColorScheme);
		}
		if (originalThemeMeta) {
			if (originalThemeMetaContent === null) {
				originalThemeMeta.removeAttribute('content');
			} else {
				originalThemeMeta.content = originalThemeMetaContent;
			}
		} else {
			themeMeta.remove();
		}
	});

	test('通常テーマ適用後のプレビューは現在テーマのみを切り替え、キャッシュは保持する', async () => {
		themeManager.updateTheme(primaryTheme);
		const cachedTheme = window.localStorage.getItem('theme');
		const cachedThemeId = window.localStorage.getItem('themeId');

		themeManager.previewTheme(previewTheme);

		assert.strictEqual(themeManager.theme?.id, primaryTheme.id);
		assert.strictEqual(themeManager.currentTheme?.id, previewTheme.id);
		assert.strictEqual(themeManager.currentThemeId, previewTheme.id);
		assert.strictEqual(themeManager.isPreviewMode, true);
		assert.strictEqual(isPreviewMode.value, true);
		assert.strictEqual(document.documentElement.dataset['colorScheme'], 'dark');
		assert.strictEqual(
			document.documentElement.style.getPropertyValue('--MI_THEME-accent'),
			themeManager.currentCompiledTheme?.['accent'],
		);
		assert.strictEqual(window.localStorage.getItem('theme'), cachedTheme);
		assert.strictEqual(window.localStorage.getItem('themeId'), cachedThemeId);
	});

	test('プレビュー解除で元のテーマと DOM 状態が復元され、テーマ変更イベントが順に発火する', async () => {
		const events: string[] = [];

		themeManager.on('themeChanging', () => {
			events.push('themeChanging');
		});
		themeManager.on('themeChanged', () => {
			events.push('themeChanged');
		});

		themeManager.updateTheme(primaryTheme);
		const originalCompiledThemeColor = themeManager.currentCompiledTheme?.['htmlThemeColor'];

		themeManager.previewTheme(previewTheme);
		const previewCompiledThemeColor = themeManager.currentCompiledTheme?.['htmlThemeColor'];
		assert.strictEqual(themeManager.currentTheme?.id, previewTheme.id);
		assert.notStrictEqual(previewCompiledThemeColor, originalCompiledThemeColor);

		themeManager.clearPreview();

		assert.strictEqual(themeManager.theme?.id, primaryTheme.id);
		assert.strictEqual(themeManager.currentTheme?.id, primaryTheme.id);
		assert.strictEqual(themeManager.currentCompiledTheme?.['htmlThemeColor'], originalCompiledThemeColor);
		assert.strictEqual(themeManager.isPreviewMode, false);
		assert.strictEqual(isPreviewMode.value, false);
		assert.strictEqual(document.documentElement.dataset['colorScheme'], 'light');
		assert.strictEqual(
			document.documentElement.style.getPropertyValue('--MI_THEME-accent'),
			themeManager.currentCompiledTheme?.['accent'],
		);
		assert.strictEqual(
			document.head.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
			originalCompiledThemeColor,
		);
		assert.strictEqual(window.localStorage.getItem('themeId'), primaryTheme.id);
		assert.deepStrictEqual(events, [
			'themeChanging',
			'themeChanged',
			'themeChanging',
			'themeChanged',
			'themeChanging',
			'themeChanged',
		]);
	});

	test('プレビュー中に通常テーマを更新するとプレビューを抜けて新しい通常テーマが適用される', async () => {
		themeManager.updateTheme(primaryTheme);
		themeManager.previewTheme(previewTheme);
		themeManager.updateTheme(replacementTheme);

		assert.strictEqual(themeManager.theme?.id, replacementTheme.id);
		assert.strictEqual(themeManager.currentTheme?.id, replacementTheme.id);
		assert.strictEqual(themeManager.isPreviewMode, false);
		assert.strictEqual(isPreviewMode.value, false);
		assert.strictEqual(document.documentElement.dataset['colorScheme'], 'dark');
		assert.strictEqual(
			document.documentElement.style.getPropertyValue('--MI_THEME-accent'),
			themeManager.currentCompiledTheme?.['accent'],
		);
		assert.strictEqual(window.localStorage.getItem('themeId'), replacementTheme.id);
	});

	test.each(['ready', 'finished'] as const)(
		'View Transitionの%s拒否でもテーマ適用を完了し一時クラスを解放する',
		async (stage) => {
			let rejectTransition: (reason?: unknown) => void = () => {};
			const rejected = new Promise<void>((_resolve, reject) => {
				rejectTransition = reject;
			});
			const startViewTransition = vi.fn((update: () => void | Promise<void>) => {
				void update();
				return {
					finished: stage === 'finished' ? rejected : Promise.resolve(),
					ready: stage === 'ready' ? rejected : Promise.resolve(),
					updateCallbackDone: Promise.resolve(),
					skipTransition: vi.fn(),
				};
			});
			Object.defineProperty(document, 'startViewTransition', {
				configurable: true,
				value: startViewTransition,
			});
			const error = new Error('transition failed');
			const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
			const themeChanged = vi.fn();
			themeManager.on('themeChanged', themeChanged);

			themeManager.updateTheme(primaryTheme);
			expect(document.documentElement.classList.contains('_themeChanging_')).toBe(true);
			rejectTransition(error);
			await vi.waitFor(() => expect(document.documentElement.classList.contains('_themeChanging_')).toBe(false));

			expect(document.documentElement.dataset['colorScheme']).toBe('light');
			expect(themeChanged).toHaveBeenCalledTimes(1);
			expect(consoleError).toHaveBeenCalledWith(error);
		},
	);

	test('View Transitionの同期例外時もテーマを適用して一時クラスを解放する', async () => {
		const error = new Error('start failed');
		Object.defineProperty(document, 'startViewTransition', {
			configurable: true,
			value: vi.fn(() => {
				throw error;
			}),
		});
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const themeChanged = vi.fn();
		themeManager.on('themeChanged', themeChanged);

		themeManager.updateTheme(primaryTheme);

		expect(document.documentElement.classList.contains('_themeChanging_')).toBe(false);
		expect(document.documentElement.dataset['colorScheme']).toBe('light');
		expect(themeChanged).toHaveBeenCalledTimes(1);
		expect(consoleError).toHaveBeenCalledWith(error);
	});
});
