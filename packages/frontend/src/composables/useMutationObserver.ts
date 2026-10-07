/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { inject, onActivated, onDeactivated, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { DI } from '@/di.js';

export function useMutationObserver(
	targetNodeRef: Ref<HTMLElement | null | undefined>,
	options: MutationObserverInit,
	callback: MutationCallback,
): void {
	const activated = ref(true);
	const routeActive = inject(DI.routeActive, ref(true));
	onActivated(() => {
		activated.value = true;
	});
	onDeactivated(() => {
		activated.value = false;
	});
	const observer = new MutationObserver((records, currentObserver) => {
		if (activated.value && routeActive.value) {
			callback(records, currentObserver);
		}
	});

	watch(
		[targetNodeRef, activated, routeActive],
		([targetNode, isActivated, isRouteActive], _oldTargetNode, onCleanup) => {
			if (targetNode && isActivated && isRouteActive) {
				observer.observe(targetNode, options);
				onCleanup(() => observer.disconnect());
			}
		},
		{ immediate: true, flush: 'sync' },
	);
}
