<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="root" :class="[$style.root, { [$style.highlighted]: highlighted }]">
	<slot :isParentOfTarget="isParentOfTarget"></slot>
</div>
</template>

<script lang="ts" setup>
import {
	computed, inject, onActivated, onBeforeUnmount, onDeactivated, onMounted,
	provide, ref, shallowReactive, useTemplateRef, watch,
} from 'vue';
import { DI } from '@/di.js';

const props = defineProps<{
	markerId?: string;
	label?: string;
	icon?: string;
	keywords?: string[];
	children?: string[];
	inlining?: string[];
}>();

const rootEl = useTemplateRef('root');
const injectedSearchMarkerId = inject(DI.inAppSearchMarkerId, null);
const router = inject(DI.router, null);
const routeActive = inject(DI.routeActive, null);
const parentMarkers = inject(DI.searchMarkers, null);
const markers = parentMarkers ?? shallowReactive(new Map<string, number>());
if (parentMarkers == null) provide(DI.searchMarkers, markers);

const windowHash = ref(window.location.hash.slice(1));
const activated = ref(true);
const active = computed(() => activated.value && (routeActive?.value ?? true));
const searchMarkerId = computed(() => {
	// null は「この view に対象がない」であり、メイン画面へ所有権を戻す値ではない。
	if (injectedSearchMarkerId != null) return injectedSearchMarkerId.value;
	if (router != null) return router.currentRef.value._parsedRoute.hash ?? null;
	return windowHash.value || null;
});
const isParentOfTarget = computed(() => searchMarkerId.value != null && (props.children?.includes(searchMarkerId.value) ?? false));
const highlighted = computed(() => active.value && searchMarkerId.value != null && (
	props.markerId === searchMarkerId.value ||
	(isParentOfTarget.value && (markers.get(searchMarkerId.value) ?? 0) === 0)
));

let mounted = false;
let registeredId: string | null = null;
let lastScrollTarget: string | null = null;

function unregister() {
	if (registeredId == null) return;
	const count = (markers.get(registeredId) ?? 1) - 1;
	if (count === 0) markers.delete(registeredId);
	else markers.set(registeredId, count);
	registeredId = null;
}

function register() {
	const id = mounted && active.value ? props.markerId ?? null : null;
	if (id === registeredId) return;
	unregister();
	if (id != null) {
		markers.set(id, (markers.get(id) ?? 0) + 1);
		registeredId = id;
	}
}

function scrollToTarget() {
	if (!mounted || !highlighted.value) {
		lastScrollTarget = null;
		return;
	}
	if (lastScrollTarget === searchMarkerId.value) return;
	lastScrollTarget = searchMarkerId.value;
	rootEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function updateWindowHash() {
	windowHash.value = window.location.hash.slice(1);
}

watch([() => props.markerId, active], register, { flush: 'sync' });
watch([searchMarkerId, highlighted], scrollToTarget, { flush: 'post' });

onMounted(() => {
	mounted = true;
	register();
	scrollToTarget();
	if (injectedSearchMarkerId == null && router == null) {
		window.addEventListener('hashchange', updateWindowHash);
		window.addEventListener('popstate', updateWindowHash);
	}
});
onActivated(() => {
	activated.value = true;
	register();
	scrollToTarget();
});
onDeactivated(() => {
	activated.value = false;
	lastScrollTarget = null;
	unregister();
});
onBeforeUnmount(() => {
	mounted = false;
	unregister();
	window.removeEventListener('hashchange', updateWindowHash);
	window.removeEventListener('popstate', updateWindowHash);
});
</script>

<style lang="scss" module>
.root {
	position: relative;
}

.highlighted {
	&::after {
		content: '';
		position: absolute;
		top: -8px;
		left: -8px;
		width: calc(100% + 16px);
		height: calc(100% + 16px);
		border-radius: 6px;
		animation: blink 1s 3.5;
		pointer-events: none;
	}
}

@keyframes blink {
	0%, 100% {
		background: color(from var(--MI_THEME-accent) srgb r g b / 0.1);
		border: 1px solid color(from var(--MI_THEME-accent) srgb r g b / 0.75);
	}
	50% {
		background: transparent;
		border: 1px solid transparent;
	}
}
</style>
