/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { onMounted, onUnmounted } from 'vue';
import type { Ref } from 'vue';

export function useFormControlPadding(
	inputEl: Readonly<Ref<HTMLElement | null>>,
	prefixEl: Readonly<Ref<HTMLElement | null>>,
	suffixEl: Readonly<Ref<HTMLElement | null>>,
): void {
	let resizeObserver: ResizeObserver | null = null;

	function updatePadding(): void {
		if (inputEl.value == null) return;
		const prefixWidth = prefixEl.value?.offsetWidth ?? 0;
		const suffixWidth = suffixEl.value?.offsetWidth ?? 0;
		inputEl.value.style.paddingLeft = prefixWidth > 0 ? `${prefixWidth}px` : '';
		inputEl.value.style.paddingRight = suffixWidth > 0 ? `${suffixWidth}px` : '';
	}

	onMounted(() => {
		resizeObserver = new ResizeObserver(updatePadding);
		if (prefixEl.value) resizeObserver.observe(prefixEl.value);
		if (suffixEl.value) resizeObserver.observe(suffixEl.value);
		updatePadding();
	});

	onUnmounted(() => {
		resizeObserver?.disconnect();
		resizeObserver = null;
	});
}
