<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<Transition :name="prefer.animation ? '_transition_zoom' : ''" mode="out-in">
		<MkLoading v-if="fetching"/>
		<MkError v-else-if="fetchError" @retry="fetchModerators()"/>
		<div v-else :class="$style.root" class="_panel">
			<MkA v-for="user in moderators" :key="user.id" class="user" :to="`/admin/user/${user.id}`">
				<MkAvatar :user="user" class="avatar" indicator/>
			</MkA>
		</div>
	</Transition>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { prefer } from '@/preferences.js';

const moderators = ref<Misskey.entities.UserDetailed[] | null>(null);
const fetching = ref(true);
// 失敗したまま読み込み中にせず、再試行できる状態にする。
const fetchError = ref(false);

async function fetchModerators() {
	fetching.value = true;
	fetchError.value = false;
	try {
		moderators.value = await misskeyApi('admin/show-users', {
			sort: '+lastActiveDate',
			state: 'adminOrModerator',
			limit: 30,
		});
	} catch {
		fetchError.value = true;
	} finally {
		fetching.value = false;
	}
}

onMounted(() => {
	fetchModerators();
});
</script>

<style lang="scss" module>
.root {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(30px, 40px));
	gap: 12px;
	place-content: center;
	padding: 12px;

	&:global {
		> .user {
			width: 100%;
			height: 100%;
			aspect-ratio: 1;

			> .avatar {
				width: 100%;
				height: 100%;
			}
		}
	}
}
</style>
