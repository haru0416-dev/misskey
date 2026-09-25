<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<EmNotesTimeline v-if="clip" icon="ti ti-paperclip" :href="`/clips/${clip.id}`" :title="clip.name" :pagination="pagination"/>
	<XNotFound v-else/>
</div>
</template>

<script setup lang="ts">
import { ref, computed, inject } from 'vue';
import * as Misskey from 'misskey-js';
import type { Paging } from '@/components/EmPagination.vue';
import EmNotesTimeline from '@/components/EmNotesTimeline.vue';
import XNotFound from '@/pages/not-found.vue';
import { misskeyApi } from '@/misskey-api.js';
import { assertServerContext } from '@/server-context.js';
import { DI } from '@/di.js';

const props = defineProps<{
	clipId: string;
}>();

const serverContext = inject(DI.serverContext)!;

const clip = ref<Misskey.entities.Clip | null>();

if (assertServerContext(serverContext, 'clip')) {
	clip.value = serverContext.clip;
} else {
	clip.value = await misskeyApi('clips/show', {
		clipId: props.clipId,
	}).catch(() => {
		return null;
	});
}

const pagination = computed(
	() =>
		({
			endpoint: 'clips/notes',
			params: {
				clipId: props.clipId,
			},
		}) as Paging,
);
</script>
