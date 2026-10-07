/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, h, ref } from 'vue';
import { useFormControlPadding } from '@/composables/useFormControlPadding.js';

/** ResizeObserver の通知はレイアウト後・描画前に届くので、2 フレーム待てば済んだ変更の通知は全て終わっている。 */
async function nextFrames(): Promise<void> {
	for (let i = 0; i < 2; i++) {
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
	}
}

describe('useFormControlPadding', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	test('updates only when decoration sizes change and disconnects on unmount', async () => {
		const setInterval = vi.spyOn(window, 'setInterval');
		const disconnect = vi.spyOn(ResizeObserver.prototype, 'disconnect');
		const Component = defineComponent({
			setup() {
				const input = ref<HTMLElement | null>(null);
				const prefix = ref<HTMLElement | null>(null);
				const suffix = ref<HTMLElement | null>(null);
				useFormControlPadding(input, prefix, suffix);
				return () =>
					h('div', { style: 'display: flex' }, [
						h('div', { ref: prefix, 'data-testid': 'prefix', style: 'flex: none; width: 32px; height: 10px' }),
						h('div', { ref: input, 'data-testid': 'input', style: 'flex: none; width: 100px; height: 10px' }),
						h('div', { ref: suffix, 'data-testid': 'suffix', style: 'flex: none; width: 24px; height: 10px' }),
					]);
			},
		});

		const result = render(Component);
		const input = result.getByTestId('input');
		const prefix = result.getByTestId('prefix');
		const suffix = result.getByTestId('suffix');
		await nextFrames();
		expect(input.style.paddingLeft).toBe('32px');
		expect(input.style.paddingRight).toBe('24px');
		expect(setInterval).not.toHaveBeenCalled();

		// 入力欄自体の大きさが変わっても計算し直さない。書き換えられた値が残ることで確かめる。
		input.style.paddingLeft = '1px';
		input.style.width = '200px';
		await nextFrames();
		expect(input.style.paddingLeft).toBe('1px');

		prefix.style.width = '48px';
		await nextFrames();
		expect(input.style.paddingLeft).toBe('48px');
		expect(input.style.paddingRight).toBe('24px');

		prefix.style.width = '0';
		suffix.style.width = '0';
		await nextFrames();
		expect(input.style.paddingLeft).toBe('');
		expect(input.style.paddingRight).toBe('');

		// unmount 後は template ref が null になり書き込みは起きないので、監視の解除は呼び出しで確かめる。
		expect(disconnect).not.toHaveBeenCalled();
		result.unmount();
		expect(disconnect).toHaveBeenCalledOnce();
	});
});
