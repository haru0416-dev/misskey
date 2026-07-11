<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" class="_panel">
	<MkDataChart :series="series" :ariaLabel="i18n.ts._charts.activeUsers" :loading="fetching" :height="260"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import MkDataChart, { type DataChartSeries } from '@/features/charts/components/MkDataChart.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { toChartSeries } from '@/features/charts/chart-helpers.js';
import { chartText } from '@/features/charts/chart-i18n.js';

const fetching = ref(true);
const series = ref<DataChartSeries[]>([]);

onMounted(async () => {
	const now = new Date();
	const raw = await misskeyApi('charts/active-users', { limit: 7, span: 'day' });
	series.value = [
		{ name: chartText('read'), type: 'bar', data: toChartSeries(now, raw.read) },
		{ name: chartText('write'), type: 'bar', data: toChartSeries(now, raw.write) },
	];
	fetching.value = false;
});
</script>

<style lang="scss" module>
.root { padding: 20px; }
</style>
