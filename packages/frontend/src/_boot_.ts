/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// https://vitejs.dev/config/build-options.html#build-modulepreload
import 'vite/modulepreload-polyfill';

if (import.meta.env.DEV) {
	await import('@tabler/icons-webfont/dist/tabler-icons.scss');
} else {
	await import('icons-subsetter/built/tabler-icons-frontend.css');
}

import '@/style.scss';
import { createApp, defineComponent, h, markRaw, shallowRef } from 'vue';
import type { Component } from 'vue';
import { installPinia } from '@/store/pinia.js';

const rootComponent = shallowRef<Component | null>(null);
const app = createApp(
	defineComponent({
		name: 'MisskeyRoot',
		setup: () => () => (rootComponent.value == null ? null : h(rootComponent.value)),
	}),
);
installPinia(app);

function setRootComponent(component: Component): void {
	rootComponent.value = markRaw(component);
}

const subBootPaths = [
	'/share',
	'/auth',
	'/miauth',
	'/oauth',
	'/signup-complete',
	'/verify-email',
	'/install-extensions',
];

if (subBootPaths.some((i) => window.location.pathname === i || window.location.pathname.startsWith(i + '/'))) {
	const { subBoot } = await import('@/boot/sub-boot.js');
	await subBoot(app, setRootComponent);
} else {
	const { mainBoot } = await import('@/boot/main-boot.js');
	await mainBoot(app, setRootComponent);
}
