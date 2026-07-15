<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Transition
	:enterActiveClass="prefer.animation ? $style.transition_root_enterActive : ''"
	:leaveActiveClass="prefer.animation ? $style.transition_root_leaveActive : ''"
	:enterFromClass="prefer.animation ? $style.transition_root_enterFrom : ''"
	:leaveToClass="prefer.animation ? $style.transition_root_leaveTo : ''"
	:duration="{ enter: prefer.animation ? openAnimDuration : 0, leave: prefer.animation ? closeAnimDuration : 0 }"
	appear
	@afterLeave="onAfterLeave"
>
	<div v-show="showing" ref="rootEl" v-hotkey="keymap" :class="$style.root" :style="{ zIndex }" role="dialog" aria-modal="true" :aria-label="String(i18n.ts.image)" tabindex="-1" @keydown.capture="onKeydownCapture">
		<div :class="$style.bg" class="_modalBg"></div>
		<div :class="$style.main">
			<div
				:class="[$style.items, { [$style.itemsTransition]: enableSlideTransition }]"
				:style="{ translate: `${contentsOffset}px 0` }"
				@transitionend.self="onSlideTransitionFinished"
				@transitioncancel.self="onSlideTransitionFinished"
			>
				<div v-for="(content, i) in contents" :key="content.url" :class="$style.item" :inert="i !== currentIndex" :aria-hidden="i !== currentIndex">
					<XItem
						:ref="comp => { if (comp != null) items.set(i, comp as InstanceType<typeof XItem>); }"
						:content="content"
						:initiallyOpened="i === (defaultIndex ?? 0)"
						:activated="activatedIndexes.has(i)"
						@close="closeGallery"
						@horizontalSwipe="onHorizontalSwipe"
						@prev="onPrev"
						@next="onNext"
						@cancelHorizontalSwipe="scrollToCurrentIndex"
					/>
				</div>
			</div>
			<button v-if="!isTouchUsing && currentIndex > 0" type="button" class="_button" :class="$style.prevButton" :aria-label="String(i18n.ts.goBack)" @click="onPrev"><span :class="$style.buttonIcon"><i class="ti ti-arrow-left"></i></span></button>
			<button v-if="!isTouchUsing && currentIndex < contents.length - 1" type="button" class="_button" :class="$style.nextButton" :aria-label="String(i18n.ts.next)" @click="onNext"><span :class="$style.buttonIcon"><i class="ti ti-arrow-right"></i></span></button>
		</div>
	</div>
</Transition>
</template>

