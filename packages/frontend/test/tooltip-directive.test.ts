/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent } from 'vue';

const { alertMock, popupMock } = vi.hoisted(() => ({
	alertMock: vi.fn(),
	popupMock: vi.fn(),
}));

vi.mock('@/os.js', () => ({
	alert: alertMock,
	popup: popupMock,
}));

import { tooltipDirective } from '@/directives/tooltip.js';

const global = {
	directives: {
		tooltip: tooltipDirective,
	},
};

describe('tooltipDirective', () => {
	beforeEach(() => {
		popupMock.mockReturnValue({ dispose: vi.fn() });
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
		vi.restoreAllMocks();
		alertMock.mockReset();
		popupMock.mockReset();
	});

	test('uses updated text and removes listeners when unmounted', async () => {
		const Component = defineComponent({
			props: {
				text: {
					type: String,
					required: true,
				},
			},
			template: '<button v-tooltip.noDelay="text">Target</button>',
		});
		const result = render(Component, { props: { text: 'First' }, global });
		const target = result.getByRole('button');

		await fireEvent.mouseEnter(target);
		expect(popupMock.mock.calls[0]?.[1].text).toBe('First');

		await result.rerender({ text: 'Second' });
		await fireEvent.mouseEnter(target);
		expect(popupMock.mock.calls[1]?.[1].text).toBe('Second');

		result.unmount();
		await fireEvent.mouseEnter(target);
		expect(popupMock).toHaveBeenCalledTimes(2);
	});

	test('supports touch followed by mouse input', async () => {
		vi.useFakeTimers();
		const Component = defineComponent({
			template: '<button v-tooltip.noDelay="\'Tooltip\'">Target</button>',
		});
		const result = render(Component, { global });
		const target = result.getByRole('button');

		await fireEvent.touchStart(target);
		expect(popupMock).toHaveBeenCalledOnce();
		const firstShowing = popupMock.mock.calls[0]?.[1].showing;
		await fireEvent.touchEnd(target);
		expect(firstShowing.value).toBe(false);

		await fireEvent.mouseEnter(target);
		expect(popupMock).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(1000);
		await fireEvent.mouseEnter(target);
		expect(popupMock).toHaveBeenCalledTimes(2);
	});

	test('recovers from cancelled touch input', async () => {
		vi.useFakeTimers();
		const Component = defineComponent({
			template: '<button v-tooltip.noDelay="\'Tooltip\'">Target</button>',
		});
		const result = render(Component, { global });
		const target = result.getByRole('button');

		await fireEvent.touchStart(target);
		const firstShowing = popupMock.mock.calls[0]?.[1].showing;
		await fireEvent.touchCancel(target);
		expect(firstShowing.value).toBe(false);

		await fireEvent.mouseEnter(target);
		expect(popupMock).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(1000);
		await fireEvent.mouseEnter(target);
		expect(popupMock).toHaveBeenCalledTimes(2);
	});

	test('shows on keyboard focus and dismisses with Escape', async () => {
		const Component = defineComponent({
			template: '<button aria-describedby="existing" v-tooltip.noDelay="\'Tooltip\'">Target</button>',
		});
		const result = render(Component, { global });
		const target = result.getByRole('button');

		await fireEvent.focus(target);
		expect(popupMock).toHaveBeenCalledOnce();
		const tooltipId = popupMock.mock.calls[0]?.[1].id;
		expect(target.getAttribute('aria-describedby')).toBe(`existing ${tooltipId}`);
		const showing = popupMock.mock.calls[0]?.[1].showing;
		await fireEvent.keyDown(target, { key: 'Escape' });
		expect(showing.value).toBe(false);
		expect(target.getAttribute('aria-describedby')).toBe('existing');
	});

	test('stays open while either focus or pointer hover remains', async () => {
		const Component = defineComponent({
			template: '<button v-tooltip.noDelay="\'Tooltip\'">Target</button>',
		});
		const result = render(Component, { global });
		const target = result.getByRole('button');

		await fireEvent.focus(target);
		const showing = popupMock.mock.calls[0]?.[1].showing;
		await fireEvent.mouseEnter(target);
		await fireEvent.blur(target);
		expect(showing.value).toBe(true);

		await fireEvent.mouseLeave(target);
		expect(showing.value).toBe(false);
	});

	test('shows the latest dialog text after updates', async () => {
		const Component = defineComponent({
			props: {
				text: {
					type: String,
					required: true,
				},
			},
			template: '<button v-tooltip:dialog="text">Target</button>',
		});
		const result = render(Component, { props: { text: 'First' }, global });
		const target = result.getByRole('button');

		await fireEvent.click(target);
		expect(alertMock.mock.calls[0]?.[0].text).toBe('First');
		await result.rerender({ text: 'Second' });
		await fireEvent.click(target);
		expect(alertMock.mock.calls[1]?.[0].text).toBe('Second');
	});
});
