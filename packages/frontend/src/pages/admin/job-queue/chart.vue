<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkDataChart :series="series" :ariaLabel="i18n.ts.jobQueue" :height="220" :detailed="false"/>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import MkDataChart, { type DataChartPoint } from '@/components/MkDataChart.vue';
import { i18n } from '@/i18n.js';
import { chartText } from '@/utility/chart-i18n.js';

const props = defineProps<{ dataSet: { completed: number[]; failed: number[] }; aspectRatio?: number }>();
function points(values: number[]): DataChartPoint[] {
	const now = Date.now();
	return values.map((y, index) => ({ x: now - (values.length - index - 1) * 1000, y }));
}
const series = computed(() => [
	{ name: chartText('completed'), type: 'area' as const, data: points(props.dataSet.completed) },
	{ name: chartText('failed'), type: 'area' as const, data: points(props.dataSet.failed) },
]);
</script>
