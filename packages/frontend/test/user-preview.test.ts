/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Ref } from 'vue';

const { popupMock } = vi.hoisted(() => ({
	popupMock: vi.fn(),
}));

vi.mock('@/os.js', () => ({
	popup: popupMock,
}));

import { UserPreview } from '@/directives/user-preview.js';

describe('UserPreview', () => {
	beforeEach(() => {
		popupMock.mockReturnValue({ dispose: vi.fn() });
	});

	afterEach(() => {
		document.body.replaceChildren();
		vi.restoreAllMocks();
		popupMock.mockReset();
	});

	test('uses lifecycle cleanup instead of polling for a detached source element', () => {
		const setInterval = vi.spyOn(window, 'setInterval');
		vi.spyOn(window, 'setTimeout').mockImplementation((handler) => {
			if (typeof handler === 'function') handler();
			return 1 as unknown as ReturnType<typeof window.setTimeout>;
		});
		const source = document.createElement('a');
		document.body.append(source);
		const preview = new UserPreview(source, 'user-id');

		source.dispatchEvent(new MouseEvent('mouseover'));

		expect(popupMock).toHaveBeenCalledOnce();
		expect(setInterval).not.toHaveBeenCalled();
		const showing = popupMock.mock.calls[0]?.[1].showing as Ref<boolean>;
		expect(showing.value).toBe(true);

		preview.detach();
		expect(showing.value).toBe(false);

		source.dispatchEvent(new MouseEvent('mouseover'));
		expect(popupMock).toHaveBeenCalledOnce();
	});
});
