/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { throttle } from 'throttle-debounce';
import type { Directive } from 'vue';
import type { Awaitable } from '@/types/misc.js';

interface HTMLElementWithObserver extends HTMLElement {
	_observer_?: IntersectionObserver;
	_cancelThrottle_?: () => void;
}

function stopObserving(src: HTMLElementWithObserver) {
	src._observer_?.disconnect();
	src._cancelThrottle_?.();
	delete src._observer_;
	delete src._cancelThrottle_;
}

function observe(src: HTMLElementWithObserver, fn: (() => Awaitable<void>) | null | undefined) {
	stopObserving(src);
	if (fn == null) {
		return;
	}

	const check = throttle<IntersectionObserverCallback>(500, (entries) => {
		if (entries.some((entry) => entry.isIntersecting)) {
			fn();
		}
	});
	src._observer_ = new IntersectionObserver(check);
	src._cancelThrottle_ = check.cancel;
	src._observer_.observe(src);
}

export const appearDirective = {
	mounted(src, binding) {
		observe(src, binding.value);
	},

	updated(src, binding) {
		if (binding.value !== binding.oldValue) {
			observe(src, binding.value);
		}
	},

	unmounted(src) {
		stopObserving(src);
	},
} as Directive<HTMLElementWithObserver, (() => Awaitable<void>) | null | undefined>;
