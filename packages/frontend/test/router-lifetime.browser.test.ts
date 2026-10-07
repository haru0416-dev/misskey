/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent, h, inject, nextTick, provide, ref, shallowReactive } from 'vue';
import { DI } from '@/di.js';
import { Nirax } from '@/lib/nirax.js';
import type { Router } from '@/router.js';
import RouterView from '@/components/global/RouterView.vue';
import NestedRouterView from '@/components/global/NestedRouterView.vue';
import StackingRouterView from '@/components/global/StackingRouterView.vue';
import SearchMarker from '@/components/global/SearchMarker.vue';
import MkA from '@/components/global/MkA.vue';
import { contextMenu } from '@/os.js';
import { prefer } from './fixtures.js';

vi.mock('@/os.js', () => ({ contextMenu: vi.fn(), pageWindow: vi.fn() }));

const Empty = defineComponent({ render: () => null });
const Draft = defineComponent({
	setup() {
		const text = ref('');
		const active = inject(DI.routeActive);
		return () =>
			h('section', { 'data-testid': 'draft-page', 'data-active': String(active?.value ?? true) }, [
				h('input', {
					'aria-label': 'Draft',
					value: text.value,
					onInput: (event: Event) => {
						text.value = (event.target as HTMLInputElement).value;
					},
				}),
			]);
	},
});
const Shell = defineComponent({ setup: () => () => h('div', [h(NestedRouterView)]) });
const Other = defineComponent({ render: () => h('p', 'Other child') });

function mountRouter(stacked = false) {
	prefer.commit('numberOfPageCache', 3);
	prefer.commit('animation', false);
	const router = new Nirax(
		[
			{ path: '/settings', component: Shell, children: [{ path: '/profile', component: Draft }] },
			{ path: '/admin', component: Shell, children: [{ path: '/overview', component: Other }] },
			{ path: '/', component: Other },
		],
		'/settings/profile',
		true,
		Empty,
	);
	router.init();
	const Host = defineComponent({
		setup() {
			provide(DI.router, router as unknown as Router);
			return () => h('div', [h(stacked ? StackingRouterView : RouterView)]);
		},
	});
	const result = render(Host, { global: { components: { MkLoading: Empty } } });
	return { router, result };
}

async function flush() {
	await nextTick();
	await nextTick();
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('route resource ownership', () => {
	test.each([false, true])('retains its own nested draft across another shell (stacked=%s)', async (stacked) => {
		const { router, result } = mountRouter(stacked);
		await flush();
		const input = result.getByRole('textbox', { name: 'Draft' });
		await fireEvent.update(input, 'unsaved input');
		router.pushByPath('/admin/overview');
		await flush();
		expect(result.getByText('Other child')).toBeTruthy();
		if (stacked) expect(result.getByTestId('draft-page').getAttribute('data-active')).toBe('false');
		router.pushByPath('/settings/profile');
		await flush();
		expect(result.getByRole('textbox', { name: 'Draft' })).toBe(input);
		expect((input as HTMLInputElement).value).toBe('unsaved input');
		expect(result.getByTestId('draft-page').getAttribute('data-active')).toBe('true');
	});

	test('updates highlights on target changes and keeps independent owners isolated', async () => {
		const target = ref<string | null>('a');
		const mainMarkers = shallowReactive(new Map<string, number>());
		const windowMarkers = shallowReactive(new Map<string, number>());
		const Host = defineComponent({
			setup() {
				return () =>
					h('div', [
						h(
							defineComponent({
								setup() {
									provide(DI.inAppSearchMarkerId, ref('b'));
									provide(DI.searchMarkers, mainMarkers);
									return () => h(SearchMarker, { markerId: 'b', 'data-testid': 'main-b' }, () => h('span', 'Main B'));
								},
							}),
						),
						h(
							defineComponent({
								setup() {
									provide(DI.inAppSearchMarkerId, target);
									provide(DI.searchMarkers, windowMarkers);
									return () =>
										h('div', [
											h(SearchMarker, { markerId: 'a', 'data-testid': 'window-a' }, () => h('span', 'Window A')),
											h(SearchMarker, { markerId: 'parent', children: ['b'], 'data-testid': 'window-parent' }, () =>
												h('span', 'Window parent'),
											),
										]);
								},
							}),
						),
					]);
			},
		});
		vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
		const result = render(Host);
		await flush();
		const initialA = result.getByTestId('window-a').className;
		const initialParent = result.getByTestId('window-parent').className;
		target.value = 'b';
		await flush();
		expect(result.getByTestId('window-a').className).not.toBe(initialA);
		expect(result.getByTestId('window-parent').className).not.toBe(initialParent);
		target.value = null;
		await flush();
		expect(result.getByTestId('window-parent').className).toBe(initialParent);
	});

	test('does not borrow document hash when an owned window target is null', async () => {
		const previous = location.href;
		history.replaceState({}, '', '#2fa');
		try {
			const scroll = vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(() => {});
			const Host = defineComponent({
				setup() {
					provide(DI.inAppSearchMarkerId, ref(null));
					return () => h(SearchMarker, { markerId: '2fa' }, () => 'Two factor');
				},
			});
			render(Host);
			await flush();
			expect(scroll).not.toHaveBeenCalled();
		} finally {
			history.replaceState({}, '', previous);
		}
	});

	test('preserves selected-text native context menus and still opens its link menu', async () => {
		const router = new Nirax([{ path: '/', component: Empty }], '/', true, Empty);
		const Host = defineComponent({
			setup() {
				provide(DI.router, router as unknown as Router);
				return () => h(MkA, { to: '/' }, () => 'Selectable link');
			},
		});
		const result = render(Host);
		const link = result.getByRole('link', { name: 'Selectable link' });
		const range = document.createRange();
		range.selectNodeContents(link);
		const selection = window.getSelection()!;
		selection.removeAllRanges();
		selection.addRange(range);
		const selected = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
		link.dispatchEvent(selected);
		expect(selected.defaultPrevented).toBe(false);
		selection.removeAllRanges();
		const normal = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
		link.dispatchEvent(normal);
		expect(normal.defaultPrevented).toBe(true);
		expect(contextMenu).toHaveBeenCalledOnce();
	});
});
