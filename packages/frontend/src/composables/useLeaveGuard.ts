/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Ref } from 'vue';
import { inject, onBeforeUnmount } from 'vue';
import { useRouter } from './useRouter.js';
import { DI } from '@/di.js';
import { i18n } from '@/i18n.js';
import { deepEqual } from '@/utility/deep-equal.js';

export function useLeaveGuard(enabled: Ref<boolean>) {
	const router = useRouter();
	const routeActive = inject(DI.routeActive, null);
	const remove = router.addLeaveGuard((nextFullPath) => {
		if (!enabled.value || routeActive?.value === false) return true;
		if (nextFullPath != null) {
			const next = router.resolve(nextFullPath);
			if (next?.route === router.current.route && deepEqual(next.props, router.current.props)) return true;
		}
		return window.confirm(i18n.ts._imageEffector.discardChangesConfirm);
	});
	const beforeUnload = (event: BeforeUnloadEvent) => {
		if (!enabled.value || routeActive?.value === false) return;
		event.preventDefault();
		event.returnValue = '';
	};
	window.addEventListener('beforeunload', beforeUnload);
	onBeforeUnmount(() => {
		remove();
		window.removeEventListener('beforeunload', beforeUnload);
	});
}
