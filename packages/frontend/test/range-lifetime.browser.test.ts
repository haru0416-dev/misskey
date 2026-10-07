/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { ref } from 'vue';
import { DI } from '@/di.js';

vi.mock('@/os.js', () => ({ popup: vi.fn(() => ({ dispose: vi.fn() })) }));

import MkRange from '@/components/form/MkRange.vue';

describe('range interaction ownership', () => {
	afterEach(() => {
		cleanup();
	});

	test.each(['touchcancel', 'unmount', 'inactive'] as const)(
		'releases page input suppression on %s without committing a drag',
		async (exit) => {
			const active = ref(true);
			const changed = vi.fn();
			const ended = vi.fn();
			const result = render(MkRange, {
				props: { modelValue: 20, min: 0, max: 100, 'onUpdate:modelValue': changed, onDragEnded: ended },
				global: { provide: { [DI.routeActive as symbol]: active }, directives: { 'adaptive-border': {} } },
				slots: { label: 'Value' },
			});
			const outside = document.createElement('button');
			document.body.append(outside);
			try {
				const before = getComputedStyle(outside).pointerEvents;
				const slider = result.getByRole('slider', { name: 'Value' });
				await fireEvent.touchStart(slider);
				await fireEvent.mouseMove(window, { clientX: 10000 });
				expect(getComputedStyle(outside).pointerEvents).toBe('none');

				if (exit === 'unmount') result.unmount();
				else if (exit === 'inactive') active.value = false;
				else await fireEvent.touchCancel(window);

				expect(getComputedStyle(outside).pointerEvents).toBe(before);
				await fireEvent.mouseMove(window, { clientX: 0 });
				await fireEvent.mouseUp(window);
				expect(changed).not.toHaveBeenCalled();
				expect(ended).not.toHaveBeenCalled();
			} finally {
				outside.remove();
			}
		},
	);
});
