<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" class="_panel">
	<MkError v-if="fetchError" @retry="fetchChart()"/>
	<section v-if="!fetchError">
		<h3>{{ chartText('incoming') }}</h3>
		<MkDataChart :series="incoming" :ariaLabel="chartText('incoming')" :loading="fetching" :height="190"/>
	</section>
	<section v-if="!fetchError">
		<h3>{{ chartText('outgoing') }}</h3>
		<MkDataChart :series="outgoing" :ariaLabel="chartText('outgoing')" :loading="fetching" :height="260"/>
	</section>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import MkDataChart from '@/features/charts/components/MkDataChart.vue';
import type { DataChartSeries } from '@/features/charts/components/MkDataChart.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { toChartSeries } from '@/features/charts/chart-helpers.js';
import { chartText } from '@/features/charts/chart-i18n.js';

const fetching = ref(true);
// 失敗したまま読み込み中にせず、再試行できる状態にする。
const fetchError = ref(false);
const incoming = ref<DataChartSeries[]>([]);
const outgoing = ref<DataChartSeries[]>([]);

async function fetchChart() {
	fetching.value = true;
	fetchError.value = false;
	const now = new Date();
	const raw = await misskeyApi('charts/ap-request', { limit: 50, span: 'day' }).catch(() => null);
	if (raw == null) {
		fetchError.value = true;
		fetching.value = false;
		return;
	}
	incoming.value = [{ name: chartText('incoming'), type: 'bar', data: toChartSeries(now, raw.inboxReceived) }];
	outgoing.value = [
		{ name: chartText('outgoingSucceeded'), type: 'area', data: toChartSeries(now, raw.deliverSucceeded) },
		{ name: chartText('outgoingFailed'), type: 'area', data: toChartSeries(now, raw.deliverFailed) },
	];
	fetching.value = false;
}

onMounted(() => {
	fetchChart();
});
</script>

<style lang="scss" module>
.root { display: grid; gap: 16px; padding: 16px; }
.root h3 { margin: 0 0 12px; font-size: 1em; }
</style>
