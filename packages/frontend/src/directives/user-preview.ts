/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineAsyncComponent, ref } from 'vue';
import type { Directive } from 'vue';
import type * as Misskey from 'misskey-js';
import { popup } from '@/os.js';
import { isTouchUsing } from '@/utility/touch.js';

const MkUserPopup = defineAsyncComponent(() => import('@/components/MkUserPopup.vue'));

export class UserPreview {
	private el: HTMLElement;
	private user: string | Misskey.entities.UserDetailed;
	private showTimer: number | null = null;
	private hideTimer: number | null = null;
	private promise: null | { cancel: () => void } = null;

	constructor(el: HTMLElement, user: string | Misskey.entities.UserDetailed) {
		this.el = el;
		this.user = user;

		this.show = this.show.bind(this);
		this.close = this.close.bind(this);
		this.onMouseover = this.onMouseover.bind(this);
		this.onMouseleave = this.onMouseleave.bind(this);
		this.onClick = this.onClick.bind(this);
		this.attach = this.attach.bind(this);
		this.detach = this.detach.bind(this);

		this.attach();
	}

	private show() {
		if (!window.document.body.contains(this.el)) return;
		if (this.promise) return;

		const showing = ref(true);

		const { dispose } = popup(
			MkUserPopup,
			{
				showing,
				q: this.user,
				source: this.el,
			},
			{
				mouseover: () => {
					if (this.hideTimer) window.clearTimeout(this.hideTimer);
				},
				mouseleave: () => {
					if (this.showTimer) window.clearTimeout(this.showTimer);
					this.hideTimer = window.setTimeout(this.close, 500);
				},
				closed: () => dispose(),
			},
		);

		this.promise = {
			cancel: () => {
				showing.value = false;
			},
		};
	}

	private close() {
		if (this.promise) {
			this.promise.cancel();
			this.promise = null;
		}
	}

	private onMouseover() {
		if (this.showTimer) window.clearTimeout(this.showTimer);
		if (this.hideTimer) window.clearTimeout(this.hideTimer);
		this.showTimer = window.setTimeout(this.show, 500);
	}

	private onMouseleave() {
		if (this.showTimer) window.clearTimeout(this.showTimer);
		if (this.hideTimer) window.clearTimeout(this.hideTimer);
		this.hideTimer = window.setTimeout(this.close, 500);
	}

	private onClick() {
		if (this.showTimer) window.clearTimeout(this.showTimer);
		this.close();
	}

	public attach() {
		this.el.addEventListener('mouseover', this.onMouseover);
		this.el.addEventListener('mouseleave', this.onMouseleave);
		this.el.addEventListener('click', this.onClick);
	}

	public detach() {
		if (this.showTimer) window.clearTimeout(this.showTimer);
		if (this.hideTimer) window.clearTimeout(this.hideTimer);
		this.close();
		this.el.removeEventListener('mouseover', this.onMouseover);
		this.el.removeEventListener('mouseleave', this.onMouseleave);
		this.el.removeEventListener('click', this.onClick);
	}
}

const userPreviews = new WeakMap<HTMLElement, UserPreview>();

function detachPreview(el: HTMLElement) {
	const preview = userPreviews.get(el);
	if (preview == null) return;

	preview.detach();
	userPreviews.delete(el);
}

function attachPreview(el: HTMLElement, user: string | Misskey.entities.UserDetailed | null | undefined) {
	if (user == null || isTouchUsing) return;
	userPreviews.set(el, new UserPreview(el, user));
}

export const userPreviewDirective = {
	mounted(el, binding) {
		attachPreview(el, binding.value);
	},

	updated(el, binding) {
		if (binding.value === binding.oldValue) return;
		detachPreview(el);
		attachPreview(el, binding.value);
	},

	unmounted(el) {
		detachPreview(el);
	},
} as Directive<HTMLElement, string | Misskey.entities.UserDetailed | null | undefined>;
