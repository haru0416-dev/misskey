/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test, vi } from 'vitest';

vi.mock('@/router.definition.js', () => ({
	ROUTE_DEF: ['/history-a', '/history-b', '/history-c'].map((path) => ({ path, component: {} })),
	page: (loader: () => Promise<unknown>) => loader,
}));
vi.mock('@/analytics.js', () => ({ analytics: { page: () => {} } }));

function traverse(action: () => void, destination?: string): Promise<void> {
	const completed = Promise.withResolvers<void>();
	const onPop = () => {
		if (destination != null && location.pathname !== destination) return;
		window.removeEventListener('popstate', onPop);
		completed.resolve();
	};
	window.addEventListener('popstate', onPop);
	action();
	return completed.promise;
}

test('accepted Back/Forward followed by canceled Back preserves the preceding page', async () => {
	const originalUrl = location.pathname + location.search + location.hash;
	const originalState: unknown = history.state;
	history.replaceState(null, '', '/history-a');
	const registrations = vi.spyOn(window as Window, 'addEventListener');
	// 現在 URL を設定した後に main router を初期化し、実際の popstate と履歴を検証する。
	const { mainRouter } = await import('@/router.js');
	const routerPop = registrations.mock.calls.find(([name]) => name === 'popstate')?.[1];
	registrations.mockRestore();
	let blocked = false;
	const removeGuard = mainRouter.addLeaveGuard(() => !blocked);
	try {
		mainRouter.pushByPath('/history-b');
		mainRouter.pushByPath('/history-c');
		await traverse(() => history.back(), '/history-b');
		await traverse(() => history.forward(), '/history-c');
		blocked = true;
		await traverse(() => history.back(), '/history-c');
		expect(mainRouter.getCurrentFullPath()).toBe('/history-c');
		blocked = false;
		await traverse(() => history.back());
		expect(location.pathname).toBe('/history-b');
		expect(mainRouter.getCurrentFullPath()).toBe('/history-b');
	} finally {
		removeGuard();
		if (routerPop != null) window.removeEventListener('popstate', routerPop);
		history.replaceState(originalState, '', originalUrl);
	}
});
