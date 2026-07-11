/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Directive } from 'vue';

const timers = new WeakMap<HTMLElement, number>();

export const animDirective = {
	beforeMount(src) {
		src.style.opacity = '0';
		src.style.transform = 'scale(0.9)';
		// ページネーションと相性が悪いので
		src.classList.add('_zoom');
	},

	mounted(src) {
		const timer = window.setTimeout(() => {
			timers.delete(src);
			src.style.opacity = '1';
			src.style.transform = 'none';
		}, 1);
		timers.set(src, timer);
	},

	unmounted(src) {
		const timer = timers.get(src);
		if (timer == null) return;
		window.clearTimeout(timer);
		timers.delete(src);
	},
} as Directive<HTMLElement>;
