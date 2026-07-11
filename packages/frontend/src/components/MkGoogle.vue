<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<search>
	<form :class="$style.root" @submit.prevent="search">
		<input v-model="query" :class="$style.input" type="search" :placeholder="q">
		<button type="submit" :class="$style.button"><i class="ti ti-search"></i> {{ i18n.tsx.searchUsingProvider({ provider: searchEngineLabel }) }}</button>
	</form>
</search>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import { createSearchUrl } from '@/utility/search-engine.js';

const props = defineProps<{
	q: string;
}>();

const query = ref(props.q);
const searchEngineLabel = computed(() => i18n.ts._searchEngine[prefer.searchEngine]);

const search = () => {
	window.open(createSearchUrl(prefer.searchEngine, query.value), '_blank', 'noopener');
};
</script>

<style lang="scss" module>
.root {
	display: flex;
	margin: 8px 0;
}

.input {
	flex-shrink: 1;
	padding: 10px;
	width: 100%;
	height: 40px;
	font-size: 16px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 4px 0 0 4px;
	-webkit-appearance: textfield;
}

.button {
	flex-shrink: 0;
	margin: 0;
	padding: 0 16px;
	border: solid 1px var(--MI_THEME-divider);
	border-left: none;
	border-radius: 0 4px 4px 0;

	&:active {
		box-shadow: 0 2px 4px rgba(#000, 0.15) inset;
	}
}
</style>