<script lang="ts" setup>
import { nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import XItem from '@/features/media-viewer/components/MkLightbox.item.vue';
import type { LightboxContent } from '@/features/media-viewer/components/MkLightbox.item.vue';
import type { Keymap } from '@/utility/hotkey.js';
import * as os from '@/os.js';
import { prefer } from '@/preferences.js';
import { isTouchUsing } from '@/utility/touch.js';
import { i18n } from '@/i18n.js';
import { focusTrap } from '@/utility/focus-trap.js';

const props = defineProps<{ defaultIndex?: number; contents: LightboxContent[] }>();
const emit = defineEmits<{ (ev: 'closed'): void }>();
const rootEl = useTemplateRef('rootEl');
const openAnimDuration = 200;
const closeAnimDuration = 200;
const slideAnimDuration = 300;
const zIndex = os.claimZIndex('high');
const showing = ref(true);
const activatedIndexes = ref(new Set<number>());
const items = new Map<number, InstanceType<typeof XItem>>();
const currentIndex = ref(props.defaultIndex ?? 0);
const screenWidth = ref(window.innerWidth);
const contentsOffset = ref(currentIndex.value * -window.innerWidth);
const enableSlideTransition = ref(false);
let currentScrollLeft = contentsOffset.value;
let activeEl: HTMLElement | null = null;
let releaseFocusTrap: (() => void) | null = null;
let closeRequested = false;
let historyEntryActive = false;

watch(currentIndex, (newIndex, oldIndex) => {
	activatedIndexes.value.add(newIndex);
	void nextTick(() => {
		if (oldIndex != null) items.get(oldIndex)?.onDeactive();
		items.get(newIndex)?.onActive();
	});
}, { immediate: true });

watch(currentIndex, newIndex => {
	for (const [i, content] of props.contents.entries()) {
		const source = content.sourceElement;
		if (source != null) source.style.visibility = i === newIndex ? 'hidden' : '';
	}
}, { immediate: true });

function scrollToCurrentIndex() {
	const targetOffset = currentIndex.value * -screenWidth.value;
	currentScrollLeft = targetOffset;
	if (!prefer.animation || contentsOffset.value === targetOffset) enableSlideTransition.value = false;
	else enableSlideTransition.value = true;
	contentsOffset.value = targetOffset;
}

function onHorizontalSwipe(offset: number) {
	const atEdge = (currentIndex.value === 0 && offset > 0) || (currentIndex.value === props.contents.length - 1 && offset < 0);
	contentsOffset.value = currentScrollLeft + (atEdge ? offset / 3 : offset);
}

function onNext() {
	if (currentIndex.value < props.contents.length - 1) currentIndex.value++;
	scrollToCurrentIndex();
	refocusRootIfNeeded();
}

function onPrev() {
	if (currentIndex.value > 0) currentIndex.value--;
	scrollToCurrentIndex();
	refocusRootIfNeeded();
}

function refocusRootIfNeeded() {
	void nextTick(() => {
		const root = rootEl.value;
		const activeElement = window.document.activeElement;
		const focusIsInert = activeElement instanceof Element && activeElement.closest('[inert]') != null;
		if (root != null && (!root.contains(activeElement) || focusIsInert)) root.focus({ preventScroll: true });
	});
}


function closeGallery(fromPopState = false) {
	if (!showing.value) return;
	showing.value = false;
	if (!fromPopState && historyEntryActive && window.location.hash === '#pswp') {
		historyEntryActive = false;
		window.history.back();
	}
}

function close() {
	if (closeRequested || !showing.value) return;
	closeRequested = true;
	const item = items.get(currentIndex.value);
	if (item != null) item.closeThis();
	else closeGallery();
}

function onAfterLeave() {
	for (const content of props.contents) if (content.sourceElement != null) content.sourceElement.style.visibility = '';
	releaseFocusTrap?.();
	releaseFocusTrap = null;
	activeEl?.focus({ preventScroll: true });
	emit('closed');
}

function onSlideTransitionFinished(ev: TransitionEvent) {
	if (ev.propertyName === 'translate') enableSlideTransition.value = false;
}

function onResize() {
	screenWidth.value = window.innerWidth;
	scrollToCurrentIndex();
}

function onPopState() {
	historyEntryActive = false;
	closeRequested = true;
	closeGallery(true);
}

function onKeydownCapture(ev: KeyboardEvent) {
	if (ev.key !== 'Escape') return;
	ev.preventDefault();
	ev.stopPropagation();
	close();
}

const keymap = {
	esc: () => close(),
	left: { allowRepeat: true, callback: onPrev },
	right: { allowRepeat: true, callback: onNext },
} as const satisfies Keymap;

onMounted(() => {
	activeEl = window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null;
	window.history.pushState(null, '', '#pswp');
	historyEntryActive = true;
	if (rootEl.value != null) {
		releaseFocusTrap = focusTrap(rootEl.value).release;
		rootEl.value.focus({ preventScroll: true });
	}
	window.addEventListener('resize', onResize, { passive: true });
	window.addEventListener('popstate', onPopState);
});

onBeforeUnmount(() => {
	releaseFocusTrap?.();
	releaseFocusTrap = null;
	window.removeEventListener('resize', onResize);
	window.removeEventListener('popstate', onPopState);
	for (const content of props.contents) if (content.sourceElement != null) content.sourceElement.style.visibility = '';
});

defineExpose({ close });
</script>

<style lang="scss" module>
.transition_root_enterActive, .transition_root_leaveActive { > .bg { transition: opacity v-bind("closeAnimDuration + 'ms'"); } }
.transition_root_enterFrom, .transition_root_leaveTo { pointer-events: none; > .bg { opacity: 0; } }
.root { position: fixed; inset: 0; }
.main, .bg { position: absolute; inset: 0; }
.items { position: absolute; display: flex; width: calc(v-bind("screenWidth + 'px'") * v-bind("props.contents.length")); height: 100dvh; overflow: clip; contain: strict; }
.itemsTransition { pointer-events: none; transition: translate v-bind("slideAnimDuration + 'ms'") cubic-bezier(0.45, 0, 0.55, 1); }
.item { width: 100dvw; height: 100dvh; overflow: clip; contain: strict; flex-shrink: 0; }
.prevButton, .nextButton { position: absolute; top: 0; width: 70px; height: 100%; display: grid; place-items: center; }
.prevButton { left: 0; }
.nextButton { right: 0; }
.buttonIcon { width: 45px; height: 45px; display: grid; place-items: center; background-color: rgba(0, 0, 0, 0.3); border-radius: 100%; color: #fff; }
</style>
