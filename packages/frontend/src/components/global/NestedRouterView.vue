<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Suspense :timeout="0">
	<component :is="currentPageComponent" :key="key" v-bind="pageProps"/>

	<template #fallback>
		<MkLoading/>
	</template>
</Suspense>
</template>

<script lang="ts" setup>
import { computed, inject, onActivated, provide, ref, shallowRef, watch } from 'vue';
import type { Router } from '@/router.js';
import type { PathResolvedResult } from '@/lib/nirax.js';
import MkLoadingPage from '@/pages/loading.vue';
import { DI } from '@/di.js';
import { deepEqual } from '@/utility/deep-equal.js';

const props = defineProps<{
	router?: Router;
}>();

const router = props.router ?? inject(DI.router);

if (router == null) {
	throw new Error('no router provided');
}
const currentRouter = router;

const currentDepth = inject(DI.routerCurrentDepth, 0);
provide(DI.routerCurrentDepth, currentDepth + 1);
const routeActive = inject(DI.routeActive, null);

function resolveNested(current: PathResolvedResult, d = 0, targetDepth = currentDepth): PathResolvedResult | null {
	if (d === targetDepth) return current;
	return current.child ? resolveNested(current.child, d + 1, targetDepth) : null;
}

const current = resolveNested(router.current)!;
const currentPageComponent = shallowRef('component' in current.route ? current.route.component : MkLoadingPage);
const currentPageProps = ref(current.props);
const pageProps = computed(() => Object.fromEntries(currentPageProps.value));
const ownerParent = routeActive != null && currentDepth > 0 ? resolveNested(router.current, 0, currentDepth - 1) : null;
let currentRoute = current.route;
let currentHash = current._parsedRoute.hash;
const key = ref(router.getCurrentFullPath());

function update(resolved: PathResolvedResult) {
	if (routeActive?.value === false) return;
	if (ownerParent != null) {
		const parent = resolveNested(resolved, 0, currentDepth - 1);
		if (parent?.route !== ownerParent.route || !deepEqual(parent.props, ownerParent.props)) return;
	}
	const current = resolveNested(resolved);
	if (current == null || 'redirect' in current.route) {
		return;
	}
	// hash は SearchMarker の強調・スクロールにも使われるため、props が同じでも変更時は再生成する。
	if (
		current.route === currentRoute &&
		current.route.component === currentPageComponent.value &&
		current._parsedRoute.hash === currentHash &&
		deepEqual(current.props, currentPageProps.value)
	) {
		return;
	}
	currentPageComponent.value = current.route.component;
	currentPageProps.value = current.props;
	key.value = currentRouter.getCurrentFullPath();
	currentRoute = current.route;
	currentHash = current._parsedRoute.hash;
}

router.useListener('change', ({ resolved }) => update(resolved));
onActivated(() => update(router.current));
if (routeActive != null) watch(routeActive, (active) => { if (active) update(router.current); });
</script>
