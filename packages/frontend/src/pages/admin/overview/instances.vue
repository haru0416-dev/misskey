<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<Transition :name="prefer.animation ? '_transition_zoom' : ''" mode="out-in">
		<MkLoading v-if="fetching"/>
		<MkError v-else-if="fetchError" @retry="fetch()"/>
		<div v-else :class="$style.instances">
			<MkA v-for="(instance, i) in instances" :key="instance.id" v-tooltip.mfm.noDelay="`${instance.name}\n${instance.host}\n${instance.softwareName} ${instance.softwareVersion}`" :to="`/instance-info/${instance.host}`" :class="$style.instance">
				<MkInstanceCardMini :instance="instance"/>
			</MkA>
		</div>
	</Transition>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import { useInterval } from '@/composables/useInterval.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkInstanceCardMini from '@/features/instance/components/MkInstanceCardMini.vue';
import { prefer } from '@/preferences.js';

const instances = ref<Misskey.entities.FederationInstance[]>([]);
const fetching = ref(true);
// 失敗したまま読み込み中にせず、再試行できる状態にする。
const fetchError = ref(false);

const fetch = async () => {
	try {
		const fetchedInstances = await misskeyApi('federation/instances', {
			sort: '+latestRequestReceivedAt',
			limit: 6,
		});
		instances.value = fetchedInstances;
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
.instances {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
	gap: 12px;
}

.instance:hover {
	text-decoration: none;
}
</style>
