<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkLoading v-if="fetching"/>
<MkError v-else-if="fetchError" @retry="fetchRetention()"/>
<div v-else-if="rows.length === 0" :class="$style.empty">{{ chartText('noData') }}</div>
<div v-else>
	<p :class="$style.description">{{ chartText('retentionDescription') }}</p>
	<div :class="$style.scroller">
		<table :class="$style.table">
			<thead>
				<tr>
					<th scope="col" :class="$style.dateHeader">{{ chartText('signupDate') }}</th>
					<th scope="col" :class="$style.countHeader">{{ chartText('signups') }}</th>
					<th v-for="day in DAYS" :key="day" scope="col">{{ chartText('daysAfter').replace('{n}', String(day)) }}</th>
				</tr>
			</thead>
			<tbody>
				<tr v-for="row in rows" :key="row.dateKey">
					<th scope="row">{{ row.date }}</th>
					<td :class="$style.count">{{ number(row.users) }}</td>
					<td
						v-for="(cell, index) in row.cells"
						:key="index"
						:class="$style.cell"
						:style="cell.kind === 'rate' ? { '--level': cell.rate } : undefined"
						:title="cell.kind === 'rate' ? `${number(cell.value)} / ${number(row.users)}` : undefined"
					>
						<template v-if="cell.kind === 'rate'">{{ Math.round(cell.rate * 100) }}%</template>
						<template v-else-if="cell.kind === 'none'">—</template>
					</td>
				</tr>
			</tbody>
		</table>
	</div>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { chartText } from '@/features/chart/chart-i18n.js';
import number from '@/filters/number.js';
import { retentionDayNumber, retentionSignupDate, retentionValuesByDay } from '@/features/chart/retention.js';

type Cell = { kind: 'rate'; value: number; rate: number } | { kind: 'none' } | { kind: 'future' };

// 列は登録から 7 日後まで、行は直近 8 日分の登録。最も古い行で 7 日後まで埋まる。
const DAYS = [1, 2, 3, 4, 5, 6, 7];
const ROWS = 8;

const fetching = ref(true);
// 失敗したまま読み込み中にせず、再試行できる状態にする。
const fetchError = ref(false);
const rows = ref<{ dateKey: string; date: string; users: number; cells: Cell[] }[]>([]);

async function fetchRetention() {
	fetching.value = true;
	fetchError.value = false;
	const raw = await misskeyApi('retention', {}).catch(() => null);
	if (raw == null) {
		fetchError.value = true;
		fetching.value = false;
		return;
	}
	// 最新の行の日付まで集計が済んでいる。それより後の日はまだ来ていない
	const latestDay = raw[0] == null ? null : retentionDayNumber(raw[0].dateKey);
	rows.value = raw.slice(0, ROWS).map((record) => {
		const base = retentionDayNumber(record.dateKey);
		const valuesByDay = retentionValuesByDay(record);
		const cells = DAYS.map((day): Cell => {
			if (base == null || latestDay == null || base + day > latestDay) return { kind: 'future' };
			const value = valuesByDay.get(day);
			if (value == null || record.users === 0) return { kind: 'none' };
			return { kind: 'rate', value, rate: value / record.users };
		});
		return {
			dateKey: record.dateKey,
			// 行は直近 8 日分なので年は省く
			date: retentionSignupDate(record.dateKey, { month: 'numeric', day: 'numeric' }) ?? record.dateKey,
			users: record.users,
			cells,
		};
	});
	fetching.value = false;
}

onMounted(() => {
	fetchRetention();
});
</script>

<style lang="scss" module>
.description { margin: 0 0 12px; font-size: 0.85em; color: var(--MI-text-muted); }
.scroller { overflow-x: auto; }
.table { width: 100%; min-width: 320px; table-layout: fixed; border-spacing: 3px; font-variant-numeric: tabular-nums; }
.table th { padding: 4px; color: var(--MI_THEME-fg); font-size: 0.75em; font-weight: 500; white-space: nowrap; text-align: center; }
.table tbody th { text-align: start; }
.dateHeader { width: 4em; text-align: start !important; }
.countHeader { width: 3.5em; }
.count { padding: 4px; font-size: 0.75em; text-align: end; }
.cell { height: 30px; padding: 0; border-radius: 5px; color: var(--MI_THEME-fgHighlighted); text-align: center; font-size: 0.75em; }
/* 混ぜるアクセントを 40% までにして、どの割合でも同じ文字色で読めるようにする */
.cell[style] { background: color-mix(in srgb, var(--MI_THEME-accent) calc(var(--level) * 40%), var(--MI_THEME-panel)); }
.cell:empty { background: none; }
.empty { min-height: 120px; display: grid; place-items: center; opacity: 0.65; }
</style>
