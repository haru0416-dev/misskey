<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<svg :viewBox="`0 0 ${ viewBoxX } ${ viewBoxY }`" :class="$style.root" @mousedown.prevent="onMousedown">
	<polyline
		:points="pointsNote"
		:class="$style.note"
		fill="none"
		stroke-width="1"
	/>
	<polyline
		:points="pointsReply"
		:class="$style.reply"
		fill="none"
		stroke-width="1"
	/>
	<polyline
		:points="pointsRenote"
		:class="$style.renote"
		fill="none"
		stroke-width="1"
	/>
	<polyline
		:points="pointsTotal"
		:class="$style.total"
		fill="none"
		stroke-width="1"
		stroke-dasharray="2 2"
	/>
</svg>
</template>

<script lang="ts" setup>
import { onUnmounted, ref, watch } from 'vue';
import type { AnimationFrameThrottled } from '@/utility/throttle-by-animation-frame.js';
import { throttleByAnimationFrame } from '@/utility/throttle-by-animation-frame.js';

const props = defineProps<{
	activity: {
		total: number;
		notes: number;
		replies: number;
		renotes: number;
	}[]
}>();

const viewBoxX = ref(147);
const viewBoxY = ref(60);
const zoom = ref(1);
const pos = ref(0);
const pointsNote = ref<string>();
const pointsReply = ref<string>();
const pointsRenote = ref<string>();
const pointsTotal = ref<string>();
let activity = props.activity.slice().reverse();
let peak = Math.max(0, ...activity.map(d => d.total));
let dragHandler: AnimationFrameThrottled<[MouseEvent]> | null = null;

function startDragging(handler: AnimationFrameThrottled<[MouseEvent]>) {
	stopDragging();
	dragHandler = handler;
	window.addEventListener('mousemove', dragHandler);
	window.addEventListener('mouseleave', stopDragging);
	window.addEventListener('mouseup', stopDragging);
}

function stopDragging() {
	if (dragHandler == null) return;
	dragHandler.flush();
	window.removeEventListener('mousemove', dragHandler);
	window.removeEventListener('mouseleave', stopDragging);
	window.removeEventListener('mouseup', stopDragging);
	dragHandler = null;
}

function onMousedown(ev: MouseEvent) {
	const clickX = ev.clientX;
	const clickY = ev.clientY;
	const baseZoom = zoom.value;
	const basePos = pos.value;

	// 動かした時
	startDragging(throttleByAnimationFrame(me => {
		const moveLeft = me.clientX - clickX;
		const moveTop = me.clientY - clickY;

		zoom.value = Math.max(1, baseZoom + (-moveTop / 20));
		const minPos = Math.min(0, viewBoxX.value - ((activity.length - 1) * zoom.value));
		pos.value = Math.max(minPos, Math.min(0, basePos + moveLeft));

		render();
	}));
}

function render() {
	if (peak === 0) {
		pointsNote.value = undefined;
		pointsReply.value = undefined;
		pointsRenote.value = undefined;
		pointsTotal.value = undefined;
		return;
	}

	const nextPointsNote: string[] = [];
	const nextPointsReply: string[] = [];
	const nextPointsRenote: string[] = [];
	const nextPointsTotal: string[] = [];
	for (const [i, data] of activity.entries()) {
		const x = (i * zoom.value) + pos.value;
		nextPointsNote.push(`${x},${(1 - (data.notes / peak)) * viewBoxY.value}`);
		nextPointsReply.push(`${x},${(1 - (data.replies / peak)) * viewBoxY.value}`);
		nextPointsRenote.push(`${x},${(1 - (data.renotes / peak)) * viewBoxY.value}`);
		nextPointsTotal.push(`${x},${(1 - (data.total / peak)) * viewBoxY.value}`);
	}
	pointsNote.value = nextPointsNote.join(' ');
	pointsReply.value = nextPointsReply.join(' ');
	pointsRenote.value = nextPointsRenote.join(' ');
	pointsTotal.value = nextPointsTotal.join(' ');
}

watch(() => props.activity, (nextActivity) => {
	activity = nextActivity.slice().reverse();
	peak = Math.max(0, ...activity.map(d => d.total));
	render();
}, { immediate: true });

onUnmounted(() => {
	if (dragHandler == null) return;
	dragHandler.cancel();
	window.removeEventListener('mousemove', dragHandler);
	window.removeEventListener('mouseleave', stopDragging);
	window.removeEventListener('mouseup', stopDragging);
	dragHandler = null;
});
</script>

<style lang="scss" module>
.root {
	display: block;
	padding: 16px;
	width: 100%;
	box-sizing: border-box;
	cursor: all-scroll;
}

.note {
	stroke: var(--MI_THEME-link);
}

.reply {
	stroke: var(--MI_THEME-error);
}

.renote {
	stroke: var(--MI_THEME-renote);
}

.total {
	stroke: var(--MI_THEME-fg);
	stroke-opacity: 0.45;
}
</style>
