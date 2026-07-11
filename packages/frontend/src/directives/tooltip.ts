/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineAsyncComponent, ref } from 'vue';
import type { Directive } from 'vue';
import { popup, alert } from '@/os.js';
import { genId } from '@/utility/id.js';

const MOUSEENTER_IGNORE_DURATION = 1000;
const MkTooltip = defineAsyncComponent(() => import('@/components/overlay/MkTooltip.vue'));

type TooltipDirectiveState = {
	text: string | null | undefined;
	closePopup: null | (() => void);
	showTimer: number | null;
	hideTimer: number | null;
	ignoreMouseenterUntil: number;
	show: () => void;
	close: () => void;
	cleanup: () => void;
};

const tooltipStates = new WeakMap<HTMLElement, TooltipDirectiveState>();

type TooltipDirectiveModifiers = 'left' | 'right' | 'top' | 'bottom' | 'mfm' | 'noDelay';
type TooltipDirectiveArg = 'dialog';

export const tooltipDirective = {
	mounted(el, binding) {
		const delay = binding.modifiers.noDelay ? 0 : 100;
		const tooltipId = genId();
		const addDescription = () => {
			const describedBy = new Set((el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
			describedBy.add(tooltipId);
			el.setAttribute('aria-describedby', [...describedBy].join(' '));
		};
		const removeDescription = () => {
			const describedBy = new Set((el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
			describedBy.delete(tooltipId);
			if (describedBy.size === 0) {
				el.removeAttribute('aria-describedby');
			} else {
				el.setAttribute('aria-describedby', [...describedBy].join(' '));
			}
		};
		const self: TooltipDirectiveState = {
			text: binding.value,
			closePopup: null,
			showTimer: null,
			hideTimer: null,
			ignoreMouseenterUntil: 0,
			show: () => {},
			close: () => {},
			cleanup: () => {},
		};

		self.close = () => {
			removeDescription();
			if (self.closePopup == null) return;
			const closePopup = self.closePopup;
			self.closePopup = null;
			closePopup();
		};

		self.show = () => {
			if (!window.document.body.contains(el)) return;
			if (self.closePopup) return;
			if (self.text == null) return;

			const showing = ref(true);
			addDescription();
			const { dispose } = popup(
				MkTooltip,
				{
					id: tooltipId,
					showing,
					text: self.text,
					asMfm: binding.modifiers.mfm,
					direction: binding.modifiers.left
						? 'left'
						: binding.modifiers.right
							? 'right'
							: binding.modifiers.top
								? 'top'
								: binding.modifiers.bottom
									? 'bottom'
									: 'top',
					anchorElement: el,
				},
				{
					closed: () => dispose(),
				},
			);

			self.closePopup = () => {
				showing.value = false;
			};
		};

		const clearShowTimer = () => {
			if (self.showTimer == null) return;
			window.clearTimeout(self.showTimer);
			self.showTimer = null;
		};
		const clearHideTimer = () => {
			if (self.hideTimer == null) return;
			window.clearTimeout(self.hideTimer);
			self.hideTimer = null;
		};
		let isMouseHovering = false;
		let isTouching = false;
		let isFocused = false;
		const startTooltip = () => {
			clearShowTimer();
			clearHideTimer();
			if (delay === 0) {
				self.show();
			} else {
				self.showTimer = window.setTimeout(self.show, delay);
			}
		};
		const endTooltip = () => {
			clearShowTimer();
			clearHideTimer();
			if (delay === 0) {
				self.close();
			} else {
				self.hideTimer = window.setTimeout(self.close, delay);
			}
		};
		const endTooltipIfUninterested = () => {
			if (isMouseHovering || isTouching || isFocused) return;
			endTooltip();
		};
		const onMouseenter = () => {
			if (Date.now() < self.ignoreMouseenterUntil) return;
			isMouseHovering = true;
			startTooltip();
		};
		const onMouseleave = () => {
			isMouseHovering = false;
			endTooltipIfUninterested();
		};
		const onTouchstart = () => {
			self.ignoreMouseenterUntil = Date.now() + MOUSEENTER_IGNORE_DURATION;
			isTouching = true;
			startTooltip();
		};
		const onTouchend = () => {
			self.ignoreMouseenterUntil = Date.now() + MOUSEENTER_IGNORE_DURATION;
			isTouching = false;
			endTooltipIfUninterested();
		};
		const onFocus = () => {
			isFocused = true;
			startTooltip();
		};
		const onBlur = () => {
			isFocused = false;
			endTooltipIfUninterested();
		};
		const onSelectstart = (ev: Event) => {
			ev.preventDefault();
		};
		const onClick = (ev: MouseEvent) => {
			clearShowTimer();
			self.close();
			if (binding.arg !== 'dialog' || self.text == null) return;
			ev.preventDefault();
			ev.stopPropagation();
			void alert({
				type: 'info',
				text: self.text,
			});
		};
		const onKeydown = (ev: KeyboardEvent) => {
			if (ev.key !== 'Escape') return;
			clearShowTimer();
			clearHideTimer();
			self.close();
		};

		el.addEventListener('mouseenter', onMouseenter, { passive: true });
		el.addEventListener('mouseleave', onMouseleave, { passive: true });
		el.addEventListener('touchstart', onTouchstart, { passive: true });
		el.addEventListener('touchend', onTouchend, { passive: true });
		el.addEventListener('touchcancel', onTouchend, { passive: true });
		el.addEventListener('focus', onFocus, { passive: true });
		el.addEventListener('blur', onBlur, { passive: true });
		el.addEventListener('selectstart', onSelectstart);
		el.addEventListener('click', onClick);
		el.addEventListener('keydown', onKeydown);

		self.cleanup = () => {
			clearShowTimer();
			clearHideTimer();
			self.close();
			el.removeEventListener('mouseenter', onMouseenter);
			el.removeEventListener('mouseleave', onMouseleave);
			el.removeEventListener('touchstart', onTouchstart);
			el.removeEventListener('touchend', onTouchend);
			el.removeEventListener('touchcancel', onTouchend);
			el.removeEventListener('focus', onFocus);
			el.removeEventListener('blur', onBlur);
			el.removeEventListener('selectstart', onSelectstart);
			el.removeEventListener('click', onClick);
			el.removeEventListener('keydown', onKeydown);
		};

		tooltipStates.set(el, self);
	},

	updated(el, binding) {
		const self = tooltipStates.get(el);
		if (self == null) return;
		if (self.text === binding.value) return;
		self.text = binding.value;
		self.close();
	},

	unmounted(el) {
		const self = tooltipStates.get(el);
		if (self == null) return;
		self.cleanup();
		tooltipStates.delete(el);
	},
} as Directive<HTMLElement, string | null | undefined, TooltipDirectiveModifiers, TooltipDirectiveArg>;
