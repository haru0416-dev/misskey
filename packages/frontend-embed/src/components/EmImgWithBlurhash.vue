<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="root" :class="['chromatic-ignore', $style.root, { [$style.cover]: cover }]" :title="title ?? ''">
	<canvas v-show="hide" key="canvas" ref="canvas" :class="$style.canvas" :width="canvasWidth" :height="canvasHeight" :title="title ?? undefined" tabindex="-1"></canvas>
	<img v-show="!hide" key="img" ref="img" :height="imgHeight ?? undefined" :width="imgWidth ?? undefined" :class="$style.img" :src="src ?? undefined" :title="title ?? undefined" :alt="alt ?? undefined" loading="eager" decoding="async" tabindex="-1"/>
</div>
</template>

<script lang="ts">
import DrawBlurhash from '@/workers/draw-blurhash?worker';
import TestWebGL2 from '@/workers/test-webgl2?worker';
import { WorkerMultiDispatch } from '@shared/utility/worker-multi-dispatch.js';
import { extractAvgColorFromBlurhash } from '@shared/utility/extract-avg-color-from-blurhash.js';

const canvasPromise = new Promise<WorkerMultiDispatch | HTMLCanvasElement>(resolve => {
	// テスト環境で Web Worker インスタンスは作成できない
	if (import.meta.env.MODE === 'test') {
		const canvas = window.document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		resolve(canvas);
		return;
	}
	const testWorker = new TestWebGL2();
	testWorker.addEventListener('message', event => {
		if (event.data.result) {
			const workers = new WorkerMultiDispatch(
				() => new DrawBlurhash(),
				Math.max(1, Math.min(navigator.hardwareConcurrency - 1, 4)),
			);
			resolve(workers);
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
import { computed, nextTick, onMounted, onUnmounted, shallowRef, watch, ref } from 'vue';
import { render } from 'buraha';
import { calculateBlurhashDimensions } from '@shared/utility/blurhash.js';

const props = withDefaults(defineProps<{
	src?: string | null;
	hash?: string | null;
	alt?: string | null;
	title?: string | null;
	height?: number | undefined;
	width?: number | undefined;
	cover?: boolean;
	forceBlurhash?: boolean;
	onlyAvgColor?: boolean; // 軽量化のためにBlurhashを使わずに平均色だけを描画
}>(), {
	src: null,
	alt: '',
	title: null,
	height: 64,
	width: 64,
	cover: true,
	forceBlurhash: false,
	onlyAvgColor: false,
});

const viewId = crypto.randomUUID();
const canvas = shallowRef<HTMLCanvasElement>();
const root = shallowRef<HTMLDivElement>();
const img = shallowRef<HTMLImageElement>();
const loaded = ref(false);
const canvasWidth = ref(64);
const canvasHeight = ref(64);
const imgWidth = ref(props.width);
const imgHeight = ref(props.height);
const bitmapTmp = ref<CanvasImageSource | undefined>();
const hide = computed(() => !loaded.value || props.forceBlurhash);
let disposed = false;

function waitForDecode() {
	if (props.src != null && props.src !== '') {
		nextTick()
			.then(() => img.value?.decode())
			.then(() => {
				loaded.value = true;
			}, error => {
				console.log('Error occurred during decoding image', img.value, error);
			});
	} else {
		loaded.value = false;
	}
}

watch([() => props.width, () => props.height, root], () => {
	const dimensions = calculateBlurhashDimensions(props.width, props.height);
	canvasWidth.value = dimensions.canvasWidth;
	canvasHeight.value = dimensions.canvasHeight;

	const clientWidth = root.value?.clientWidth ?? 300;
	imgWidth.value = clientWidth;
	imgHeight.value = Math.max(1, Math.round(clientWidth / dimensions.ratio));
}, {
	immediate: true,
});

function drawImage(bitmap: CanvasImageSource) {
	if (disposed) {
		if (typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap) bitmap.close();
		return;
	}

	// canvasがない（mountedされていない）場合はTmpに保存しておく
	if (!canvas.value) {
		if (typeof ImageBitmap !== 'undefined' && bitmapTmp.value instanceof ImageBitmap) bitmapTmp.value.close();
		bitmapTmp.value = bitmap;
		return;
	}

	// canvasがあれば描画する
	bitmapTmp.value = undefined;
	try {
		const ctx = canvas.value.getContext('2d');
		if (!ctx) return;
		ctx.drawImage(bitmap, 0, 0, canvasWidth.value, canvasHeight.value);
	} finally {
		if (typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap) bitmap.close();
	}
}

function drawAvg() {
	if (!canvas.value) return;

	const color = (props.hash != null && extractAvgColorFromBlurhash(props.hash)) || '#888';

	const ctx = canvas.value.getContext('2d');
	if (!ctx) return;

	// avgColorでお茶をにごす
	ctx.beginPath();
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, canvasWidth.value, canvasHeight.value);
}

async function draw() {
	if (import.meta.env.MODE === 'test' && props.hash == null) return;

	drawAvg();

	if (props.hash == null) return;

	if (props.onlyAvgColor) return;

	const work = await canvasPromise;
	if (work instanceof WorkerMultiDispatch) {
		work.postMessage(
			{
				id: viewId,
				hash: props.hash,
			},
			undefined,
		);
	} else {
		try {
			render(props.hash, work);
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

canvasPromise.then(work => {
	if (work instanceof WorkerMultiDispatch) {
		work.addListener(workerOnMessage);
	}

	draw();
});

watch(() => props.src, () => {
	waitForDecode();
});

watch(() => props.hash, () => {
	draw();
});

onMounted(() => {
	// drawImageがmountedより先に呼ばれている場合はここで描画する
	if (bitmapTmp.value) {
		drawImage(bitmapTmp.value);
	}
	waitForDecode();
});

onUnmounted(() => {
	disposed = true;
	if (typeof ImageBitmap !== 'undefined' && bitmapTmp.value instanceof ImageBitmap) bitmapTmp.value.close();
	bitmapTmp.value = undefined;
	canvasPromise.then(work => {
		if (work instanceof WorkerMultiDispatch) {
			work.removeListener(workerOnMessage);
		}
	});
});
</script>

<style lang="scss" module>
.root {
	position: relative;
	width: 100%;
	height: 100%;

	&.cover {
		> .canvas,
		> .img {
			object-fit: cover;
		}
	}
}

.canvas,
.img {
	display: block;
	width: 100%;
	height: 100%;
}

.canvas {
	object-fit: contain;
}

.img {
	object-fit: contain;
}
</style>
