<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 800px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<MkSuspense v-slot="{ result: stats }" :p="statsPromiseFactory">
			<div class="_gaps_m">
				<MkKeyValue>
					<template #key>{{ i18n.ts._databaseStats.databaseSize }}</template>
					<template #value><span :class="$style.databaseSize">{{ bytes(stats.databaseSize, 1) }}</span></template>
				</MkKeyValue>

				<div :class="$style.description">{{ i18n.ts._databaseStats.description }}</div>

				<div class="_panel" :class="$style.panel">
					<XTable :tables="stats.tables"/>
				</div>

				<MkFolder>
					<template #icon><i class="ti ti-chart-line"></i></template>
					<template #label>{{ i18n.ts._databaseStats.chartTables }}</template>
					<template #suffix>{{ i18n.tsx._databaseStats.tableCount({ n: stats.chartTables.length }) }} · {{ bytes(stats.chartTablesSize, 1) }}</template>
					<XTable :tables="stats.chartTables"/>
				</MkFolder>
			</div>
		</MkSuspense>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import XTable from './database-table.vue';
import MkKeyValue from '@/components/display/MkKeyValue.vue';
import MkFolder from '@/components/layout/MkFolder.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import bytes from '@/filters/bytes.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';

// チャートの集計テーブルは __chart__ と __chart_day__ で始まり、数が多いので本体のテーブルと分けて畳む。
const statsPromiseFactory = () => misskeyApi('admin/get-table-stats').then(({ databaseSize, tables }) => {
	const chartTables = tables.filter(table => table.name.startsWith('__chart_'));
	return {
		databaseSize,
		tables: tables.filter(table => !table.name.startsWith('__chart_')),
		chartTables,
		chartTablesSize: chartTables.reduce((sum, table) => sum + table.totalSize, 0),
	};
});

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.database,
	icon: 'ti ti-database',
}));
</script>

<style lang="scss" module>
.databaseSize {
	font-size: 1.5em;
	font-weight: bold;
	font-variant-numeric: tabular-nums;
}

.description {
	font-size: 0.85em;
	color: var(--MI-text-muted);
}

.panel {
	padding: 8px;
}
</style>
