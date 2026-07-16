<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_spacer" style="--MI_SPACER-w: 1200px;">
	<MkTab
		v-if="instance.federation !== 'none'"
		v-model="origin"
		:tabs="[
			{ key: 'local', label: i18n.ts.local },
			{ key: 'remote', label: i18n.ts.remote },
		]"
		:class="$style.tab"
	/>
	<div v-if="origin === 'local'">
		<MkFoldableSection class="_margin" persistKey="explore-pinned-users">
			<template #header><i class="ti ti-bookmark ti-fw" :class="$style.sectionIcon" aria-hidden="true"></i>{{ i18n.ts.pinnedUsers }}</template>
			<MkUserList :paginator="pinnedUsersPaginator"/>
		</MkFoldableSection>
		<MkFoldableSection class="_margin" persistKey="explore-popular-users">
			<template #header><i class="ti ti-chart-line ti-fw" :class="$style.sectionIcon" aria-hidden="true"></i>{{ i18n.ts.popularUsers }}</template>
			<MkUserList :paginator="popularUsersPaginator"/>
		</MkFoldableSection>
		<MkFoldableSection class="_margin" persistKey="explore-recently-updated-users">
			<template #header><i class="ti ti-message ti-fw" :class="$style.sectionIcon" aria-hidden="true"></i>{{ i18n.ts.recentlyUpdatedUsers }}</template>
			<MkUserList :paginator="recentlyUpdatedUsersPaginator"/>
		</MkFoldableSection>
		<MkFoldableSection class="_margin" persistKey="explore-recently-registered-users">
			<template #header><i class="ti ti-plus ti-fw" :class="$style.sectionIcon" aria-hidden="true"></i>{{ i18n.ts.recentlyRegisteredUsers }}</template>
			<MkUserList :paginator="recentlyRegisteredUsersPaginator"/>
		</MkFoldableSection>
	</div>
	<div v-else>
		<MkFoldableSection :foldable="true" :expanded="false" class="_margin">
			<template #header><i class="ti ti-hash ti-fw" :class="$style.sectionIcon" aria-hidden="true"></i>{{ i18n.ts.popularTags }}</template>

			<div :class="$style.tags">
				<MkA v-for="tag in tagsLocal" :key="'local:' + tag.tag" :to="`/user-tags/${tag.tag}`" :class="$style.local">{{ tag.tag }}</MkA>
				<MkA v-for="tag in tagsRemote" :key="'remote:' + tag.tag" :to="`/user-tags/${tag.tag}`">{{ tag.tag }}</MkA>
			</div>
		</MkFoldableSection>

		<MkFoldableSection class="_margin">
			<template #header><i class="ti ti-chart-line ti-fw" :class="$style.sectionIcon" aria-hidden="true"></i>{{ i18n.ts.popularUsers }}</template>
			<MkUserList :paginator="popularUsersFPaginator"/>
		</MkFoldableSection>
		<MkFoldableSection class="_margin">
			<template #header><i class="ti ti-message ti-fw" :class="$style.sectionIcon" aria-hidden="true"></i>{{ i18n.ts.recentlyUpdatedUsers }}</template>
			<MkUserList :paginator="recentlyUpdatedUsersFPaginator"/>
		</MkFoldableSection>
		<MkFoldableSection class="_margin">
			<template #header><i class="ti ti-rocket ti-fw" :class="$style.sectionIcon" aria-hidden="true"></i>{{ i18n.ts.recentlyDiscoveredUsers }}</template>
			<MkUserList :paginator="recentlyRegisteredUsersFPaginator"/>
		</MkFoldableSection>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, markRaw } from 'vue';
import * as Misskey from 'misskey-js';
import MkUserList from '@/features/users/components/MkUserList.vue';
import MkFoldableSection from '@/components/layout/MkFoldableSection.vue';
import MkTab from '@/components/layout/MkTab.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { instance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { Paginator } from '@/utility/paginator.js';

const origin = ref<'local' | 'remote'>('local');
const tagsLocal = ref<Misskey.entities.Hashtag[]>([]);
const tagsRemote = ref<Misskey.entities.Hashtag[]>([]);

const pinnedUsersPaginator = markRaw(new Paginator('pinned-users', {
	noPaging: true,
}));

const popularUsersPaginator = markRaw(new Paginator('users', {
	limit: 10,
	noPaging: true,
	params: {
		state: 'alive',
		origin: 'local',
		sort: '+follower',
	},
}));

const recentlyUpdatedUsersPaginator = markRaw(new Paginator('users', {
	limit: 10,
	noPaging: true,
	params: {
		origin: 'local',
		sort: '+updatedAt',
	},
}));

const recentlyRegisteredUsersPaginator = markRaw(new Paginator('users', {
	limit: 10,
	noPaging: true,
	params: {
		origin: 'local',
		state: 'alive',
		sort: '+createdAt',
	},
}));

const popularUsersFPaginator = markRaw(new Paginator('users', {
	limit: 10,
	noPaging: true,
	params: {
		state: 'alive',
		origin: 'remote',
		sort: '+follower',
	},
}));

const recentlyUpdatedUsersFPaginator = markRaw(new Paginator('users', {
	limit: 10,
	noPaging: true,
	params: {
		origin: 'combined',
		sort: '+updatedAt',
	},
}));

const recentlyRegisteredUsersFPaginator = markRaw(new Paginator('users', {
	limit: 10,
	noPaging: true,
	params: {
		origin: 'combined',
		sort: '+createdAt',
	},
}));

misskeyApi('hashtags/list', {
	sort: '+attachedLocalUsers',
	attachedToLocalUserOnly: true,
	limit: 30,
}).then(tags => {
	tagsLocal.value = tags;
});
misskeyApi('hashtags/list', {
	sort: '+attachedRemoteUsers',
	attachedToRemoteUserOnly: true,
	limit: 30,
}).then(tags => {
	tagsRemote.value = tags;
});
</script>

<style lang="scss" module>
.tab {
	margin-bottom: var(--MI-margin);
}

.sectionIcon {
	margin-right: var(--MI-space-sm);
}

.tags {
	display: flex;
	flex-wrap: wrap;
	gap: var(--MI-space-xs) var(--MI-space-lg);
	overflow-wrap: anywhere;
}

.local {
	font-weight: bold;
}
</style>
