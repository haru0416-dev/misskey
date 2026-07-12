<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_spacer" style="--MI_SPACER-w: 1000px;">
	<div ref="rootEl" :class="$style.root">
		<MkFoldableSection :class="[$style.section, $style.summary]">
			<template #header>Stats</template>
			<XStats/>
		</MkFoldableSection>

		<MkFoldableSection :class="$style.section">
			<template #header>Active users</template>
			<XActiveUsers/>
		</MkFoldableSection>

		<MkFoldableSection :class="$style.section">
			<template #header>Heatmap</template>
			<XHeatmap/>
		</MkFoldableSection>

		<MkFoldableSection :class="[$style.section, $style.wide]">
			<template #header>Retention rate</template>
			<XRetention/>
		</MkFoldableSection>

		<MkFoldableSection :class="$style.section">
			<template #header>Moderators</template>
			<XModerators/>
		</MkFoldableSection>

		<MkFoldableSection :class="$style.section">
			<template #header>Federation</template>
			<XFederation/>
		</MkFoldableSection>

		<MkFoldableSection :class="[$style.section, $style.wide]">
			<template #header>Instances</template>
			<XInstances/>
		</MkFoldableSection>

		<MkFoldableSection :class="$style.section">
			<template #header>Ap requests</template>
			<XApRequests/>
		</MkFoldableSection>

		<MkFoldableSection :class="$style.section">
			<template #header>New users</template>
			<XUsers/>
		</MkFoldableSection>

		<MkFoldableSection :class="$style.section">
			<template #header>Deliver queue</template>
			<XQueue domain="deliver"/>
		</MkFoldableSection>

		<MkFoldableSection :class="$style.section">
			<template #header>Inbox queue</template>
			<XQueue domain="inbox"/>
		</MkFoldableSection>
	</div>
</div>
</template>

<script lang="ts" setup>
import { markRaw, onMounted, onBeforeUnmount, nextTick, shallowRef, ref, computed, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import XFederation from './federation.vue';
import XInstances from './instances.vue';
import XQueue from './queue/index.vue';
import XApRequests from './ap-requests.vue';
import XUsers from './users.vue';
import XActiveUsers from './active-users.vue';
import XStats from './stats.vue';
import XRetention from './retention.vue';
import XModerators from './moderators.vue';
import XHeatmap from './heatmap.vue';
import type { InstanceForPie } from './pie.vue';
import * as os from '@/os.js';
import { misskeyApi, misskeyApiGet } from '@/utility/misskey-api.js';
import { useStream } from '@/stream.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkFoldableSection from '@/components/layout/MkFoldableSection.vue';
import { genId } from '@/utility/id.js';

const rootEl = useTemplateRef('rootEl');
const serverInfo = ref<Misskey.entities.ServerInfoResponse | null>(null);
const topSubInstancesForPie = ref<InstanceForPie[] | null>(null);
const topPubInstancesForPie = ref<InstanceForPie[] | null>(null);
const federationPubActive = ref<number | null>(null);
const federationPubActiveDiff = ref<number | null>(null);
const federationSubActive = ref<number | null>(null);
const federationSubActiveDiff = ref<number | null>(null);
const newUsers = ref<Misskey.entities.UserDetailed[] | null>(null);
const activeInstances = shallowRef<Misskey.entities.FederationInstancesResponse | null>(null);
const queueStatsConnection = markRaw(useStream().useChannel('queueStats'));
const now = new Date();
const filesPagination = {
	endpoint: 'admin/drive/files' as const,
	limit: 9,
	noPaging: true,
};

function onInstanceClick(i: Misskey.entities.FederationInstance) {
	os.pageWindow(`/instance-info/${i.host}`);
}

onMounted(async () => {
	misskeyApiGet('charts/federation', { limit: 2, span: 'day' }).then(chart => {
		federationPubActive.value = chart.pubActive[0];
		federationPubActiveDiff.value = chart.pubActive[0] - chart.pubActive[1];
		federationSubActive.value = chart.subActive[0];
		federationSubActiveDiff.value = chart.subActive[0] - chart.subActive[1];
	});

	misskeyApiGet('federation/stats', { limit: 10 }).then(res => {
		topSubInstancesForPie.value = [
			...res.topSubInstances.map(x => ({
				name: x.host,
				color: x.themeColor,
				value: x.followersCount,
				onClick: () => {
					os.pageWindow(`/instance-info/${x.host}`);
				},
			})),
			{ name: '(other)', color: '#80808080', value: res.otherFollowersCount },
		];
		topPubInstancesForPie.value = [
			...res.topPubInstances.map(x => ({
				name: x.host,
				color: x.themeColor,
				value: x.followingCount,
				onClick: () => {
					os.pageWindow(`/instance-info/${x.host}`);
				},
			})),
			{ name: '(other)', color: '#80808080', value: res.otherFollowingCount },
		];
	});

	misskeyApi('admin/server-info').then(serverInfoResponse => {
		serverInfo.value = serverInfoResponse;
	});

	misskeyApi('admin/show-users', {
		limit: 5,
		sort: '+createdAt',
	}).then(res => {
		newUsers.value = res;
	});

	misskeyApi('federation/instances', {
		sort: '+latestRequestReceivedAt',
		limit: 25,
	}).then(res => {
		activeInstances.value = res;
	});

	nextTick(() => {
		queueStatsConnection.send('requestLog', {
			id: genId(),
			length: 100,
		});
	});
});

onBeforeUnmount(() => {
	queueStatsConnection.dispose();
});

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.dashboard,
	icon: 'ti ti-dashboard',
}));
</script>

<style lang="scss" module>
.root {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr));
	align-items: start;
	gap: 24px 20px;
}

.section {
	min-width: 0;
}

.summary,
.wide {
	grid-column: 1 / -1;
}

@media (max-width: 500px) {
	.root {
		gap: 20px;
	}
}
</style>
