<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" class="_panel">
	<MkError v-if="fetchError" @retry="fetchChart()"/>
	<MkDataChart v-else :series="series" :ariaLabel="i18n.ts._charts.activeUsers" :loading="fetching" :height="220"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import MkDataChart from '@/features/charts/components/MkDataChart.vue';
import type { DataChartSeries } from '@/features/charts/components/MkDataChart.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { toChartSeries } from '@/features/charts/chart-helpers.js';
import { chartText } from '@/features/charts/chart-i18n.js';

const fetching = ref(true);
// 失敗したまま読み込み中にせず、再試行できる状態にする。
const fetchError = ref(false);
const series = ref<DataChartSeries[]>([]);

async function fetchChart() {
	fetching.value = true;
	fetchError.value = false;
	const now = new Date();
	const raw = await misskeyApi('charts/active-users', { limit: 7, span: 'day' }).catch(() => null);
	if (raw == null) {
		fetchError.value = true;
		fetching.value = false;
		return;
	}
	series.value = [
		{ name: chartText('read'), type: 'bar', data: toChartSeries(now, raw.read) },
		{ name: chartText('write'), type: 'bar', data: toChartSeries(now, raw.write) },
	];
	fetching.value = false;
}

onMounted(() => {
	fetchChart();
});
</script>

<style lang="scss" module>
.root { padding: 20px; }

@media (max-width: 500px) {
	.root { padding: 16px 12px; }
}
</style>
