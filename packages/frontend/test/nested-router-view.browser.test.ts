/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineAsyncComponent, defineComponent, h, nextTick, provide, ref } from 'vue';
import type { Component } from 'vue';
import type { Router } from '@/router.js';
import type { RouteDef } from '@/lib/nirax.js';
import { Nirax } from '@/lib/nirax.js';
import { DI } from '@/di.js';
import NestedRouterView from '@/components/global/NestedRouterView.vue';
import SearchMarker from '@/components/global/SearchMarker.vue';

function editablePage(name: string) {
	return defineComponent({
		name,
		props: ['id', 'filter', 'section'],
		setup(props) {
			const draft = ref('saved');
			return () =>
				h('div', [
					h('h1', name),
					h('input', {
						'aria-label': 'Unsaved draft',
						value: draft.value,
						onInput: (event: Event) => {
							draft.value = (event.target as HTMLInputElement).value;
						},
					}),
					h('output', { 'data-testid': 'route-props' }, JSON.stringify([props.id, props.filter, props.section])),
				]);
		},
	});
}

const Editor = editablePage('Profile editor');
const OtherEditor = editablePage('Other editor');
const Shell = defineComponent({ render: () => h(NestedRouterView) });
const NotFound = defineComponent({ render: () => h('p', 'Not found') });
const Loading = defineComponent({ render: () => h('p', { role: 'status' }, 'Loading child') });

function createRouter(routes: RouteDef[], path: string): Router {
	const router = new Nirax(routes, path, true, NotFound) as Router;
	router.init();
	return router;
}

function renderNested(routes: RouteDef[], path: string, depth = 1) {
	const router = createRouter(routes, path);
	// testing-library は VTU の外側ラッパーを除去するため、Suspense の描画先には残存するホスト要素が必要。
	const Host = defineComponent({
		setup() {
			provide(DI.router, router);
			provide(DI.routerCurrentDepth, depth);
			return () => h('div', [h(NestedRouterView)]);
		},
	});
	const result = render(Host, { global: { components: { MkLoading: Loading } } });
	return { router, ...result };
}

function settingsRoutes(child: RouteDef): RouteDef[] {
	return [{ path: '/settings', component: Shell, children: [child] }];
}

