/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { render } from '@testing-library/vue';
import { defineComponent } from 'vue';
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
					{},
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
});
