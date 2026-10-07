<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="$style.root">
	<div v-if="!showing" :class="$style.placeholder"></div>
	<slot v-else></slot>
</div>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, onActivated, onDeactivated, onBeforeUnmount, ref, useTemplateRef } from 'vue';

const rootEl = useTemplateRef('rootEl');
const showing = ref(false);
let active = true;

const observer = new IntersectionObserver(
	(entries) => {
		if (entries.some((entry) => entry.isIntersecting)) {
			showing.value = true;
			observer.disconnect();
		}
	},
);

function observe() {
	nextTick().then(() => {
		if (active && !showing.value && rootEl.value != null) {
			observer.observe(rootEl.value);
		}
	});
}

onMounted(observe);
onActivated(() => {
	active = true;
	observe();
});
onDeactivated(() => {
	active = false;
	observer.disconnect();
});

onBeforeUnmount(() => {
	active = false;
	observer.disconnect();
});
</script>

<style lang="scss" module>
.root {
	display: block;
}

.placeholder {
	display: block;
	min-height: 150px;
}
</style>
