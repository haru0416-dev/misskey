/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { page, ROUTE_DEF } from '@/router.definition.js';
import { $i } from '@/i.js';
import { Nirax } from '@/lib/nirax.js';
import { analytics } from '@/analytics.js';
import { registerMainRouter } from '@/composables/useRouter.js';

export type Router = Nirax<typeof ROUTE_DEF>;

export function createRouter(fullPath: string): Router {
	return new Nirax(
		ROUTE_DEF,
		fullPath,
		!!$i,
		page(() => import('@/pages/not-found.vue')),
	);
}

export const mainRouter = createRouter(window.location.pathname + window.location.search + window.location.hash);
registerMainRouter(mainRouter);

const historyIndexKey = 'misskeyRouterIndex';
let historyIndex = Number.isInteger(window.history.state?.[historyIndexKey])
	? (window.history.state[historyIndexKey] as number)
	: 0;
let restoringHistory = false;
window.history.replaceState({ ...window.history.state, [historyIndexKey]: historyIndex }, '');

window.addEventListener('popstate', (event) => {
	if (restoringHistory) {
		restoringHistory = false;
		return;
	}
	const nextIndex = event.state?.[historyIndexKey] as number | undefined;
	const path = window.location.pathname + window.location.search + window.location.hash;
	const previousIndex = historyIndex;
	if (Number.isInteger(nextIndex)) historyIndex = nextIndex!;
	if (!mainRouter.replaceByPath(path)) {
		historyIndex = previousIndex;
		if (Number.isInteger(nextIndex) && nextIndex !== historyIndex) {
			restoringHistory = true;
			window.history.go(historyIndex - nextIndex!);
		} else {
			window.history.replaceState(
				{ ...window.history.state, [historyIndexKey]: historyIndex },
				'',
				mainRouter.getCurrentFullPath(),
			);
		}
		return;
	}
});

mainRouter.addListener('push', (ctx) => {
	window.history.pushState({ [historyIndexKey]: ++historyIndex }, '', ctx.fullPath);
});

mainRouter.addListener('replace', (ctx) => {
	window.history.replaceState({ ...window.history.state, [historyIndexKey]: historyIndex }, '', ctx.fullPath);
});

mainRouter.addListener('forceReplace', (ctx) => {
	window.location.replace(ctx.fullPath);
});

mainRouter.addListener('forcePush', (ctx) => {
	window.location.href = ctx.fullPath;
});

mainRouter.addListener('change', (ctx) => {
	if (_DEV_) {
		console.log('mainRouter: change', ctx.fullPath);
	}
	analytics.page({
		path: ctx.fullPath,
		title: ctx.fullPath,
	});
});

mainRouter.init();
