<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<EmNotesTimeline v-if="tag" icon="ti ti-hash" :href="`/tags/${tag}`" :title="`#${tag}`" :pagination="pagination"/>
	<XNotFound v-else/>
</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Paging } from '@/components/EmPagination.vue';
import EmNotesTimeline from '@/components/EmNotesTimeline.vue';
import XNotFound from '@/pages/not-found.vue';

const props = defineProps<{
	tag: string;
}>();

const pagination = computed(
	() =>
		({
			endpoint: 'notes/search-by-tag',
			params: {
				tag: props.tag,
			},
		}) as Paging,
);
</script>
