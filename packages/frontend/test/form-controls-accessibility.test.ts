/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import MkInput from '@/components/form/MkInput.vue';
import MkSelect from '@/components/form/MkSelect.vue';
import MkTextarea from '@/components/form/MkTextarea.vue';
import * as os from '@/os.js';

vi.mock('@/os.js', () => ({
	popupMenu: vi.fn(),
}));

const global = {
	directives: {
		'adaptive-border': {},
	},
};

describe('form control accessibility', () => {
	beforeEach(() => {
		vi.mocked(os.popupMenu).mockClear();
	});

	afterEach(() => {
		cleanup();
	});

	test.each([
		['input', MkInput, 'input'],
		['textarea', MkTextarea, 'textarea'],
	] as const)('associates the %s label and caption with its control', (_name, component, selector) => {
		const result = render(component, {
			props: { modelValue: '' },
			slots: {
				label: 'Label',
				caption: 'Caption',
			},
			global,
		});
		const control = result.container.querySelector(selector);
		assert(control != null);

		const labelId = control.getAttribute('aria-labelledby');
		const captionId = control.getAttribute('aria-describedby');
		expect(labelId).not.toBeNull();
		expect(captionId).not.toBeNull();
		expect(document.getElementById(labelId!)?.textContent).toBe('Label');
		expect(document.getElementById(captionId!)?.textContent).toBe('Caption');
	});

	test.each(['Enter', ' ', 'ArrowDown'])('exposes and opens MkSelect with the %s key', async (key) => {
		const result = render(MkSelect, {
			props: {
				items: [{ label: 'Option', value: 'option' }],
				modelValue: 'option',
			},
			slots: {
				label: 'Label',
				caption: 'Caption',
			},
			global,
		});
		const control = result.getByRole('button', { name: 'Label Option' });
		expect(control.getAttribute('aria-haspopup')).toBe('menu');
		expect(control.getAttribute('aria-expanded')).toBe('false');

		await fireEvent.keyDown(control, { key });

		expect(os.popupMenu).toHaveBeenCalledOnce();
		expect(control.getAttribute('aria-expanded')).toBe('true');
	});

	test('exposes readonly MkSelect as disabled and does not open it', async () => {
		const result = render(MkSelect, {
			props: {
				items: [{ label: 'Option', value: 'option' }],
				modelValue: 'option',
				readonly: true,
			},
			global,
		});
		const control = result.getByRole('button', { name: 'Option' });
		expect(control.getAttribute('aria-disabled')).toBe('true');

		await fireEvent.keyDown(control, { key: 'Enter' });

		expect(os.popupMenu).not.toHaveBeenCalled();
	});
});
