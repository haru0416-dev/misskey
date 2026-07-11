<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div v-if="summarySeries.length > 0" :class="$style.summary" class="_selectable">
		<div v-for="item in summarySeries" :key="item.name" :class="$style.summaryItem">
			<span :class="$style.summaryLabel"><span :class="$style.swatch" :style="{ backgroundColor: item.color }"></span>{{ item.name }}</span>
			<strong :class="$style.summaryValue">{{ formatValue(item.latest) }}</strong>
			<span v-if="item.delta !== 0" :class="[$style.delta, item.delta > 0 ? $style.positive : $style.negative]">
				{{ item.delta > 0 ? '+' : '' }}{{ formatValue(item.delta) }}
			</span>
			<span :class="$style.peak">{{ chartText('peak') }} {{ formatValue(item.peak) }}</span>
		</div>
	</div>
	<div v-if="normalizedSeries.length > 1" :class="$style.legend" role="group" :aria-label="chartText('series')">
		<button
			v-for="(series, index) in normalizedSeries"
			:key="series.name"
			type="button"
			:class="[$style.legendButton, series.hidden && $style.legendButtonHidden]"
			:aria-pressed="!series.hidden"
			@click="toggleSeries(index)"
		>
			<span :class="$style.swatch" :style="{ backgroundColor: seriesColors[index] }"></span>{{ series.name }}
		</button>
	</div>
	<div v-if="!loading && !hasData" :class="$style.empty">
		<i class="ti ti-chart-line-off" aria-hidden="true"></i>
		<span>{{ chartText('noData') }}</span>
	</div>
	<div
		v-show="hasData"
		ref="chartEl"
		:class="$style.chart"
		:style="{ height: `${height}px` }"
		role="img"
		:aria-label="ariaLabel"
	></div>
	<details v-if="tableRows.length > 0" :class="$style.details">
		<summary>{{ i18n.ts.details }}</summary>
		<div :class="$style.tableScroller">
			<table :class="$style.table">
				<thead><tr><th>{{ i18n.ts.dateAndTime }}</th><th v-for="series in visibleSeries" :key="series.name">{{ series.name }}</th></tr></thead>
				<tbody>
					<tr v-for="row in tableRows" :key="row.time">
						<th>{{ formatTime(row.time) }}</th>
						<td v-for="(value, index) in row.values" :key="index">{{ formatValue(value) }}</td>
					</tr>
				</tbody>
			</table>
		</div>
	</details>
	<div v-if="loading" :class="$style.loading"><MkLoading/></div>
</div>
</template>

