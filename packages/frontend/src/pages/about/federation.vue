<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
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

	<MkPagination v-slot="{items}" ref="instances" :key="host + state" :paginator="paginator">
		<div :class="$style.items">
			<MkA v-for="instance in items" :key="instance.id" v-tooltip.mfm="`Status: ${getStatus(instance)}`" :class="$style.item" :to="`/instance-info/${instance.host}`">
				<MkInstanceCardMini :instance="instance"/>
			</MkA>
		</div>
	</MkPagination>
</div>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import MkInput from '@/components/form/MkInput.vue';
import MkSelect from '@/components/form/MkSelect.vue';
import MkPagination from '@/components/layout/MkPagination.vue';
import MkInstanceCardMini from '@/features/instances/components/MkInstanceCardMini.vue';
import FormSplit from '@/components/form/split.vue';
import { i18n } from '@/i18n.js';
import { useFederationInstanceSearch } from '@/features/instances/federation-instance-search.js';

const { host, state, stateDef, sort, sortDef, paginator } = useFederationInstanceSearch([
	{ label: i18n.ts.all, value: 'all' },
	{ label: i18n.ts.federating, value: 'federating' },
	{ label: i18n.ts.subscribing, value: 'subscribing' },
	{ label: i18n.ts.publishing, value: 'publishing' },
	{ label: i18n.ts.suspended, value: 'suspended' },
	{ label: i18n.ts.silence, value: 'silenced' },
	{ label: i18n.ts.blocked, value: 'blocked' },
	{ label: i18n.ts.notResponding, value: 'notResponding' },
]);

function getStatus(instance: Misskey.entities.FederationInstance) {
	if (instance.isSuspended) {
		return 'Suspended';
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
</script>

<style lang="scss" module>
.items {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
	gap: 12px;
}

.item:hover {
	text-decoration: none;
}
</style>
