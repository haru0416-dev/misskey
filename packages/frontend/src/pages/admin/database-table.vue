<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.scroller">
	<table :class="$style.table">
		<thead>
			<tr>
				<th scope="col" :class="$style.name">{{ i18n.ts._databaseStats.table }}</th>
				<th scope="col">{{ i18n.ts._databaseStats.rows }}</th>
				<th scope="col" :class="$style.detail">{{ i18n.ts._databaseStats.dataSize }}</th>
				<th scope="col" :class="$style.detail">{{ i18n.ts._databaseStats.indexSize }}</th>
				<th scope="col">{{ i18n.ts._databaseStats.totalSize }}</th>
			</tr>
		</thead>
		<tbody>
			<tr v-for="table in tables" :key="table.name">
				<th scope="row" :class="$style.name">{{ table.name }}</th>
				<td>{{ number(table.count) }}</td>
				<td :class="$style.detail">{{ bytes(table.dataSize, 1) }}</td>
				<td :class="$style.detail">{{ bytes(table.indexSize, 1) }}</td>
				<td :class="$style.total">{{ bytes(table.totalSize, 1) }}</td>
			</tr>
		</tbody>
	</table>
</div>
</template>

<script lang="ts" setup>
import type * as Misskey from 'misskey-js';
import bytes from '@/filters/bytes.js';
import number from '@/filters/number.js';
import { i18n } from '@/i18n.js';

defineProps<{
	tables: Misskey.entities.AdminGetTableStatsResponse['tables'];
}>();
</script>

<style lang="scss" module>
.scroller {
	overflow-x: auto;
	container-type: inline-size;
}

.table {
	width: 100%;
	border-collapse: collapse;
	font-size: 0.9em;
	font-variant-numeric: tabular-nums;

	th,
	td {
		padding: 6px 8px;
		text-align: end;
		white-space: nowrap;
		border-bottom: solid 0.5px var(--MI_THEME-divider);
	}

	thead th {
		font-weight: normal;
		color: var(--MI-text-muted);
	}

	tbody tr:last-child > * {
		border-bottom: none;
	}

	.name {
		text-align: start;
		font-weight: normal;
		white-space: normal;
		overflow-wrap: anywhere;
	}

	.total {
		font-weight: bold;
	}

	thead .name {
		white-space: nowrap;
	}
}

/* 5 列を並べるとテーブル名の列が 1〜3 文字幅まで縮むので、狭いときは内訳を隠して行数と合計だけにする */
@container (max-width: 480px) {
	.detail {
		display: none;
	}
}
</style>
