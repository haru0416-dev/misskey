<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs" :swipable="true">
	<div v-if="tab === 'note'" class="_spacer" style="--MI_SPACER-w: 800px;">
		<div v-if="notesSearchAvailable || ignoreNotesSearchAvailable">
			<XNote :query="query" v-bind="{ ...(userId === undefined ? {} : { userId }), ...(username === undefined ? {} : { username }), ...(host === undefined ? {} : { host }) }"/>
		</div>
		<div v-else>
			<MkInfo warn>{{ i18n.ts.notesSearchNotAvailable }}</MkInfo>
		</div>
	</div>

	<div v-else-if="tab === 'hashtag'" class="_spacer" style="--MI_SPACER-w: 800px;">
		<XHashtag :query="query"/>
	</div>

	<div v-else-if="tab === 'user'" class="_spacer" style="--MI_SPACER-w: 800px;">
		<div v-if="usersSearchAvailable">
			<XUser :query="query" :origin="origin"/>
		</div>
		<div v-else>
			<MkInfo warn>{{ i18n.ts.usersSearchNotAvailable }}</MkInfo>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, ref, toRef } from 'vue';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { notesSearchAvailable, usersSearchAvailable } from '@/utility/check-permissions.js';
import MkInfo from '@/components/display/MkInfo.vue';

const props = withDefaults(defineProps<{
	query?: string,
	userId?: string,
	username?: string,
	host?: string | null,
	type?: 'note' | 'hashtag' | 'user',
	origin?: 'combined' | 'local' | 'remote',
	// Storybook 以外では指定しない。
	ignoreNotesSearchAvailable?: boolean,
}>(), {
	query: '',
	type: 'note',
	origin: 'combined',
	ignoreNotesSearchAvailable: false,
});

const XNote = defineAsyncComponent(() => import('./note.vue'));
const XHashtag = defineAsyncComponent(() => import('./hashtag.vue'));
const XUser = defineAsyncComponent(() => import('./user.vue'));

const tab = ref(toRef(props, 'type').value);

const headerActions = computed(() => []);

const headerTabs = computed(() => [{
	key: 'note',
	title: i18n.ts.notes,
	icon: 'ti ti-pencil',
}, {
	key: 'hashtag',
	title: i18n.ts.hashtags,
	icon: 'ti ti-hash',
}, {
	key: 'user',
	title: i18n.ts.users,
	icon: 'ti ti-users',
}]);

definePage(() => ({
	title: i18n.ts.search,
	icon: 'ti ti-search',
}));
</script>