function inputValue(element: HTMLElement): string {
	return (element as HTMLInputElement).value;
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('NestedRouterView', () => {
	test('keeps an unsaved draft across irrelevant query changes, same-URL navigation and history replacements', async () => {
		const result = renderNested(settingsRoutes({ path: '/profile', component: Editor }), '/settings/profile');
		const input = result.getByRole('textbox', { name: 'Unsaved draft' });
		await fireEvent.update(input, 'unsaved profile');

		const changes: string[] = [];
		const pushes: string[] = [];
		const replacements: string[] = [];
		let same = 0;
		result.router.on('change', ({ fullPath }) => changes.push(fullPath));
		result.router.on('push', ({ fullPath }) => pushes.push(fullPath));
		result.router.on('replace', ({ fullPath }) => replacements.push(fullPath));
		result.router.on('same', () => same++);

		for (const path of ['/settings/profile?unused=one', '/settings/profile?unused=two']) {
			const before = result.router.currentRef.value;
			result.router.pushByPath(path);
			await nextTick();
			expect(result.router.getCurrentFullPath()).toBe(path);
			expect(result.router.currentRef.value).not.toBe(before);
			expect(result.getByRole('textbox')).toBe(input);
			expect(inputValue(input)).toBe('unsaved profile');
		}

		const fullPath = result.router.getCurrentFullPath();
		const beforeSame = result.router.currentRef.value;
		result.router.pushByPath(fullPath);
		await nextTick();
		expect(same).toBe(1);
		expect(result.router.currentRef.value).toBe(beforeSame);

		for (const path of [fullPath, '/settings/profile?unused=one', '/settings/profile']) {
			const before = result.router.currentRef.value;
			result.router.replaceByPath(path);
			await nextTick();
			expect(result.router.getCurrentFullPath()).toBe(path);
			expect(result.router.currentRef.value).not.toBe(before);
			expect(result.getByRole('textbox')).toBe(input);
			expect(inputValue(input)).toBe('unsaved profile');
		}

		expect(pushes).toEqual(['/settings/profile?unused=one', fullPath]);
		expect(replacements).toEqual([fullPath, '/settings/profile?unused=one', '/settings/profile']);
		expect(changes).toEqual([...pushes, ...replacements]);
	});

	test.each([false, true])(
		'raw search-marker hash navigation highlights and scrolls without mapped props (window=%s)',
		async (windowMode) => {
			const previousUrl = window.location.pathname + window.location.search + window.location.hash;
			window.history.replaceState({}, '', '/settings/security');
			const scrollTargets: HTMLElement[] = [];
			vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function (this: HTMLElement) {
				scrollTargets.push(this);
			});
			const MarkerPage = defineComponent({
				setup() {
					return () =>
						h(SearchMarker, { markerId: '2fa' }, () =>
							h('span', { 'data-testid': 'search-target' }, 'Two-factor marker'),
						);
				},
			});
			const router = createRouter(settingsRoutes({ path: '/security', component: MarkerPage }), '/settings/security');
			const markerId = ref<string | null>(null);
			router.on('push', ({ fullPath }) => window.history.pushState({}, '', fullPath));
			router.on('replace', ({ fullPath }) => window.history.replaceState({}, '', fullPath));
			if (windowMode)
				router.on('change', ({ resolved }) => {
					markerId.value = resolved._parsedRoute.hash;
				});
			const Host = defineComponent({
				setup() {
					provide(DI.router, router);
					provide(DI.routerCurrentDepth, 1);
					if (windowMode) provide(DI.inAppSearchMarkerId, markerId);
					return () => h('div', [h(NestedRouterView)]);
				},
			});
			const result = render(Host, { global: { components: { MkLoading: Loading } } });
			try {
				const initialMarker = result.getByTestId('search-target').parentElement!;
				const unhighlightedClass = initialMarker.className;
				expect(scrollTargets).toEqual([]);
				router.pushByPath('/settings/security#2fa');
				await nextTick();
				const targetedMarker = result.getByTestId('search-target').parentElement!;
				expect(window.location.hash).toBe('#2fa');
				expect(initialMarker.isConnected).toBe(false);
				expect(targetedMarker.className).not.toBe(unhighlightedClass);
				expect(scrollTargets).toEqual([targetedMarker]);

				router.pushByPath('/settings/security?unused=one#2fa');
				await nextTick();
				expect(result.getByTestId('search-target').parentElement).toBe(targetedMarker);
				expect(scrollTargets).toEqual([targetedMarker]);

				router.replaceByPath('/settings/security?unused=two');
				await nextTick();
				const clearedMarker = result.getByTestId('search-target').parentElement!;
				expect(window.location.hash).toBe('');
				expect(targetedMarker.isConnected).toBe(false);
				expect(clearedMarker.className).toBe(unhighlightedClass);
				expect(scrollTargets).toEqual([targetedMarker]);
			} finally {
				result.unmount();
				window.history.replaceState({}, '', previousUrl);
			}
		},
	);

	test.each([
		['path parameter', '/settings/edit/two?mode=first#alpha', ['two', 'first', 'alpha']],
		['declared query', '/settings/edit/one?mode=second#alpha', ['one', 'second', 'alpha']],
		['declared hash', '/settings/edit/one?mode=first#beta', ['one', 'first', 'beta']],
		['removed query', '/settings/edit/one#alpha', ['one', null, 'alpha']],
		['removed hash', '/settings/edit/one?mode=first', ['one', 'first', null]],
	] as const)('resets the draft and renders changed %s props', async (_change, path, expectedProps) => {
		const result = renderNested(
			settingsRoutes({
				path: '/edit/:id',
				component: Editor,
				query: { mode: 'filter' },
				hash: 'section',
			}),
			'/settings/edit/one?mode=first#alpha',
		);
		const input = result.getByRole('textbox');
		await fireEvent.update(input, 'unsaved profile');

		result.router.pushByPath('/settings/edit/one?mode=first&unused=one#alpha');
		await nextTick();
		expect(result.getByRole('textbox')).toBe(input);
		expect(inputValue(input)).toBe('unsaved profile');

		result.router.pushByPath(path);
		await nextTick();
		expect(inputValue(result.getByRole('textbox'))).toBe('saved');
		expect(result.getByTestId('route-props').textContent).toBe(JSON.stringify(expectedProps));
	});

	test('resets the draft when the child route changes even if the component and props match', async () => {
		const result = renderNested(
			[
				{
					path: '/settings',
					component: Shell,
					children: [
						{ path: '/profile', component: Editor },
						{ path: '/privacy', component: Editor },
					],
				},
			],
			'/settings/profile',
		);
		await fireEvent.update(result.getByRole('textbox'), 'unsaved profile');
		result.router.pushByPath('/settings/privacy');
		await nextTick();
		expect(inputValue(result.getByRole('textbox'))).toBe('saved');
	});

	test('distinguishes equal child paths belonging to different parent routes', async () => {
		const result = renderNested(
			[
				{ path: '/settings', component: Shell, children: [{ path: '/profile', component: Editor }] },
				{ path: '/admin', component: Shell, children: [{ path: '/profile', component: Editor }] },
			],
			'/settings/profile',
		);
		await fireEvent.update(result.getByRole('textbox'), 'unsaved profile');
		result.router.pushByPath('/admin/profile');
		await nextTick();
		expect(inputValue(result.getByRole('textbox'))).toBe('saved');
	});

	test('renders a changed component on the same route and URL', async () => {
		let component = Editor;
		const result = renderNested(
			settingsRoutes({
				path: '/profile',
				get component() {
					return component;
				},
			}),
			'/settings/profile',
		);
		await fireEvent.update(result.getByRole('textbox'), 'unsaved profile');
		component = OtherEditor;
		result.router.replaceByPath('/settings/profile');
		await nextTick();
		expect(result.getByRole('heading').textContent).toBe('Other editor');
		expect(inputValue(result.getByRole('textbox'))).toBe('saved');
	});

	test('propagates depth through retained parent views and still switches the grandchild', async () => {
		const result = renderNested(
			[
				{
					path: '/settings',
					component: Shell,
					children: [
						{
							path: '/group',
							component: Shell,
							children: [
								{ path: '/profile', component: Editor },
								{ path: '/privacy', component: Editor },
							],
						},
					],
				},
			],
			'/settings/group/profile',
			0,
		);
		const input = result.getByRole('textbox');
		await fireEvent.update(input, 'unsaved profile');
		result.router.pushByPath('/settings/group/profile?unused=one');
		await nextTick();
		expect(result.getByRole('textbox')).toBe(input);
		expect(inputValue(input)).toBe('unsaved profile');

		result.router.pushByPath('/settings/group/privacy');
		await nextTick();
		expect(inputValue(result.getByRole('textbox'))).toBe('saved');
	});

	test('keeps Suspense loading and the resolved lazy page across irrelevant navigation', async () => {
		const loading = Promise.withResolvers<Component>();
		const lazyPage = defineAsyncComponent(() => loading.promise);
		const result = renderNested(settingsRoutes({ path: '/profile', component: lazyPage }), '/settings/profile');
		expect(result.getByRole('status').textContent).toBe('Loading child');
		result.router.pushByPath('/settings/profile?unused=one');
		await nextTick();
		expect(result.getByRole('status').textContent).toBe('Loading child');
		loading.resolve(Editor);
		const input = await result.findByRole('textbox');
		await fireEvent.update(input, 'unsaved profile');
		result.router.pushByPath('/settings/profile?unused=two');
		await nextTick();
		expect(result.getByRole('textbox')).toBe(input);
		expect(inputValue(input)).toBe('unsaved profile');
	});

	test('preserves lazy error rendering and removes its change listener on unmount', async () => {
		const loading = Promise.withResolvers<Component>();
		const failure = new Error('Cannot load page');
		const errors: unknown[] = [];
		const lazyPage = defineAsyncComponent({
			loader: () => loading.promise,
			errorComponent: defineComponent({ render: () => h('p', { role: 'alert' }, 'Could not load child') }),
		});
		const router = createRouter(settingsRoutes({ path: '/profile', component: lazyPage }), '/settings/profile');
		const listenersBefore = router.listenerCount('change');
		const Host = defineComponent({ render: () => h('div', [h(NestedRouterView, { router })]) });
		const result = render(Host, {
			global: {
				provide: { [DI.routerCurrentDepth as symbol]: 1 },
				components: { MkLoading: Loading },
				config: { errorHandler: (error) => errors.push(error) },
			},
		});
		loading.reject(failure);
		expect((await result.findByRole('alert')).textContent).toBe('Could not load child');
		expect(errors).toEqual([failure]);
		expect(router.listenerCount('change')).toBe(listenersBefore + 1);
		result.unmount();
		expect(router.listenerCount('change')).toBe(listenersBefore);
	});
});
