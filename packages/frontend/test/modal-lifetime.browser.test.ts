/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { nextTick } from 'vue';

vi.mock('@/preferences.js', () => ({ prefer: { animation: false, menuStyle: 'popup' } }));

import MkModal from '@/components/overlay/MkModal.vue';

describe('modal interaction ownership', () => {
	afterEach(cleanup);

	test('restores page focus and the previous anchor input policy on unexpected removal', async () => {
		const anchor = document.createElement('button');
		anchor.style.pointerEvents = 'all';
		document.body.append(anchor);
		try {
			const result = render(MkModal, {
				props: { anchorElement: anchor },
				slots: { default: '<button>Modal action</button>' },
			});
			await nextTick();
			await nextTick();
			expect(anchor.style.pointerEvents).toBe('none');
			anchor.focus();
			expect(document.activeElement).not.toBe(anchor);

			result.unmount();
			await nextTick();
			expect(anchor.style.pointerEvents).toBe('all');
			anchor.focus();
			expect(document.activeElement).toBe(anchor);
		} finally {
			anchor.remove();
		}
	});
});
