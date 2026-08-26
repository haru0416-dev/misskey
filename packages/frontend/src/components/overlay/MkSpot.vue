<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" :style="{ zIndex }">
	<div :class="$style.spot"></div>
	<div ref="bodyEl" role="dialog" :aria-label="title" :class="$style.body" class="_panel _shadow">
		<div class="_gaps_s">
			<div><b>{{ title }}</b></div>
			<div>{{ description }}</div>
			<div class="_buttons">
				<MkButton v-if="hasPrev" small @click="prev"><i class="ti ti-arrow-left" aria-hidden="true"></i> {{ i18n.ts.goBack }}</MkButton>
				<MkButton v-if="hasNext" small primary @click="next">{{ i18n.ts.next }} <i class="ti ti-arrow-right" aria-hidden="true"></i></MkButton>
				<MkButton v-else small primary @click="next">{{ i18n.ts.done }} <i class="ti ti-check" aria-hidden="true"></i></MkButton>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import { calcPopupPosition } from '@/utility/popup-position.js';
import * as os from '@/os.js';
import MkButton from '@/components/form/MkButton.vue';
import { i18n } from '@/i18n.js';
import { throttleByAnimationFrame } from '@/utility/throttle-by-animation-frame.js';

const props = withDefaults(defineProps<{
	title: string;
	description: string;
	anchorElement?: HTMLElement;
	direction?: 'top' | 'bottom' | 'right' | 'left';
	hasPrev: boolean;
	hasNext: boolean;
}>(), {
	direction: 'top',
});

const emit = defineEmits<{
	(prev: 'prev'): void;
	(next: 'next'): void;
}>();

function prev() {
	emit('prev');
}

function next() {
	emit('next');
}

const bodyEl = useTemplateRef('bodyEl');
const zIndex = os.claimZIndex('high');
const spotX = ref(0);
const spotY = ref(0);
const spotWidth = ref(0);
const spotHeight = ref(0);

function setPosition() {
	if (bodyEl.value == null) return;
	if (props.anchorElement == null) return;

	const rect = props.anchorElement.getBoundingClientRect();
	spotX.value = rect.left;
	spotY.value = rect.top;
	spotWidth.value = rect.width;
	spotHeight.value = rect.height;

	const data = calcPopupPosition(bodyEl.value, {
		anchorElement: props.anchorElement,
		direction: props.direction,
		align: 'center',
		innerMargin: 16,
	});

	bodyEl.value.style.transformOrigin = data.transformOrigin;
	bodyEl.value.style.left = data.left + 'px';
	bodyEl.value.style.top = data.top + 'px';
}

const schedulePosition = throttleByAnimationFrame(setPosition);
let resizeObserver: ResizeObserver | null = null;

watch(() => props.anchorElement, (newAnchor, oldAnchor) => {
	if (oldAnchor != null) resizeObserver?.unobserve(oldAnchor);
	if (newAnchor != null) resizeObserver?.observe(newAnchor);
	schedulePosition();
}, { flush: 'post' });

watch(() => props.direction, schedulePosition, { flush: 'post' });

onMounted(() => {
	resizeObserver = new ResizeObserver(schedulePosition);
	if (props.anchorElement != null) resizeObserver.observe(props.anchorElement);
	if (bodyEl.value != null) resizeObserver.observe(bodyEl.value);
	window.addEventListener('resize', schedulePosition, { passive: true });
	window.addEventListener('scroll', schedulePosition, { passive: true, capture: true });
	nextTick(schedulePosition);
});

onUnmounted(() => {
	resizeObserver?.disconnect();
	window.removeEventListener('resize', schedulePosition);
	window.removeEventListener('scroll', schedulePosition, { capture: true });
	schedulePosition.cancel();
});
</script>

<style lang="scss" module>
.root {
	position: fixed;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
}

.spot {
	--x: v-bind("spotX + 'px'");
	--y: v-bind("spotY + 'px'");
	--width: v-bind("spotWidth + 'px'");
	--height: v-bind("spotHeight + 'px'");
	--padding: var(--MI-space-sm);
	position: absolute;
	left: calc(var(--x) - var(--padding));
	top: calc(var(--y) - var(--padding));
	width: calc(var(--width) + var(--padding) * 2);
	height: calc(var(--height) + var(--padding) * 2);
	box-sizing: border-box;
	border: 1px solid transparent;
	border-radius: var(--MI-radius-lg);
	box-shadow: 0 0 0 9999px var(--MI_THEME-modalBg);
	transition: left var(--MI-duration-normal) var(--MI-ease-out), top var(--MI-duration-normal) var(--MI-ease-out), width var(--MI-duration-normal) var(--MI-ease-out), height var(--MI-duration-normal) var(--MI-ease-out);
	animation: blink 1s infinite;
}

.body {
	position: absolute;
	padding: var(--MI-space-lg) var(--MI-space-xl);
	box-sizing: border-box;
	width: max-content;
	max-width: min(500px, calc(100vw - var(--MI-space-lg) * 2));
}

@keyframes blink {
	0%, 100% {
		background: color(from var(--MI_THEME-accent) srgb r g b / 0.1);
		border: 1px solid color(from var(--MI_THEME-accent) srgb r g b / 0.75);
	}
	50% {
		background: transparent;
		border: 1px solid transparent;
	}
}

@media (prefers-reduced-motion: reduce) {
	.spot {
		animation: none;
		transition: none;
	}
}
</style>
