/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent, nextTick, ref } from 'vue';
import type { Ref } from 'vue';

const { popupMock } = vi.hoisted(() => ({
	popupMock: vi.fn(),
}));

vi.mock('@/os.js', () => ({
	popup: popupMock,
}));

import { UserPreview, userPreviewDirective } from '@/directives/user-preview.js';
import { DI } from '@/di.js';

describe('UserPreview', () => {
	const sources: HTMLElement[] = [];

	beforeEach(() => {
		popupMock.mockReturnValue({ dispose: vi.fn() });
	});

	afterEach(() => {
		cleanup();
		for (const source of sources.splice(0)) source.remove();
		vi.useRealTimers();
		vi.restoreAllMocks();
		popupMock.mockReset();
	});

	test('closes the preview and removes listeners for a detached source element', () => {
		vi.spyOn(window, 'setTimeout').mockImplementation((handler) => {
			if (typeof handler === 'function') {
				handler();
			}
			return 1 as unknown as ReturnType<typeof window.setTimeout>;
		});
		const source = document.createElement('a');
		sources.push(source);
		document.body.append(source);
		const preview = new UserPreview(source, 'user-id');

		source.dispatchEvent(new MouseEvent('mouseover'));

		expect(popupMock).toHaveBeenCalledOnce();
		const showing = popupMock.mock.calls[0]?.[1].showing as Ref<boolean>;
		expect(showing.value).toBe(true);

		preview.detach();
		expect(showing.value).toBe(false);

		source.dispatchEvent(new MouseEvent('mouseover'));
		expect(popupMock).toHaveBeenCalledOnce();
	});

	test('replaces and removes previews when the directive value changes', async () => {
		vi.useFakeTimers();
		const Component = defineComponent({
			props: {
				user: {
					type: String,
					default: null,
				},
			},
			template: '<a v-user-preview="user">User</a>',
		});
		const result = render(Component, {
			props: { user: 'user-1' },
			global: {
				directives: {
					'user-preview': userPreviewDirective,
				},
			},
		});
		const source = result.getByText('User');

		await fireEvent.mouseOver(source);
		await vi.advanceTimersByTimeAsync(500);
		expect(popupMock.mock.calls[0]?.[1].q).toBe('user-1');

		await result.rerender({ user: 'user-2' });
		await fireEvent.mouseOver(source);
		await vi.advanceTimersByTimeAsync(500);
		expect(popupMock.mock.calls[1]?.[1].q).toBe('user-2');

		await result.rerender({ user: null });
		await fireEvent.mouseOver(source);
		await vi.advanceTimersByTimeAsync(500);
		expect(popupMock).toHaveBeenCalledTimes(2);
	});

	test('closes an open preview and cancels delayed shows while its connected route is inactive', async () => {
		vi.useFakeTimers();
		const active = ref(true);
		const Component = defineComponent({ template: '<a v-user-preview="\'user-id\'">User</a>' });
		const result = render(Component, {
			global: { directives: { 'user-preview': userPreviewDirective }, provide: { [DI.routeActive as symbol]: active } },
		});
		const source = result.getByText('User');
		await fireEvent.mouseOver(source);
		await vi.advanceTimersByTimeAsync(500);
		const showing = popupMock.mock.calls[0]![1].showing as Ref<boolean>;
		expect(showing.value).toBe(true);
		active.value = false;
		await nextTick();
		expect(source.isConnected).toBe(true);
		expect(showing.value).toBe(false);
		await fireEvent.mouseOver(source);
		await vi.advanceTimersByTimeAsync(1000);
		expect(popupMock).toHaveBeenCalledOnce();
		active.value = true;
		await nextTick();
		await fireEvent.mouseOver(source);
		await vi.advanceTimersByTimeAsync(500);
		expect(popupMock).toHaveBeenCalledTimes(2);
	});
});
