<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 900px;">
		<div class="_gaps">
			<div>
				<MkInput v-model="host" :debounce="true" class="">
					<template #prefix><i class="ti ti-search"></i></template>
					<template #label>{{ i18n.ts.host }}</template>
				</MkInput>
				<FormSplit style="margin-top: var(--MI-margin);">
					<MkSelect v-model="state" :items="stateDef">
						<template #label>{{ i18n.ts.state }}</template>
					</MkSelect>
					<MkSelect v-model="sort" :items="sortDef">
						<template #label>{{ i18n.ts.sort }}</template>
					</MkSelect>
				</FormSplit>
			</div>

			<MkPagination v-slot="{items}" :key="host + state" :paginator="paginator">
				<div :class="$style.instances">
					<MkA v-for="instance in items" :key="instance.id" v-tooltip.mfm="`Status: ${getStatus(instance)}`" :class="$style.instance" :to="`/instance-info/${instance.host}`">
						<MkInstanceCardMini :instance="instance"/>
					</MkA>
				</div>
			</MkPagination>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { computed } from 'vue';
import MkInput from '@/components/form/MkInput.vue';
import MkSelect from '@/components/form/MkSelect.vue';
import MkPagination from '@/components/layout/MkPagination.vue';
import MkInstanceCardMini from '@/features/instances/components/MkInstanceCardMini.vue';
import FormSplit from '@/components/form/split.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useFederationInstanceSearch } from '@/features/instances/federation-instance-search.js';

const { host, state, stateDef, sort, sortDef, paginator } = useFederationInstanceSearch([
	{ label: i18n.ts.all, value: 'all' },
	{ label: i18n.ts.federating, value: 'federating' },
	{ label: i18n.ts.subscribing, value: 'subscribing' },
	{ label: i18n.ts.publishing, value: 'publishing' },
	{ label: i18n.ts.suspended, value: 'suspended' },
	{ label: i18n.ts.blocked, value: 'blocked' },
	{ label: i18n.ts.silence, value: 'silenced' },
	{ label: i18n.ts.notResponding, value: 'notResponding' },
]);

function getStatus(instance: Misskey.entities.FederationInstance) {
	switch (instance.suspensionState) {
		case 'manuallySuspended':
			return 'Manually Suspended';
		case 'goneSuspended':
			return 'Automatically Suspended (Gone)';
		case 'autoSuspendedForNotResponding':
			return 'Automatically Suspended (Not Responding)';
		case 'none':
			break;
	}
	if (instance.isBlocked) {
		return 'Blocked';
	}
	if (instance.isSilenced) {
		return 'Silenced';
	}
	if (instance.isNotResponding) {
		return 'Error';
	}
	return 'Alive';
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.federation,
	icon: 'ti ti-whirl',
}));
</script>

<style lang="scss" module>
.instances {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
	gap: 12px;
}

.instance:hover {
	text-decoration: none;
}
</style>
