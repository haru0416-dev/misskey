<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkDataChart :series="series" :ariaLabel="i18n.ts.jobQueue" :height="220" :detailed="false"/>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import MkDataChart from '@/features/chart/components/MkDataChart.vue';
import type { DataChartPoint } from '@/features/chart/components/MkDataChart.vue';
import { i18n } from '@/i18n.js';
import { chartText } from '@/features/chart/chart-i18n.js';

const props = defineProps<{ dataSet: { completed: number[]; failed: number[] }; aspectRatio?: number }>();
function points(values: number[]): DataChartPoint[] {
	const now = Date.now();
	return values.map((y, index) => ({ x: now - (values.length - index - 1) * 1000, y }));
}
function themeColor(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
// 並び順の色だと失敗が success の緑になるので、意味の色を指定する。dataSet は毎秒入れ替わるのでテーマの切り替えにも追従する
const series = computed(() => [
	{ name: chartText('completed'), type: 'area' as const, data: points(props.dataSet.completed), color: themeColor('--MI_THEME-success') },
	{ name: chartText('failed'), type: 'area' as const, data: points(props.dataSet.failed), color: themeColor('--MI_THEME-error') },
]);
</script>
