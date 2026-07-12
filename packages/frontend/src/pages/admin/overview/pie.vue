<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div ref="chartEl" :class="$style.chart" role="img" :aria-label="ariaLabel"></div>
	<ul :class="$style.legend">
		<li v-for="item in data" :key="item.name">
			<button type="button" :disabled="item.onClick == null" @click="item.onClick?.()">
				<span :class="$style.swatch" :style="{ backgroundColor: item.color ?? 'var(--MI_THEME-fg)' }"></span>
				<span>{{ item.name }}</span><strong>{{ numberFormat.format(item.value) }}</strong>
			</button>
		</li>
	</ul>
</div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue';
import { use, init, type ECharts } from 'echarts/core';
import { PieChart } from 'echarts/charts';
import { AriaComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { i18n } from '@/i18n.js';

use([PieChart, AriaComponent, TooltipComponent, SVGRenderer]);
export type InstanceForPie = { name: string; color: string | null; value: number; onClick?: () => void };
const props = defineProps<{ data: InstanceForPie[] }>();
const chartEl = useTemplateRef('chartEl');
const numberFormat = new Intl.NumberFormat();
const ariaLabel = computed(() => `${i18n.ts.statistics}: ${props.data.map(item => `${item.name} ${numberFormat.format(item.value)}`).join(', ')}`);
let chart: ECharts | null = null;
let observer: ResizeObserver | null = null;

function render() {
	if (chartEl.value == null) return;
	chart ??= init(chartEl.value, undefined, { renderer: 'svg' });
	chart.setOption({
		animation: false,
		aria: { enabled: true, description: ariaLabel.value },
		tooltip: {
			trigger: 'item',
			appendTo: 'body',
		},
		series: [{ type: 'pie', radius: ['48%', '78%'], avoidLabelOverlap: true, label: { show: false }, data: props.data.map(item => ({ name: item.name, value: item.value, itemStyle: { color: item.color ?? undefined } })) }],
	}, { notMerge: true });
	chart.off('click');
	chart.on('click', event => props.data[event.dataIndex]?.onClick?.());
}
watch(() => props.data, () => nextTick(render), { deep: true });
onMounted(() => { render(); if (chartEl.value) { observer = new ResizeObserver(() => chart?.resize()); observer.observe(chartEl.value); } });
onBeforeUnmount(() => { observer?.disconnect(); chart?.dispose(); });
</script>

<style lang="scss" module>
.root { display: grid; grid-template-columns: minmax(120px, 1fr) minmax(0, 1fr); align-items: center; gap: 8px; }
.chart { min-height: 220px; }
.legend { min-width: 0; margin: 0; padding: 0; list-style: none; }
.legend button { width: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 6px 8px; border: 0; border-radius: 8px; color: var(--MI_THEME-fg); background: transparent; text-align: start; font: inherit; }
.legend button:not(:disabled) { cursor: pointer; }
.legend button:not(:disabled):hover, .legend button:not(:disabled):focus-visible { background: var(--MI_THEME-buttonBg); }
.legend button > span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.swatch { width: 9px; height: 9px; border-radius: 50%; }
@media (max-width: 500px) { .root { grid-template-columns: 1fr; } .chart { min-height: 180px; } }
</style>
