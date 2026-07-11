<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<MkFoldableSection class="item">
		<template #header>Chart</template>
		<div :class="$style.chart">
			<div class="selects">
				<MkSelect v-model="chartSrc" :items="chartSrcDef" style="margin: 0; flex: 1;"></MkSelect>
				<MkSelect v-model="chartSpan" :items="chartSpanDef" style="margin: 0 0 0 10px;"></MkSelect>
			</div>
			<div class="chart _panel">
				<MkChart :src="chartSrc" :span="chartSpan" :limit="chartLimit" :detailed="true"></MkChart>
			</div>
		</div>
	</MkFoldableSection>

	<MkFoldableSection class="item">
		<template #header>Active users heatmap</template>
		<MkSelect v-model="heatmapSrc" :items="heatmapSrcDef" style="margin: 0 0 12px 0;"></MkSelect>
		<div class="_panel" :class="$style.heatmap">
			<MkHeatmap :src="heatmapSrc" :label="'Read & Write'"/>
		</div>
	</MkFoldableSection>

	<MkFoldableSection class="item">
		<template #header>Retention rate</template>
		<div class="_panel" :class="$style.retentionHeatmap">
			<MkRetentionHeatmap/>
		</div>
		<div class="_panel" :class="$style.retentionLine">
			<MkRetentionLineChart/>
		</div>
	</MkFoldableSection>

	<MkFoldableSection v-if="shouldShowFederation" class="item">
		<template #header>Federation</template>
		<div :class="$style.federation">
			<div class="pies">
				<div class="sub">
					<div class="title">Sub</div>
					<MkPieChart :data="subs"/>
				</div>
				<div class="pub">
					<div class="title">Pub</div>
					<MkPieChart :data="pubs"/>
				</div>
			</div>
		</div>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { onMounted, computed, ref } from 'vue';
import type { MkSelectItem, ItemOption } from '@/components/form/MkSelect.vue';
import type { ChartSrc } from '@/features/charts/components/MkChart.vue';
import MkSelect from '@/components/form/MkSelect.vue';
import MkChart from '@/features/charts/components/MkChart.vue';
import { $i } from '@/i.js';
import * as os from '@/os.js';
import { misskeyApiGet } from '@/utility/misskey-api.js';
import { instance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import MkHeatmap from '@/features/charts/components/MkHeatmap.vue';
import MkFoldableSection from '@/components/layout/MkFoldableSection.vue';
import MkRetentionHeatmap from '@/features/charts/components/MkRetentionHeatmap.vue';
import MkRetentionLineChart from '@/features/charts/components/MkRetentionLineChart.vue';
import { useMkSelect } from '@/composables/useMkSelect.js';
import MkPieChart, { type InstanceForPie } from '@/pages/admin/overview/pie.vue';

const shouldShowFederation = computed(() => instance.federation !== 'none' || $i?.isModerator);

const chartLimit = 500;
const {
	model: chartSpan,
	def: chartSpanDef,
} = useMkSelect({
	items: [
		{ value: 'hour', label: i18n.ts.perHour },
		{ value: 'day', label: i18n.ts.perDay },
	],
	initialValue: 'hour',
});
const {
	model: chartSrc,
	def: chartSrcDef,
} = useMkSelect({
	items: computed<MkSelectItem<ChartSrc>[]>(() => {
		const items: MkSelectItem<ChartSrc>[] = [];

		if (shouldShowFederation.value) {
			items.push({
				type: 'group',
				label: i18n.ts.federation,
				items: [
					{ value: 'federation', label: i18n.ts._charts.federation },
					{ value: 'ap-request', label: i18n.ts._charts.apRequest },
				],
			});
		}

		items.push({
			type: 'group',
			label: i18n.ts.users,
			items: [
				{ value: 'users', label: i18n.ts._charts.usersIncDec },
				{ value: 'users-total', label: i18n.ts._charts.usersTotal },
				{ value: 'active-users', label: i18n.ts._charts.activeUsers },
			],
		});

		const notesItems: ItemOption<ChartSrc>[] = [
			{ value: 'notes', label: i18n.ts._charts.notesIncDec },
			{ value: 'local-notes', label: i18n.ts._charts.localNotesIncDec },
		];

		if (shouldShowFederation.value) notesItems.push({ value: 'remote-notes', label: i18n.ts._charts.remoteNotesIncDec });

		notesItems.push(
			{ value: 'notes-total', label: i18n.ts._charts.notesTotal },
		);

		items.push({
			type: 'group',
			label: i18n.ts.notes,
			items: notesItems,
		});

		items.push({
			type: 'group',
			label: i18n.ts.drive,
			items: [
				{ value: 'drive-files', label: i18n.ts._charts.filesIncDec },
				{ value: 'drive', label: i18n.ts._charts.storageUsageIncDec },
			],
		});

		return items;
	}),
	initialValue: 'active-users',
});
const {
	model: heatmapSrc,
	def: heatmapSrcDef,
} = useMkSelect({
	items: computed(() => [
		{ value: 'active-users' as const, label: 'Active Users' },
		{ value: 'notes' as const, label: 'Notes' },
		...(shouldShowFederation.value ? [
			{ value: 'ap-requests-inbox-received' as const, label: 'AP Requests: inboxReceived' },
			{ value: 'ap-requests-deliver-succeeded' as const, label: 'AP Requests: deliverSucceeded' },
			{ value: 'ap-requests-deliver-failed' as const, label: 'AP Requests: deliverFailed' },
		] : []),
	]),
	initialValue: 'active-users',
});
const subs = ref<InstanceForPie[]>([]);
const pubs = ref<InstanceForPie[]>([]);

onMounted(() => {
	misskeyApiGet('federation/stats', { limit: 30 }).then(fedStats => {
		subs.value = fedStats.topSubInstances.map(x => ({
			name: x.host,
			color: x.themeColor ?? '#888888',
			value: x.followersCount,
			onClick: () => {
				os.pageWindow(`/instance-info/${x.host}`);
			},
		}));

		subs.value.push({
			name: '(other)',
			color: '#80808080',
			value: fedStats.otherFollowersCount,
		});

		pubs.value = fedStats.topPubInstances.map(x => ({
			name: x.host,
			color: x.themeColor ?? '#888888',
			value: x.followingCount,
			onClick: () => {
				os.pageWindow(`/instance-info/${x.host}`);
			},
		}));

		pubs.value.push({
			name: '(other)',
			color: '#80808080',
			value: fedStats.otherFollowingCount,
		});
	});
});
</script>

<style lang="scss" module>
.root {
	&:global {
		> .item {
			margin-bottom: 16px;
		}
	}
}

.chart {
	&:global {
		> .selects {
			display: flex;
			margin-bottom: 12px;
		}

		> .chart {
			padding: 16px;
		}
	}
}

.heatmap,
.retentionHeatmap,
.retentionLine {
	padding: 16px;
	margin-bottom: 16px;
}

.federation {
	&:global {
		> .pies {
			display: flex;
			gap: 16px;

			> .sub, > .pub {
				flex: 1;
				min-width: 0;
				position: relative;
				background: var(--MI_THEME-panel);
				border-radius: var(--MI-radius);
				padding: 24px;
				max-height: 300px;

				> .title {
					position: absolute;
					top: 24px;
					left: 24px;
				}
			}

			@media (max-width: 600px) {
				flex-direction: column;
			}
		}
	}
}
</style>
