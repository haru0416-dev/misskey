<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl">
	<div ref="headerEl" :class="$style.header">
		<slot name="header"></slot>
	</div>
	<div
		:class="$style.body"
		:data-sticky-container-header-height="headerHeight"
		:data-sticky-container-footer-height="footerHeight"
	>
		<slot></slot>
	</div>
	<div ref="footerEl" :class="$style.footer">
		<slot name="footer"></slot>
	</div>
</div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, provide, inject, ref, watch, useTemplateRef } from 'vue';
import { DI } from '@/di.js';

const rootEl = useTemplateRef('rootEl');
const headerEl = useTemplateRef('headerEl');
const footerEl = useTemplateRef('footerEl');

const headerHeight = ref<string | undefined>();
const childStickyTop = ref(0);
const parentStickyTop = inject(DI.currentStickyTop, ref(0));
provide(DI.currentStickyTop, childStickyTop);

const footerHeight = ref<string | undefined>();
const childStickyBottom = ref(0);
const parentStickyBottom = inject(DI.currentStickyBottom, ref(0));
provide(DI.currentStickyBottom, childStickyBottom);

const calc = () => {
	if (headerEl.value != null) {
		const height = headerEl.value.offsetHeight;
		childStickyTop.value = parentStickyTop.value + height;
		headerHeight.value = height.toString();
	}

	if (footerEl.value != null) {
		const height = footerEl.value.offsetHeight;
		childStickyBottom.value = parentStickyBottom.value + height;
		footerHeight.value = height.toString();
	}
};

let calcTimer: number | null = null;
const observer = new ResizeObserver(() => {
	if (calcTimer != null) {
		return;
	}
	calcTimer = window.setTimeout(() => {
		calcTimer = null;
		calc();
	}, 100);
});

onMounted(() => {
	calc();

	watch([parentStickyTop, parentStickyBottom], calc);

	if (headerEl.value != null) {
		observer.observe(headerEl.value);
	}

	if (footerEl.value != null) {
		observer.observe(footerEl.value);
	}
});

onUnmounted(() => {
	observer.disconnect();
	if (calcTimer != null) {
		window.clearTimeout(calcTimer);
		calcTimer = null;
	}
});

defineExpose({
	rootEl,
});
</script>

<style lang='scss' module>
.body {
	position: relative;
	z-index: 0;
	--MI-stickyTop: v-bind("childStickyTop + 'px'");
	--MI-stickyBottom: v-bind("childStickyBottom + 'px'");
}

.header {
	position: sticky;
	top: var(--MI-stickyTop, 0);
	z-index: 1;
}

.footer {
	position: sticky;
	bottom: var(--MI-stickyBottom, 0);
	z-index: 1;
}
</style>
