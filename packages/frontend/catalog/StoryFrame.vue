<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="error != null" :class="$style.error">
	<p :class="$style.errorTitle">この story は描画できませんでした</p>
	<pre :class="$style.errorBody">{{ error }}</pre>
</div>
<component :is="component" v-else-if="component"/>
</template>

<script lang="ts" setup>
import { onErrorCaptured, ref, watch } from 'vue';
import type { Component } from 'vue';

const props = defineProps<{
	component: Component | null;
}>();

const error = ref<string | null>(null);

// story が setup で throw すると、隔離しない限り描画木ごと壊れて以降の story も出せなくなる。
// ここで止めて、壊れた部分木を捨てる。
onErrorCaptured((err) => {
	error.value = err instanceof Error ? (err.stack ?? err.message) : String(err);
	return false;
});

watch(
	() => props.component,
	() => {
		error.value = null;
	},
);
</script>

<style lang="scss" module>
.error {
	padding: 16px;
	border: solid 1px var(--MI_THEME-error, #f00);
	border-radius: 8px;
	background: var(--MI_THEME-panel);
}

.errorTitle {
	margin: 0 0 8px;
	font-weight: 700;
}

.errorBody {
	overflow-x: auto;
	margin: 0;
	font-size: 0.85em;
	white-space: pre-wrap;
}
</style>
