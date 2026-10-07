/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue';
import { useMutationObserver } from '@/composables/useMutationObserver.js';
import { DI } from '@/di.js';

describe('useMutationObserver', () => {
	afterEach(cleanup);

	test('delivers only mutations from the current target while it is owned', async () => {
		let target!: HTMLElement;
		const delivered = Promise.withResolvers<void>();
		const callback = vi.fn(() => delivered.resolve());
		const Component = defineComponent({
			props: { alternate: { type: Boolean, required: true } },
			setup(props) {
				const element = ref<HTMLElement | null>(null);
				useMutationObserver(element, { childList: true }, callback);
				return () =>
					h('div', {
						key: props.alternate ? 1 : 0,
						ref: element,
						onVnodeMounted: (vnode) => {
							target = vnode.el as HTMLElement;
						},
					});
			},
		});
		const result = render(Component, { props: { alternate: false } });
		const oldTarget = target;
		await result.rerender({ alternate: true });
		oldTarget.append(document.createElement('span'));
		await Promise.resolve();
		expect(callback).not.toHaveBeenCalled();
		target.append(document.createElement('span'));
		await delivered.promise;
		expect(callback).toHaveBeenCalledOnce();
		result.unmount();
		target.append(document.createElement('span'));
		await Promise.resolve();
		expect(callback).toHaveBeenCalledOnce();
	});

	test('ignores late rendering in a cached or connected background route and resumes on activation', async () => {
		const cachedVisible = ref(true);
		const active = ref(true);
		const text = ref('initial');
		let target!: HTMLElement;
		const callback = vi.fn();
		const Page = defineComponent({
			setup() {
				const element = ref<HTMLElement | null>(null);
				useMutationObserver(element, { childList: true, subtree: true }, callback);
				return () =>
					h(
						'div',
						{
							ref: element,
							onVnodeMounted: (vnode) => {
								target = vnode.el as HTMLElement;
							},
						},
						text.value,
					);
			},
		});
		render(defineComponent({ setup: () => () => h(KeepAlive, () => (cachedVisible.value ? h(Page) : null)) }), {
			global: { provide: { [DI.routeActive as symbol]: active } },
		});
		cachedVisible.value = false;
		await nextTick();
		text.value = 'late response';
		await nextTick();
		expect(target.textContent).toBe('late response');
		expect(target.isConnected).toBe(false);
		expect(callback).not.toHaveBeenCalled();
		cachedVisible.value = true;
		await nextTick();
		active.value = false;
		text.value = 'background response';
		await nextTick();
		expect(target.isConnected).toBe(true);
		expect(callback).not.toHaveBeenCalled();
		active.value = true;
		text.value = 'active response';
		await nextTick();
		await vi.waitFor(() => expect(callback).toHaveBeenCalledOnce());
	});
});
