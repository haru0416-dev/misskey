/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Directive } from 'vue';
import { prefer } from '@/preferences.js';

const cleanupByElement = new WeakMap<HTMLElement, () => void>();

export const clickAnimeDirective = {
	mounted(el) {
		if (!prefer.animation) return;

		const target = el.children[0];

		if (target == null) return;

	target.classList.add('_anime_bounce_standBy');

		const onMousedown = () => {
			target.classList.remove('_anime_bounce');

			target.classList.add('_anime_bounce_standBy');
			target.classList.add('_anime_bounce_ready');
		};

		const onMouseleave = () => {
			target.classList.remove('_anime_bounce_ready');
		};

		const onClick = () => {
			target.classList.add('_anime_bounce');
			target.classList.remove('_anime_bounce_ready');
		};

		const onAnimationend = () => {
			target.classList.remove('_anime_bounce');
			target.classList.add('_anime_bounce_standBy');
		};

		el.addEventListener('mousedown', onMousedown);
		target.addEventListener('mouseleave', onMouseleave);
		el.addEventListener('click', onClick);
		el.addEventListener('animationend', onAnimationend);

		cleanupByElement.set(el, () => {
			el.removeEventListener('mousedown', onMousedown);
			target.removeEventListener('mouseleave', onMouseleave);
			el.removeEventListener('click', onClick);
			el.removeEventListener('animationend', onAnimationend);
		});
	},

	unmounted(el) {
		cleanupByElement.get(el)?.();
		cleanupByElement.delete(el);
	},
} as Directive<HTMLElement>;
