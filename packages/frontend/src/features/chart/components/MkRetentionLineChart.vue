<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkDataChart :series="series" :ariaLabel="chartText('retention')" :loading="fetching" :height="300" xAxisType="value"/>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import MkDataChart from '@/features/chart/components/MkDataChart.vue';
import type { DataChartSeries } from '@/features/chart/components/MkDataChart.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { chartText } from '@/features/chart/chart-i18n.js';
import { retentionSignupDate, retentionValuesByDay } from '@/features/chart/retention.js';

const fetching = ref(true);
const series = ref<DataChartSeries[]>([]);
onMounted(async () => {
	const raw = await misskeyApi('retention', {});
	series.value = raw.map((record) => ({
		name: retentionSignupDate(record.dateKey, {}) ?? record.dateKey,
		data: [
			{ x: 0, y: 100 },
			...[...retentionValuesByDay(record)]
				.filter(([day]) => day > 0)
				.sort(([a], [b]) => a - b)
				.map(([day, value]) => ({ x: day, y: record.users === 0 ? 0 : (value / record.users) * 100 })),
		],
	}));
	fetching.value = false;
});
</script>
