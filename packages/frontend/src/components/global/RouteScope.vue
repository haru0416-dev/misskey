<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component :is="component" ref="pageInstance" v-bind="pageProps"/>
</template>

<script lang="ts" setup>
import { computed, inject, isVNode, onActivated, onBeforeUnmount, onDeactivated, onMounted, onUpdated, provide, ref, shallowReactive, useTemplateRef, watch } from 'vue';
import type { Component, ComponentPublicInstance, VNode } from 'vue';
import type { Router } from '@/router.js';
import { DI, registerRouteElement } from '@/di.js';
import { randomId } from '@/utility/random-id.js';

const props = withDefaults(defineProps<{
	component: Component;
	pageProps: Record<string, unknown>;
	router: Router;
	active?: boolean;
}>(), { active: true });

const parentActive = inject(DI.routeActive, null);
const activated = ref(true);
const active = computed(() => props.active && activated.value && (parentActive?.value ?? true));

provide(DI.routeActive, active);
provide(DI.searchMarkers, shallowReactive(new Map<string, number>()));
provide(DI.viewId, randomId());
provide(DI.router, props.router);
provide(DI.inAppSearchMarkerId, computed(() => active.value ? props.router.currentRef.value._parsedRoute.hash ?? null : null));

const pageInstance = useTemplateRef<ComponentPublicInstance>('pageInstance');
const registeredElements = new Map<Element, () => void>();
const roots = new Set<Element>();
function collectRoots(vnode: VNode) {
	if (vnode.el instanceof Element) {
		roots.add(vnode.el);
		return;
	}
	if (vnode.component != null) {
		collectRoots(vnode.component.subTree);
		return;
	}
	if (Array.isArray(vnode.children)) {
		for (const child of vnode.children) if (isVNode(child)) collectRoots(child);
	}
}
function registerElement() {
	roots.clear();
	if (pageInstance.value != null) collectRoots(pageInstance.value.$.subTree);
	for (const [element, remove] of registeredElements) {
		if (!roots.has(element)) {
			remove();
			registeredElements.delete(element);
		}
	}
	for (const element of roots) {
		if (!registeredElements.has(element)) registeredElements.set(element, registerRouteElement(element, active));
	}
}
onMounted(registerElement);
onUpdated(registerElement);
watch(pageInstance, registerElement, { flush: 'post' });
onBeforeUnmount(() => {
	activated.value = false;
	for (const remove of registeredElements.values()) remove();
	registeredElements.clear();
});

onActivated(() => { activated.value = true; });
onDeactivated(() => { activated.value = false; });
</script>
