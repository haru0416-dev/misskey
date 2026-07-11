<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkDataChart :series="series" :ariaLabel="i18n.ts._charts.activeUsers" :loading="fetching" :height="240" :detailed="false"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import MkDataChart, { type DataChartSeries } from '@/components/MkDataChart.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { toChartSeries } from '@/utility/chart-helpers.js';
import { chartText } from '@/utility/chart-i18n.js';

const fetching = ref(true);
const series = ref<DataChartSeries[]>([]);

onMounted(async () => {
	const raw = await misskeyApi('charts/active-users', { limit: 30, span: 'day' });
	series.value = [{ name: chartText('read'), type: 'bar', data: toChartSeries(new Date(), raw.read) }];
	fetching.value = false;
});
</script>

<style lang="scss" module>
.root { padding: 20px; }
</style>
