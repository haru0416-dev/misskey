/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Directive } from 'vue';
import MkRippleEffect from '@/components/effects/MkRippleEffect.vue';
import { prefer } from '@/preferences.js';
import { popup } from '@/os.js';

const clickHandlers = new WeakMap<HTMLElement, () => void>();

export const rippleDirective = {
	mounted(el, binding) {
		// 明示的に false であればバインドしない
		if (binding.value === false) return;
		if (!prefer.animation) return;

		const onClick = () => {
			const rect = el.getBoundingClientRect();

			const x = rect.left + el.offsetWidth / 2;
			const y = rect.top + el.offsetHeight / 2;

			const { dispose } = popup(
				MkRippleEffect,
				{ x, y },
				{
					end: () => dispose(),
				},
			);
		};
		clickHandlers.set(el, onClick);
		el.addEventListener('click', onClick);
	},

	unmounted(el) {
		const onClick = clickHandlers.get(el);
		if (onClick == null) return;
		el.removeEventListener('click', onClick);
		clickHandlers.delete(el);
	},
} as Directive<HTMLElement, boolean | undefined>;
