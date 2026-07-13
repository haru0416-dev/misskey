<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<canvas
	v-show="show"
	ref="canvas"
	:width="canvasWidth"
	:height="canvasHeight"
	draggable="false"
	tabindex="-1"
	style="-webkit-user-drag: none;"
></canvas>
</template>

<script lang="ts">
import DrawBlurhash from '@/workers/draw-blurhash?worker';
import TestWebGL2 from '@/workers/test-webgl2?worker';
import { WorkerMultiDispatch } from '@shared/utility/worker-multi-dispatch.js';

const isTest = import.meta.env.MODE === 'test' || window.localStorage.getItem('__MISSKEY_E2E_TEST__') === 'true';

const canvasPromise = new Promise<WorkerMultiDispatch | HTMLCanvasElement>(resolve => {
	if (isTest) {
		const canvas = window.document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		resolve(canvas);
		return;
	}

	const testWorker = new TestWebGL2();
	testWorker.addEventListener('message', event => {
		if (event.data.result) {
			resolve(new WorkerMultiDispatch(
				() => new DrawBlurhash(),
				Math.max(1, Math.min(navigator.hardwareConcurrency - 1, 4)),
			));
		} else {
			const canvas = window.document.createElement('canvas');
			canvas.width = 64;
			canvas.height = 64;
			resolve(canvas);
		}
		testWorker.terminate();
	});
});
</script>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import { render } from 'buraha';
import { calculateBlurhashDimensions } from '@shared/utility/blurhash.js';
import { extractAvgColorFromBlurhash } from '@shared/utility/extract-avg-color-from-blurhash.js';
import { genId } from '@/utility/id.js';

const props = withDefaults(defineProps<{
	blurhash: string | null;
	onlyAvgColor?: boolean;
	width?: number;
	height?: number;
	show?: boolean;
}>(), {
	onlyAvgColor: false,
	width: 64,
	height: 64,
	show: true,
});

const canvas = useTemplateRef('canvas');
const canvasWidth = ref(64);
const canvasHeight = ref(64);
const viewId = genId();
const bitmapTmp = shallowRef<CanvasImageSource>();
let disposed = false;

watch([() => props.width, () => props.height], () => {
	const dimensions = calculateBlurhashDimensions(props.width, props.height);
	canvasWidth.value = dimensions.canvasWidth;
	canvasHeight.value = dimensions.canvasHeight;
}, { immediate: true });

function closeBitmap(bitmap: CanvasImageSource | undefined) {
	if (typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap) bitmap.close();
}

function drawImage(bitmap: CanvasImageSource) {
	if (disposed) {
		closeBitmap(bitmap);
		return;
	}
	if (canvas.value == null) {
		closeBitmap(bitmapTmp.value);
		bitmapTmp.value = bitmap;
		return;
	}

	bitmapTmp.value = undefined;
	try {
		canvas.value.getContext('2d')?.drawImage(bitmap, 0, 0, canvasWidth.value, canvasHeight.value);
	} finally {
		closeBitmap(bitmap);
	}
}

function drawAvg() {
	const ctx = canvas.value?.getContext('2d');
	if (ctx == null) return;
	ctx.fillStyle = (props.blurhash != null && extractAvgColorFromBlurhash(props.blurhash)) || '#888';
	ctx.fillRect(0, 0, canvasWidth.value, canvasHeight.value);
}

async function draw() {
	if (isTest && props.blurhash == null) return;
	drawAvg();
	if (props.blurhash == null || props.onlyAvgColor) return;

	const work = await canvasPromise;
	if (disposed) return;
	if (work instanceof WorkerMultiDispatch) {
		work.postMessage({ id: viewId, hash: props.blurhash }, undefined);
	} else {
		try {
			render(props.blurhash, work);
			drawImage(work);
		} catch (error) {
			console.error('Error occurred during drawing blurhash', error);
		}
	}
}

function workerOnMessage(event: MessageEvent) {
	if (event.data.id !== viewId) return;
	drawImage(event.data.bitmap as ImageBitmap);
}

void canvasPromise.then(work => {
	if (disposed) return;
	if (work instanceof WorkerMultiDispatch) work.addListener(workerOnMessage);
	void draw();
});

watch(() => props.blurhash, () => void draw());
watch(() => props.onlyAvgColor, () => void draw());

onMounted(() => {
	if (bitmapTmp.value != null) drawImage(bitmapTmp.value);
	else void draw();
});

onUnmounted(() => {
	disposed = true;
	closeBitmap(bitmapTmp.value);
	bitmapTmp.value = undefined;
	void canvasPromise.then(work => {
		if (work instanceof WorkerMultiDispatch) work.removeListener(workerOnMessage);
	});
});
</script>
