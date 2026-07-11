<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkDataChart :series="series" :ariaLabel="chartText('retention')" :loading="fetching" :height="300" xAxisType="value"/>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import MkDataChart, { type DataChartSeries } from '@/components/MkDataChart.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { chartText } from '@/utility/chart-i18n.js';

const fetching = ref(true);
const series = ref<DataChartSeries[]>([]);
onMounted(async () => {
	const raw = await misskeyApi('retention', {});
	series.value = raw.map(record => ({
		name: new Date(record.createdAt).toLocaleDateString(),
		data: [{ x: 0, y: 100 }, ...Object.entries(record.data).sort(([a], [b]) => a.localeCompare(b)).map(([, value], index) => ({ x: index + 1, y: record.users === 0 ? 0 : (value / record.users) * 100 }))],
	}));
	fetching.value = false;
});
</script>
