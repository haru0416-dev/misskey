<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" class="_panel">
	<section>
		<h3>{{ chartText('incoming') }}</h3>
		<MkDataChart :series="incoming" :ariaLabel="chartText('incoming')" :loading="fetching" :height="190"/>
	</section>
	<section>
		<h3>{{ chartText('outgoing') }}</h3>
		<MkDataChart :series="outgoing" :ariaLabel="chartText('outgoing')" :loading="fetching" :height="260"/>
	</section>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import isChromatic from 'chromatic';
import MkDataChart, { type DataChartSeries } from '@/components/MkDataChart.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { toChartSeries } from '@/utility/chart-helpers.js';
import { chartText } from '@/utility/chart-i18n.js';

const fetching = ref(true);
const incoming = ref<DataChartSeries[]>([]);
const outgoing = ref<DataChartSeries[]>([]);

onMounted(async () => {
	const now = isChromatic() ? new Date('2024-08-31T10:00:00Z') : new Date();
	const raw = await misskeyApi('charts/ap-request', { limit: 50, span: 'day' });
	incoming.value = [{ name: chartText('incoming'), type: 'bar', data: toChartSeries(now, raw.inboxReceived) }];
	outgoing.value = [
		{ name: chartText('outgoingSucceeded'), type: 'area', data: toChartSeries(now, raw.deliverSucceeded) },
		{ name: chartText('outgoingFailed'), type: 'area', data: toChartSeries(now, raw.deliverFailed) },
	];
	fetching.value = false;
});
</script>

<style lang="scss" module>
.root { display: grid; gap: 16px; padding: 16px; }
.root h3 { margin: 0 0 12px; font-size: 1em; }
</style>
