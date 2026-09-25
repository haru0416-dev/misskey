/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// https://vitejs.dev/config/build-options.html#build-modulepreload
import 'vite/modulepreload-polyfill';

// アイコンの CSS と起動処理の読み込みは同時に始める。CSS を待ってから起動処理を読み始めると、
// 往復 1 回ぶん待つ。CSS の link を先に挿入するので、スタイルの適用順は変わらない。
const iconsCss = import.meta.env.DEV
	? import('icons-subsetter/vendor/tabler-icons/tabler-icons.min.css')
	: import('icons-subsetter/built/tabler-icons-frontend.css');

import '@/style.scss';
import { createApp, defineComponent, h, markRaw, shallowRef } from 'vue';
import type { Component } from 'vue';
import { installPinia } from '@/store/pinia.js';
import { installQueryClient } from '@/query/client.js';

const rootComponent = shallowRef<Component | null>(null);
const app = createApp(
	defineComponent({
		name: 'MisskeyRoot',
		setup: () => () => (rootComponent.value == null ? null : h(rootComponent.value)),
	}),
);
installPinia(app);
installQueryClient(app);

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
	const subBootModule = import('@/boot/sub-boot.js');
	await iconsCss;
	const { subBoot } = await subBootModule;
	await subBoot(app, setRootComponent);
} else {
	const mainBootModule = import('@/boot/main-boot.js');
	await iconsCss;
	const { mainBoot } = await mainBootModule;
	await mainBoot(app, setRootComponent);
}
