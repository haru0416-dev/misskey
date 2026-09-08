<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<span v-if="loading">Loading<MkEllipsis/></span>
	<button v-if="failed" type="button" class="_button" @click="renderWidget">{{ i18n.ts.retry }}</button>
	<div ref="container" :class="$style.widget"></div>
</div>
</template>

<script lang="ts">
const scripts = new Map<string, Promise<void>>();

function loadScript(url: string): Promise<void> {
	if (customElements.get('cap-widget')) return Promise.resolve();
	const existing = scripts.get(url);
	if (existing) return existing;
	const promise = new Promise<void>((resolve, reject) => {
		const script = document.createElement('script');
		script.src = url;
		script.async = true;
		script.onload = () => resolve();
		script.onerror = () => {
			script.remove();
			scripts.delete(url);
			reject(new Error('Cap widget could not be loaded'));
		};
		document.head.appendChild(script);
	});
	scripts.set(url, promise);
	return promise;
}
</script>

<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	sitekey: string | null;
	instanceUrl?: string | null;
	secretKey?: string | null;
	modelValue?: string | null;
}>();
const emit = defineEmits<{
	(ev: 'update:modelValue', value: string | null): void;
}>();
const container = useTemplateRef('container');
const loading = ref(false);
const failed = ref(false);
let generation = 0;
type CapWidget = HTMLElement & { reset(): void };
let widget: CapWidget | null = null;

function clear() {
	generation++;
	widget?.remove();
	widget = null;
}

async function renderWidget() {
	clear();
	emit('update:modelValue', null);
	failed.value = false;
	loading.value = false;
	if (!props.instanceUrl || !props.sitekey || !container.value) return;
	const current = generation;
	loading.value = true;
	try {
		const base = `${props.instanceUrl.replace(/\/$/, '')}/`;
		(window as Window & { CAP_CUSTOM_WASM_URL?: string }).CAP_CUSTOM_WASM_URL = new URL('assets/cap_wasm_bg.wasm', base).href;
		await loadScript(new URL('assets/widget.js', base).href);
		if (current !== generation || !container.value) return;
		widget = document.createElement('cap-widget') as CapWidget;
		widget.setAttribute('data-cap-api-endpoint', new URL(`${encodeURIComponent(props.sitekey)}/`, base).href);
		widget.addEventListener('solve', (event) => {
			if (current !== generation) return;
			const token = (event as CustomEvent<{ token: string }>).detail.token;
			emit('update:modelValue', typeof token === 'string' ? token : null);
		});
		for (const event of ['reset', 'error']) {
			widget.addEventListener(event, () => {
				if (current === generation) emit('update:modelValue', null);
			});
		}
		container.value.appendChild(widget);
	} catch {
		if (current === generation) failed.value = true;
	} finally {
		if (current === generation) loading.value = false;
	}
}

function reset() {
	widget?.reset();
	emit('update:modelValue', null);
}

onMounted(renderWidget);
watch(() => [props.instanceUrl, props.sitekey, props.secretKey], renderWidget);
onBeforeUnmount(clear);
defineExpose({ reset });
</script>

<style lang="scss" module>
.root {
	--cap-widget-width: 100%;
	--cap-background: var(--MI_THEME-panel);
	--cap-color: var(--MI_THEME-fg);
	--cap-border-color: var(--MI_THEME-divider);
}
.widget {
	width: min(260px, 100%);

	:global(cap-widget) {
		display: block;
		width: 100%;
	}
}
</style>
