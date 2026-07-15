<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<svg :viewBox="`0 0 ${ viewBoxX } ${ viewBoxY }`" style="overflow:visible">
	<defs>
		<linearGradient :id="gradientId" x1="0" x2="0" y1="1" y2="0">
			<stop offset="0%" :stop-color="color" stop-opacity="0"></stop>
			<stop offset="100%" :stop-color="color" stop-opacity="0.65"></stop>
		</linearGradient>
	</defs>
	<template v-if="polylinePoints !== ''">
		<polygon
			:points="polygonPoints"
			:style="`stroke: none; fill: url(#${ gradientId });`"
		/>
		<polyline
			:points="polylinePoints"
			fill="none"
			:stroke="color"
			stroke-width="2"
		/>
		<circle
			:cx="headX ?? undefined"
			:cy="headY ?? undefined"
			r="3"
			:fill="color"
		/>
	</template>
</svg>
</template>

<script lang="ts" setup>
import { watch, ref } from 'vue';
import { genId } from '@/utility/id.js';
import { themeManager } from '@/theme.js';
import tinycolor from 'tinycolor2';

const props = defineProps<{
	src: number[];
}>();

const viewBoxX = 50;
const viewBoxY = 50;
const gradientId = genId();
const polylinePoints = ref('');
const polygonPoints = ref('');
const headX = ref<number | null>(null);
const headY = ref<number | null>(null);
const accent = tinycolor(themeManager.currentCompiledTheme!['accent']);
const color = accent.toRgbString();

function draw(): void {
	const stats = props.src.slice().reverse();
	if (stats.length === 0) {
		polylinePoints.value = '';
		polygonPoints.value = '';
		headX.value = null;
		headY.value = null;
		return;
	}
	const peak = Math.max.apply(null, stats) || 1;

	const _polylinePoints = stats.map((n, i) => [
		i * (viewBoxX / (stats.length - 1)),
		(1 - (n / peak)) * viewBoxY,
	]);

	polylinePoints.value = _polylinePoints.map(xy => `${xy[0]},${xy[1]}`).join(' ');

	polygonPoints.value = `0,${ viewBoxY } ${ polylinePoints.value } ${ viewBoxX },${ viewBoxY }`;

	const head = _polylinePoints.at(-1);
	headX.value = head?.[0] ?? null;
	headY.value = head?.[1] ?? null;
}

watch(() => props.src, draw, { deep: true, immediate: true });
</script>
