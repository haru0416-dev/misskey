<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div :class="$style.charts">
		<div :class="$style.chart">
			<div :class="$style.chartTitle">{{ i18n.ts._chart.process }}<span :class="$style.current">{{ number(activeSincePrevTick) }}</span></div>
			<XChart ref="chartProcess" type="process"/>
		</div>
		<div :class="$style.chart">
			<div :class="$style.chartTitle">{{ i18n.ts._chart.active }}<span :class="$style.current">{{ number(active) }}</span></div>
			<XChart ref="chartActive" type="active"/>
		</div>
		<div :class="$style.chart">
			<div :class="$style.chartTitle">{{ i18n.ts._chart.delayed }}<span :class="$style.current">{{ number(delayed) }}</span></div>
			<XChart ref="chartDelayed" type="delayed"/>
		</div>
		<div :class="$style.chart">
			<div :class="$style.chartTitle">{{ i18n.ts._chart.waiting }}<span :class="$style.current">{{ number(waiting) }}</span></div>
			<XChart ref="chartWaiting" type="waiting"/>
		</div>
	</div>
	<MkFolder :defaultOpen="true" :max-height="250">
		<template #icon><i class="ti ti-alert-triangle"></i></template>
		<template #label>{{ i18n.ts._jobQueue.erroredInstances }}</template>
		<template #suffix>{{ i18n.tsx._jobQueue.jobCount({ n: number(jobs.reduce((a, b) => a + b[1], 0)) }) }}</template>

		<div>
			<div v-if="jobs.length > 0">
				<div v-for="job in jobs" :key="job[0]">
					<MkA :to="`/instance-info/${job[0]}`" behavior="window">{{ job[0] }}</MkA>
					<span style="margin-left: 8px; color: var(--MI-text-muted);">{{ i18n.tsx._jobQueue.jobCount({ n: number(job[1]) }) }}</span>
				</div>
			</div>
			<span v-else style="color: var(--MI-text-muted);">{{ i18n.ts.noJobs }}</span>
		</div>
	</MkFolder>
</div>
</template>

<script lang="ts" setup>
import { markRaw, onMounted, onUnmounted, ref, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import XChart from './chart.vue';
import type { ApQueueDomain } from '@/pages/admin/federation-job-queue/index.vue';
import number from '@/filters/number.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useStream } from '@/stream.js';
import { i18n } from '@/i18n.js';
import MkFolder from '@/components/layout/MkFolder.vue';
import { genId } from '@/utility/id.js';

const connection = markRaw(useStream().useChannel('queueStats'));

const activeSincePrevTick = ref(0);
const active = ref(0);
const delayed = ref(0);
const waiting = ref(0);
const jobs = ref<Misskey.Endpoints[`admin/queue/${ApQueueDomain}-delayed`]['res']>([]);
const chartProcess = useTemplateRef('chartProcess');
const chartActive = useTemplateRef('chartActive');
const chartDelayed = useTemplateRef('chartDelayed');
const chartWaiting = useTemplateRef('chartWaiting');

const props = defineProps<{
	domain: ApQueueDomain;
}>();

function onStats(stats: Misskey.entities.QueueStats) {
	activeSincePrevTick.value = stats[props.domain].activeSincePrevTick;
	active.value = stats[props.domain].active;
	delayed.value = stats[props.domain].delayed;
	waiting.value = stats[props.domain].waiting;

	if (chartProcess.value != null) {
		chartProcess.value.pushData(stats[props.domain].activeSincePrevTick);
	}
	if (chartActive.value != null) {
		chartActive.value.pushData(stats[props.domain].active);
	}
	if (chartDelayed.value != null) {
		chartDelayed.value.pushData(stats[props.domain].delayed);
	}
	if (chartWaiting.value != null) {
		chartWaiting.value.pushData(stats[props.domain].waiting);
	}
}

function onStatsLog(statsLog: Misskey.entities.QueueStatsLog) {
	const dataProcess: Misskey.entities.QueueStats[ApQueueDomain]['activeSincePrevTick'][] = [];
	const dataActive: Misskey.entities.QueueStats[ApQueueDomain]['active'][] = [];
	const dataDelayed: Misskey.entities.QueueStats[ApQueueDomain]['delayed'][] = [];
	const dataWaiting: Misskey.entities.QueueStats[ApQueueDomain]['waiting'][] = [];

	for (const stats of [...statsLog].reverse()) {
		dataProcess.push(stats[props.domain].activeSincePrevTick);
		dataActive.push(stats[props.domain].active);
		dataDelayed.push(stats[props.domain].delayed);
		dataWaiting.push(stats[props.domain].waiting);
	}

	if (chartProcess.value != null) {
		chartProcess.value.setData(dataProcess);
	}
	if (chartActive.value != null) {
		chartActive.value.setData(dataActive);
	}
	if (chartDelayed.value != null) {
		chartDelayed.value.setData(dataDelayed);
	}
	if (chartWaiting.value != null) {
		chartWaiting.value.setData(dataWaiting);
	}
}

onMounted(() => {
	misskeyApi(`admin/queue/${props.domain}-delayed`).then((result) => {
		jobs.value = result;
	});

	connection.on('stats', onStats);
	connection.on('statsLog', onStatsLog);
	connection.send('requestLog', {
		id: genId(),
		length: 200,
	});
});

onUnmounted(() => {
	connection.off('stats', onStats);
	connection.off('statsLog', onStatsLog);
	connection.dispose();
});
</script>

<style lang="scss" module>
.charts {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 10px;
}

.chart {
	min-width: 0;
	padding: 16px;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
}

.chartTitle {
	display: flex;
	align-items: baseline;
	margin-bottom: 8px;
}

.current {
	margin-left: auto;
	font-size: 1.2em;
	font-weight: bold;
	font-variant-numeric: tabular-nums;
}
</style>
