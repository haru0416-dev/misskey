/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { render } from '@testing-library/vue';
import { defineComponent, nextTick, reactive } from 'vue';
import { useWidgetPropsManager } from '@/widgets/widget.js';

describe('useWidgetPropsManager', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	test('cancels a trailing save when its component unmounts', async () => {
		vi.useFakeTimers();
		const emit = vi.fn();
		let save!: () => void;
		const Component = defineComponent({
			setup() {
				({ save } = useWidgetPropsManager(
					'clock',
					{ value: { type: 'number', default: 1 } },
					{ widget: undefined },
					emit,
				));
			},
			template: '<div />',
		});
		const result = render(Component);

		save();
		save();
		const callsBeforeUnmount = emit.mock.calls.length;
		result.unmount();
		await vi.runAllTimersAsync();

		expect(emit).toHaveBeenCalledTimes(callsBeforeUnmount);
	});

	test('preserves existing values when a widget receives a partial update', async () => {
		const widget = reactive({
			id: 'test',
			data: { value: 2 } as Partial<{ value: number; label: string }>,
		});
		let widgetProps!: { value: number; label: string };
		const Component = defineComponent({
			setup() {
				({ widgetProps } = useWidgetPropsManager(
					'clock',
					{
						value: { type: 'number', default: 1 },
						label: { type: 'string', default: 'default' },
					},
					{ widget },
					vi.fn(),
				));
			},
			template: '<div />',
		});
		render(Component);

		expect(widgetProps).toMatchObject({ value: 2, label: 'default' });
		widget.data = { label: 'updated' };
		await nextTick();

		expect(widgetProps).toMatchObject({ value: 2, label: 'updated' });
	});
});
