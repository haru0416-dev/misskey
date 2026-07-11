<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<span>
	<span v-text="hh"></span>
	<span :class="[$style.colon, { [$style.showColon]: showColon }]">:</span>
	<span v-text="mm"></span>
	<span v-if="showS" :class="[$style.colon, { [$style.showColon]: showColon }]">:</span>
	<span v-if="showS" v-text="ss"></span>
	<span v-if="showMs" :class="[$style.colon, { [$style.showColon]: showColon }]">:</span>
	<span v-if="showMs" v-text="ms"></span>
</span>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { defaultIdlingRenderScheduler } from '@/utility/idle-render.js';
import { ClockScheduler } from '@/utility/clock-scheduler.js';

const props = withDefaults(defineProps<{
	showS?: boolean;
	showMs?: boolean;
	offset?: number;
	now?: () => Date;
}>(), {
	showS: true,
	showMs: false,
	offset: 0 - new Date().getTimezoneOffset(),
	now: () => new Date(),
});

const hh = ref('');
const mm = ref('');
const ss = ref('');
const ms = ref('');
const showColon = ref(false);
let prevSec: number | null = null;
let colonTimerId: number | null = null;
let mounted = false;

watch(showColon, (v) => {
	if (v) {
		if (colonTimerId != null) window.clearTimeout(colonTimerId);
		colonTimerId = window.setTimeout(() => {
			showColon.value = false;
			colonTimerId = null;
		}, 30);
	}
});

const tick = (): Date => {
	const now = props.now();
	now.setMinutes(now.getMinutes() + now.getTimezoneOffset() + props.offset);
	hh.value = now.getHours().toString().padStart(2, '0');
	mm.value = now.getMinutes().toString().padStart(2, '0');
	ss.value = now.getSeconds().toString().padStart(2, '0');
	ms.value = Math.floor(now.getMilliseconds() / 10).toString().padStart(2, '0');
	if (now.getSeconds() !== prevSec) showColon.value = true;
	prevSec = now.getSeconds();
	return now;
};

tick();

const clockScheduler = new ClockScheduler(() => {
	const now = tick();
	return 1000 - now.getMilliseconds();
});

function updateScheduler(): void {
	if (!mounted) return;
	if (props.showMs) {
		clockScheduler.stop();
		defaultIdlingRenderScheduler.add(tick);
	} else {
		defaultIdlingRenderScheduler.delete(tick);
		clockScheduler.start();
	}
}

watch(() => props.showMs, updateScheduler);

onMounted(() => {
	mounted = true;
	updateScheduler();
});

onUnmounted(() => {
	mounted = false;
	defaultIdlingRenderScheduler.delete(tick);
	clockScheduler.stop();
	if (colonTimerId != null) window.clearTimeout(colonTimerId);
});
</script>

<style lang="scss" module>
.colon {
	opacity: 0;
	transition: opacity 1s ease;

	&.showColon {
		opacity: 1;
		transition: opacity 0s;
	}
}
</style>
