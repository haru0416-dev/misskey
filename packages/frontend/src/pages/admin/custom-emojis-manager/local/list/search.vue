<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div :class="$style.fields">
		<MkInput v-model="model.name" type="search" autocapitalize="off" @enter="emit('search')">
			<template #label>{{ emojiFieldLabel('name') }}</template>
		</MkInput>
		<MkInput v-model="model.category" type="search" autocapitalize="off" @enter="emit('search')">
			<template #label>{{ emojiFieldLabel('category') }}</template>
		</MkInput>
		<MkInput v-model="model.aliases" type="search" autocapitalize="off" @enter="emit('search')">
			<template #label>{{ emojiFieldLabel('aliases') }}</template>
		</MkInput>
		<MkInput v-model="model.type" type="search" autocapitalize="off" @enter="emit('search')">
			<template #label>{{ emojiFieldLabel('type') }}</template>
		</MkInput>
		<MkInput v-model="model.license" type="search" autocapitalize="off" @enter="emit('search')">
			<template #label>{{ emojiFieldLabel('license') }}</template>
		</MkInput>
		<MkInput v-model="queryRolesText" type="text" readonly autocapitalize="off" @click="onQueryRolesEditClicked">
			<template #label>{{ emojiFieldLabel('roles') }}</template>
			<template #suffix><i class="ti ti-pencil"></i></template>
		</MkInput>
		<MkSelect v-model="model.sensitive" :items="booleanItems">
			<template #label>{{ emojiFieldLabel('isSensitive') }}</template>
		</MkSelect>
		<MkSelect v-model="model.localOnly" :items="booleanItems">
			<template #label>{{ emojiFieldLabel('localOnly') }}</template>
		</MkSelect>
		<MkSelect v-model="model.limit" :items="limitItems">
			<template #label>{{ i18n.ts._customEmojisManager._gridCommon.searchLimit }}</template>
		</MkSelect>
		<MkInput v-model="model.updatedAtFrom" type="date">
			<template #label>{{ i18n.ts._customEmojisManager._gridCommon.updatedAtFrom }}</template>
		</MkInput>
		<MkInput v-model="model.updatedAtTo" type="date">
			<template #label>{{ i18n.ts._customEmojisManager._gridCommon.updatedAtTo }}</template>
		</MkInput>
	</div>

	<MkFolder :spacerMax="8" :spacerMin="8">
		<template #icon><i class="ti ti-arrows-sort"></i></template>
		<template #label>{{ i18n.ts._customEmojisManager._gridCommon.sortOrder }}</template>
		<MkSortOrderEditor
			:baseOrderKeyNames="gridSortOrderKeys"
			:currentOrders="sortOrders"
			:keyLabel="emojiFieldLabel"
			@update="onSortOrderUpdate"
		/>
	</MkFolder>

	<div :class="$style.buttons">
		<MkButton primary @click="emit('search')">{{ i18n.ts.search }}</MkButton>
		<MkButton @click="onQueryResetButtonClicked">{{ i18n.ts.reset }}</MkButton>
	</div>
</div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import MkInput from '@/components/form/MkInput.vue';
import MkSelect from '@/components/form/MkSelect.vue';
import MkButton from '@/components/form/MkButton.vue';
import MkFolder from '@/components/layout/MkFolder.vue';
import MkSortOrderEditor from '@/components/form/MkSortOrderEditor.vue';
import { emojiFieldLabel, gridSortOrderKeys } from '../../impl.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import type { EmojiSearchQuery } from './index.vue';
import type { SortOrder } from '@/components/form/MkSortOrderEditor.define.js';
import type { GridSortOrderKey } from '../../impl.js';

const props = defineProps<{
	query: EmojiSearchQuery;
}>();

const emit = defineEmits<{
	(ev: 'queryUpdated', query: EmojiSearchQuery): void;
	(ev: 'sortOrderUpdated', orders: SortOrder<GridSortOrderKey>[]): void;
	(ev: 'search'): void;
}>();

const booleanItems = [
	{ label: '-', value: null },
	{ label: i18n.ts.yes, value: 'true' },
	{ label: i18n.ts.no, value: 'false' },
];
const limitItems = [25, 50, 100].map((n) => ({ label: `${n}`, value: n }));

const model = ref<EmojiSearchQuery>(props.query);
const queryRolesText = computed(() => model.value.roles.map(it => it.name).join(', '));

watch(model, () => {
	emit('queryUpdated', model.value);
}, { deep: true });

const sortOrders = ref<SortOrder<GridSortOrderKey>[]>([]);

function onSortOrderUpdate(orders: SortOrder<GridSortOrderKey>[]) {
	sortOrders.value = orders;
	emit('sortOrderUpdated', orders);
}

function onQueryResetButtonClicked() {
	model.value.name = '';
	model.value.category = '';
	model.value.aliases = '';
	model.value.type = '';
	model.value.license = '';
	model.value.sensitive = null;
	model.value.localOnly = null;
	model.value.updatedAtFrom = '';
	model.value.updatedAtTo = '';
	model.value.roles = [];
	sortOrders.value = [];
	emit('sortOrderUpdated', []);
}

async function onQueryRolesEditClicked() {
	const result = await os.selectRole({
		initialRoleIds: model.value.roles.map(it => it.id),
		title: i18n.ts._customEmojisManager._local._list.dialogSelectRoleTitle,
		publicOnly: true,
	});
	if (result.canceled) {
		return;
	}

	model.value.roles = result.result;
}
</script>

<style lang="scss" module>
.fields {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	gap: 12px 16px;
}

.buttons {
	display: flex;
	justify-content: flex-end;
	gap: 8px;
}
</style>
