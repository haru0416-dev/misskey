<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<button
	class="_button"
	:class="[$style.root, { [$style.wait]: wait, [$style.active]: isFollowing, [$style.full]: full }]"
	:disabled="wait"
	@click="onClick"
>
	<template v-if="!wait">
		<template v-if="isFollowing">
			<span v-if="full" :class="$style.text">{{ i18n.ts.unfollow }}</span><i class="ti ti-minus"></i>
		</template>
		<template v-else>
			<span v-if="full" :class="$style.text">{{ i18n.ts.follow }}</span><i class="ti ti-plus"></i>
		</template>
	</template>
	<template v-else>
		<span v-if="full" :class="$style.text">{{ i18n.ts.processing }}</span><MkLoading :em="true"/>
	</template>
</button>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	channel: Misskey.entities.Channel;
	full?: boolean;
}>(), {
	full: false,
});

const isFollowing = ref(props.channel.isFollowing);
const wait = ref(false);

async function onClick() {
	wait.value = true;

	try {
		if (isFollowing.value) {
			await misskeyApi('channels/unfollow', {
				channelId: props.channel.id,
			});
			isFollowing.value = false;
		} else {
			await misskeyApi('channels/follow', {
				channelId: props.channel.id,
			});
			isFollowing.value = true;
		}
	} catch (err) {
		console.error(err);
	} finally {
		wait.value = false;
	}
}
</script>

<style lang="scss" module>
@use '@/features/users/components/follow-button';

// 共有 mixin が出力するクラスを $style の型へ載せるための列挙。空のルールは CSS に出力されない。
.active, .full, .root, .text, .wait {}

@include follow-button.styles(var(--MI_THEME-accent));
</style>
