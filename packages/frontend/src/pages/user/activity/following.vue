<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" class="_panel">
	<MkDataChart :series="series" :ariaLabel="i18n.ts.following" :loading="loading" :height="280"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { toChartSeries } from '@/utility/chart-helpers.js';
import MkDataChart, { type DataChartSeries } from '@/components/MkDataChart.vue';

const props = defineProps<{ user: Misskey.entities.User }>();
const series = ref<DataChartSeries[]>([]);
const loading = ref(true);

onMounted(async () => {
	const raw = await misskeyApi('charts/user/following', { userId: props.user.id, limit: 30, span: 'day' });
	const now = new Date();
	series.value = [
		{ name: `${i18n.ts.following} (${i18n.ts.local})`, type: 'area', data: toChartSeries(now, raw.local.followings.total) },
		{ name: `${i18n.ts.following} (${i18n.ts.remote})`, type: 'line', dashed: true, data: toChartSeries(now, raw.remote.followings.total) },
		{ name: `${i18n.ts.followers} (${i18n.ts.local})`, type: 'area', data: toChartSeries(now, raw.local.followers.total) },
		{ name: `${i18n.ts.followers} (${i18n.ts.remote})`, type: 'line', dashed: true, data: toChartSeries(now, raw.remote.followers.total) },
	];
	loading.value = false;
});
</script>

<style lang="scss" module>
.root { padding: 20px; }
</style>
