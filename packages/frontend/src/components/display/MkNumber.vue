<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span>{{ number(Math.floor(tweened)) }}</span>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import number from '@/filters/number.js';
import { prefer } from '@/preferences.js';

const props = defineProps<{
	value: number;
}>();

const tweened = ref(0);

watch([() => props.value, () => prefer.animation], ([to, shouldAnimate], _oldValue, onCleanup) => {
	const from = tweened.value;
	if (!shouldAnimate || from === to) {
		tweened.value = to;
		return;
	}

	// requestAnimationFrameを利用して、500msで現在の表示値から最新値までを1次関数的に変化させる
	let start: number | null = null;
	let frameId: number | null = null;

	function step(timestamp: number) {
		if (start === null) {
			start = timestamp;
		}
		const elapsed = timestamp - start;
		tweened.value = from + (to - from) * elapsed / 500;
		if (elapsed < 500) {
			frameId = window.requestAnimationFrame(step);
		} else {
			frameId = null;
			tweened.value = to;
		}
	}

	frameId = window.requestAnimationFrame(step);
	onCleanup(() => {
		if (frameId != null) window.cancelAnimationFrame(frameId);
	});
}, {
	immediate: true,
});
</script>
