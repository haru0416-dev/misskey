<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkLoading v-if="fetching"/>
<div v-else-if="rows.length === 0" :class="$style.empty">{{ chartText('noData') }}</div>
<div v-else :class="$style.scroller">
	<table :class="$style.table">
		<thead><tr><th>{{ chartText('startDate') }}</th><th v-for="day in maxDays + 1" :key="day">{{ day - 1 }}</th></tr></thead>
		<tbody>
			<tr v-for="row in rows" :key="row.date">
				<th>{{ row.date }}</th>
				<td v-for="(cell, index) in row.cells" :key="index" :style="{ '--level': cell.rate }" :title="`${cell.value} (${Math.round(cell.rate * 100)}%)`">{{ Math.round(cell.rate * 100) }}%</td>
			</tr>
		</tbody>
	</table>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { chartText } from '@/features/charts/chart-i18n.js';

const fetching = ref(true);
const maxDays = 10;
const rows = ref<{ date: string; cells: { value: number; rate: number }[] }[]>([]);
onMounted(async () => {
	const raw = (await misskeyApi('retention', {})).slice(0, maxDays + 1);
	rows.value = raw.map(record => {
		const values = [record.users, ...Object.entries(record.data).sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value)].slice(0, maxDays + 1);
		return { date: new Date(record.createdAt).toLocaleDateString(), cells: values.map(value => ({ value, rate: record.users === 0 ? 0 : value / record.users })) };
	});
	fetching.value = false;
});
</script>

<style lang="scss" module>
.scroller { overflow-x: auto; }
.table { width: 100%; border-spacing: 4px; font-variant-numeric: tabular-nums; }
.table th { padding: 5px; color: var(--MI_THEME-fg); font-size: 0.75em; font-weight: 500; white-space: nowrap; }
.table td { min-width: 42px; height: 34px; padding: 4px; border-radius: 5px; color: var(--MI_THEME-fg); background: color-mix(in srgb, var(--MI_THEME-accent) calc(var(--level) * 75%), var(--MI_THEME-panel)); text-align: center; font-size: 0.72em; }
.empty { min-height: 120px; display: grid; place-items: center; opacity: 0.65; }
</style>
