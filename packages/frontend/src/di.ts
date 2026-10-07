/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ComponentInternalInstance, InjectionKey, Ref, ComputedRef } from 'vue';
import { computed, shallowReactive } from 'vue';
import type { PageMetadata } from '@/page.js';
import type { Router } from '@/router.js';

export const DI = {
	routerCurrentDepth: Symbol() as InjectionKey<number>,
	router: Symbol() as InjectionKey<Router>,
	mock: Symbol() as InjectionKey<boolean>,
	pageMetadata: Symbol() as InjectionKey<Ref<PageMetadata | null>>,
	viewId: Symbol() as InjectionKey<string>,
	routeActive: Symbol() as InjectionKey<Readonly<Ref<boolean>>>,
	searchMarkers: Symbol() as InjectionKey<Map<string, number>>,
	currentStickyTop: Symbol() as InjectionKey<Ref<number>>,
	currentStickyBottom: Symbol() as InjectionKey<Ref<number>>,
	mfmEmojiReactCallback: Symbol() as InjectionKey<(emoji: string) => void>,
	inModal: Symbol() as InjectionKey<boolean>,
	inAppSearchMarkerId: Symbol() as InjectionKey<Ref<string | null>>,
	inChannel: Symbol() as InjectionKey<ComputedRef<string | null> | null>, // 現在開いているチャンネルのID
	mkLightboxItemVideoEl: Symbol() as InjectionKey<Ref<HTMLVideoElement | null>>,
	mkLightboxItemActive: Symbol() as InjectionKey<Ref<boolean>>,
};

export function getRouteActive(instance: object | null | undefined): Readonly<Ref<boolean>> | undefined {
	if (instance == null || !('$' in instance)) return undefined;
	const owner = instance.$ as ComponentInternalInstance & { provides: Record<symbol, unknown> };
	return owner.provides[DI.routeActive] as Readonly<Ref<boolean>> | undefined;
}

type RouteElementOwners = {
	owners: Set<Readonly<Ref<boolean>>>;
	active: ComputedRef<boolean>;
};
const routeElements = new WeakMap<Element, RouteElementOwners>();

export function registerRouteElement(element: Element, active: Readonly<Ref<boolean>>): () => void {
	let entry = routeElements.get(element);
	if (entry == null) {
		const owners = shallowReactive(new Set<Readonly<Ref<boolean>>>());
		entry = {
			owners,
			active: computed(() => {
				if (owners.size === 0) return false;
				for (const owner of owners) if (!owner.value) return false;
				return true;
			}),
		};
		routeElements.set(element, entry);
	}
	const registered = entry;
	registered.owners.add(active);
	return () => {
		registered.owners.delete(active);
		if (registered.owners.size === 0 && routeElements.get(element) === registered) routeElements.delete(element);
	};
}

export function getRouteActiveForElement(element: Element | null | undefined): Readonly<Ref<boolean>> | undefined {
	for (let current = element; current != null; current = current.parentElement) {
		const active = routeElements.get(current)?.active;
		if (active != null) return active;
	}
	return undefined;
}