<script lang="ts">
export type DataChartPoint = { x: number; y: number };
export type DataChartSeries = {
	name: string;
	data: DataChartPoint[];
	type?: 'line' | 'area' | 'bar';
	color?: string;
	dashed?: boolean;
	hidden?: boolean;
	stack?: string;
};
</script>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { use, init, type ECharts, type EChartsCoreOption } from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { AriaComponent, DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { i18n } from '@/i18n.js';
import { store } from '@/store.js';
import { chartText } from '@/utility/chart-i18n.js';

use([BarChart, LineChart, AriaComponent, DataZoomComponent, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

const props = withDefaults(defineProps<{
	series: DataChartSeries[];
	ariaLabel: string;
	height?: number;
	loading?: boolean;
	stacked?: boolean;
	detailed?: boolean;
	bytes?: boolean;
	xAxisType?: 'time' | 'value';
}>(), {
	height: 280,
	loading: false,
	stacked: false,
	detailed: true,
	bytes: false,
	xAxisType: 'time',
});

const chartEl = useTemplateRef('chartEl');
let chart: ECharts | null = null;
let resizeObserver: ResizeObserver | null = null;
let renderFrame: number | null = null;

const hiddenIndexes = ref(new Set<number>());
const palette = ref<string[]>([]);
const normalizedSeries = computed(() => props.series.map(series => ({
	...series,
	hidden: series.hidden || hiddenIndexes.value.has(props.series.indexOf(series)),
	data: [...series.data].sort((a, b) => a.x - b.x),
})));
const visibleSeries = computed(() => normalizedSeries.value.filter(series => !series.hidden));
const hasData = computed(() => visibleSeries.value.some(series => series.data.length > 0));
const seriesColors = computed(() => normalizedSeries.value.map((series, index) => series.color ?? palette.value[index % palette.value.length]));
const summarySeries = computed(() => visibleSeries.value.slice(0, 5).map((series, index) => {
	const values = series.data.map(point => point.y);
	const latest = values.at(-1) ?? 0;
	return {
		name: series.name,
		latest,
		delta: latest - (values.at(-2) ?? latest),
		peak: Math.max(0, ...values),
		color: series.color ?? palette.value[index % palette.value.length],
	};
}));
const tableRows = computed(() => {
	const times = [...new Set(visibleSeries.value.flatMap(series => series.data.map(point => point.x)))].sort((a, b) => b - a);
	return times.map(time => ({
		time,
		values: visibleSeries.value.map(series => series.data.find(point => point.x === time)?.y ?? 0),
	}));
});

function formatValue(value: number): string {
	if (props.bytes) return `${new Intl.NumberFormat().format(value / 1000)} KB`;
	return new Intl.NumberFormat().format(value);
}

function formatTime(value: number): string {
	if (props.xAxisType === 'value') return String(value);
	return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(value);
}

function themeValue(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function toggleSeries(index: number) {
	const next = new Set(hiddenIndexes.value);
	if (next.has(index)) next.delete(index);
	else if (visibleSeries.value.length > 1) next.add(index);
	hiddenIndexes.value = next;
}

function render() {
	if (chartEl.value == null) return;
	if (!chartEl.value.isConnected || chartEl.value.clientWidth === 0 || chartEl.value.clientHeight === 0) return;
	chart ??= init(chartEl.value, undefined, { renderer: 'svg' });
	const fg = themeValue('--MI_THEME-fg');
	const divider = themeValue('--MI_THEME-divider');
	const panel = themeValue('--MI_THEME-panel');
	palette.value = ['--MI_THEME-accent', '--MI_THEME-success', '--MI_THEME-warn', '--MI_THEME-error', '--MI_THEME-link', '--MI_THEME-renote', '--MI_THEME-hashtag'].map(themeValue);
	const option: EChartsCoreOption = {
		animation: false,
		backgroundColor: 'transparent',
		color: palette.value,
		aria: { enabled: true, description: props.ariaLabel },
		textStyle: { color: fg, fontFamily: 'inherit' },
		grid: { left: props.detailed ? 48 : 8, right: 12, top: 20, bottom: props.detailed ? 64 : 20, containLabel: false },
		legend: { show: false },
		tooltip: {
			trigger: 'axis',
			backgroundColor: panel,
			borderColor: divider,
			textStyle: { color: fg },
			valueFormatter: (value: unknown) => formatValue(Number(value)),
		},
		xAxis: {
			type: props.xAxisType,
			axisLabel: { show: props.detailed, color: fg, hideOverlap: true },
			axisLine: { lineStyle: { color: divider } },
			axisTick: { show: false },
			splitLine: { show: false },
		},
		yAxis: {
			type: 'value',
			axisLabel: { show: props.detailed, color: fg, formatter: (value: number) => formatValue(value) },
			axisLine: { show: false },
			axisTick: { show: false },
			splitLine: { lineStyle: { color: divider } },
		},
		dataZoom: props.detailed ? [{ type: 'inside', filterMode: 'none' }] : [],
		series: normalizedSeries.value.map((series, index) => ({
			name: series.name,
			type: series.type === 'bar' ? 'bar' : 'line',
			data: series.data.map(point => [point.x, point.y]),
			stack: props.stacked ? (series.stack ?? 'total') : series.stack,
			smooth: series.type !== 'bar' ? 0.25 : false,
			showSymbol: false,
			connectNulls: true,
			lineStyle: { width: 2, type: series.dashed ? 'dashed' : 'solid', color: series.color ?? palette.value[index % palette.value.length] },
			itemStyle: { color: series.color ?? palette.value[index % palette.value.length], borderRadius: series.type === 'bar' ? [3, 3, 0, 0] : 0 },
			areaStyle: series.type === 'area' ? { opacity: 0.14 } : undefined,
			barMaxWidth: 28,
		})),
	};
	chart.setOption(option, { notMerge: true });
}

function scheduleRender() {
	if (renderFrame != null) cancelAnimationFrame(renderFrame);
	renderFrame = requestAnimationFrame(() => {
		renderFrame = null;
		chart?.resize();
		render();
	});
}

watch(() => [props.series, props.detailed, props.stacked, props.bytes, store.darkMode, hiddenIndexes.value], () => nextTick(scheduleRender), { deep: true });

onMounted(() => {
	if (chartEl.value != null) {
		resizeObserver = new ResizeObserver(entries => {
			if (entries[0]?.contentRect.width === 0 || entries[0]?.contentRect.height === 0) return;
			scheduleRender();
		});
		resizeObserver.observe(chartEl.value);
	}
	scheduleRender();
});

onBeforeUnmount(() => {
	if (renderFrame != null) cancelAnimationFrame(renderFrame);
	resizeObserver?.disconnect();
	chart?.dispose();
});
</script>

<style lang="scss" module>
.root { position: relative; min-width: 0; }
.summary { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-bottom: 12px; }
.summaryItem { display: grid; grid-template-columns: auto auto; align-items: baseline; column-gap: 8px; }
.summaryLabel { grid-column: 1 / -1; display: flex; align-items: center; gap: 6px; font-size: 0.82em; color: var(--MI_THEME-fg); opacity: 0.8; }
.swatch { width: 8px; height: 8px; border-radius: 50%; }
.summaryValue { font-size: 1.25em; color: var(--MI_THEME-fgHighlighted); font-variant-numeric: tabular-nums; }
.delta { font-size: 0.78em; font-variant-numeric: tabular-nums; }
.peak { grid-column: 1 / -1; font-size: 0.72em; color: var(--MI_THEME-fg); opacity: 0.65; }
.positive { color: var(--MI_THEME-success); }
.negative { color: var(--MI_THEME-error); }
.legend { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.legendButton { display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 4px 9px; border: 1px solid var(--MI_THEME-divider); border-radius: 999px; color: var(--MI_THEME-fg); background: var(--MI_THEME-panel); font: inherit; font-size: 0.82em; cursor: pointer; }
.legendButton:hover, .legendButton:focus-visible { border-color: var(--MI_THEME-accent); }
.legendButtonHidden { opacity: 0.48; text-decoration: line-through; }
.empty { min-height: 180px; display: grid; place-content: center; justify-items: center; gap: 8px; color: var(--MI_THEME-fg); opacity: 0.65; }
.empty > i { font-size: 2em; }
.chart { width: 100%; min-height: 180px; }
.details { margin-top: 8px; font-size: 0.9em; }
.details > summary { width: fit-content; cursor: pointer; color: var(--MI_THEME-accent); }
.tableScroller { margin-top: 8px; overflow-x: auto; overscroll-behavior-inline: contain; }
.table { width: 100%; border-collapse: collapse; white-space: nowrap; font-variant-numeric: tabular-nums; }
.table th, .table td { padding: 7px 10px; border-bottom: 1px solid var(--MI_THEME-divider); text-align: end; }
.table th:first-child { text-align: start; }
.loading { position: absolute; inset: 0; display: grid; place-items: center; background: color-mix(in srgb, var(--MI_THEME-panel) 75%, transparent); cursor: wait; }
@media (max-width: 500px) { .summary { gap: 8px 14px; } .chart { min-height: 220px; } }
</style>
