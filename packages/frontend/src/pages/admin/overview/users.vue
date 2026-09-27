<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<Transition :name="prefer.animation ? '_transition_zoom' : ''" mode="out-in">
		<MkLoading v-if="fetching"/>
		<MkError v-else-if="fetchError" @retry="fetch()"/>
		<div v-else class="users">
			<MkA v-for="(user, i) in newUsers" :key="user.id" :to="`/admin/user/${user.id}`" class="user">
				<MkUserCardMini :user="user"/>
			</MkA>
		</div>
	</Transition>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import { useInterval } from '@shared/utility/use-interval.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkUserCardMini from '@/features/users/components/MkUserCardMini.vue';
import { prefer } from '@/preferences.js';

const newUsers = ref<Misskey.entities.UserDetailed[] | null>(null);
const fetching = ref(true);
// 失敗したまま読み込み中にせず、再試行できる状態にする。
const fetchError = ref(false);

const fetch = async () => {
	try {
		const _newUsers = await misskeyApi('admin/show-users', {
			limit: 5,
			sort: '+createdAt',
			origin: 'local',
		});
		newUsers.value = _newUsers;
		fetchError.value = false;
	} catch {
		fetchError.value = true;
	} finally {
		fetching.value = false;
	}
};

useInterval(fetch, 1000 * 60, {
	immediate: true,
	afterMounted: true,
});
</script>

<style lang="scss" module>
.root {
	&:global {
		> .users {
			display: grid;
			grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
			gap: 12px;

			.chart-move {
				transition: transform 1s ease;
			}

			> .user:hover {
				text-decoration: none;
			}
		}
	}
}
</style>
