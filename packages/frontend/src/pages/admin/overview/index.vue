<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_spacer" style="--MI_SPACER-w: 1000px;">
	<div :class="$style.root">
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
import { computed } from 'vue';
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
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkFoldableSection from '@/components/layout/MkFoldableSection.vue';

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
