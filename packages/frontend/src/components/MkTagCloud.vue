<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="$style.root">
	<canvas v-show="started" :id="idForCanvas" style="display: block;" :width="width" height="300" @contextmenu.prevent="() => {}"></canvas>
	<div :id="idForTags" ref="tagsEl" :class="[$style.tags, { [$style.fallback]: !started }]">
		<ul>
			<slot></slot>
		</ul>
	</div>
</div>
</template>

<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref, useTemplateRef } from 'vue';
import { themeManager } from '@/theme.js';
import tinycolor from 'tinycolor2';

let tagCanvasLoadPromise: Promise<TagCanvasApi> | null = null;

function loadTagCanvas(): Promise<TagCanvasApi> {
	if (window.TagCanvas) return Promise.resolve(window.TagCanvas);
	if (tagCanvasLoadPromise) return tagCanvasLoadPromise;

	const promise = new Promise<TagCanvasApi>((resolve, reject) => {
		const script = Object.assign(window.document.createElement('script'), {
			async: true,
			src: '/client-assets/tagcanvas.min.js',
		});
		script.addEventListener('load', () => {
			if (window.TagCanvas) {
				resolve(window.TagCanvas);
			} else {
				reject(new Error('TagCanvas did not initialize'));
			}
		}, { once: true });
		script.addEventListener('error', () => reject(new Error('Failed to load TagCanvas')), { once: true });
		window.document.head.appendChild(script);
	}).catch(error => {
		tagCanvasLoadPromise = null;
		throw error;
	});
	tagCanvasLoadPromise = promise;

	return promise;
}

const SAFE_FOR_HTML_ID = 'abcdefghijklmnopqrstuvwxyz';
const idForCanvas = Array.from({ length: 16 }, () => SAFE_FOR_HTML_ID[Math.floor(Math.random() * SAFE_FOR_HTML_ID.length)]).join('');
const idForTags = Array.from({ length: 16 }, () => SAFE_FOR_HTML_ID[Math.floor(Math.random() * SAFE_FOR_HTML_ID.length)]).join('');
const started = ref(false);
const rootEl = useTemplateRef('rootEl');
const tagsEl = useTemplateRef('tagsEl');
const width = ref(300);

let disposed = false;

function startTagCanvas(tagCanvas: TagCanvasApi): void {
	try {
		tagCanvas.Start(idForCanvas, idForTags, {
			textColour: '#ffffff',
			outlineColour: tinycolor(themeManager.currentCompiledTheme!.accent).toHexString(),
			outlineRadius: 10,
			initial: [-0.030, -0.010],
			frontSelect: true,
			imageRadius: 8,
			dragThreshold: 3,
			wheelZoom: false,
			reverse: true,
			depth: 0.5,
			maxSpeed: 0.2,
			minSpeed: 0.003,
			stretchX: 0.8,
			stretchY: 0.8,
		});
		started.value = true;
	} catch {
		tagCanvas.Delete(idForCanvas);
		tagsEl.value?.style.removeProperty('display');
		started.value = false;
	}
}

onMounted(() => {
	if (rootEl.value) width.value = rootEl.value.offsetWidth;
	loadTagCanvas().then(tagCanvas => {
		if (!disposed) startTagCanvas(tagCanvas);
	}).catch(() => {});
});

onBeforeUnmount(() => {
	disposed = true;
	if (started.value) window.TagCanvas?.Delete(idForCanvas);
});

defineExpose({
	update: () => {
		if (started.value) window.TagCanvas?.Update(idForCanvas);
	},
});
</script>

<style lang="scss" module>
.root {
	position: relative;
	overflow: clip;
	display: grid;
	place-items: center;
}

.tags {
	display: none;
}

.fallback {
	display: block;
	width: 100%;
	min-height: 300px;
	padding: 16px;
	box-sizing: border-box;

	& :global(ul) {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
}
</style>
