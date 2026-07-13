<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="root" :class="['chromatic-ignore', $style.root, { [$style.cover]: cover }]" :title="title ?? ''">
	<TransitionGroup
		:duration="prefer.animation && props.transition?.duration || undefined"
		:enterActiveClass="prefer.animation && props.transition?.enterActiveClass || undefined"
		:leaveActiveClass="prefer.animation && (props.transition?.leaveActiveClass ?? $style.transition_leaveActive) || undefined"
		:enterFromClass="prefer.animation && props.transition?.enterFromClass || undefined"
		:leaveToClass="prefer.animation && props.transition?.leaveToClass || undefined"
		:enterToClass="prefer.animation && props.transition?.enterToClass || undefined"
		:leaveFromClass="prefer.animation && props.transition?.leaveFromClass || undefined"
	>
		<canvas
			v-show="hide"
			key="canvas"
			ref="canvas"
			:class="$style.canvas"
			:width="canvasWidth"
			:height="canvasHeight"
			:title="title ?? undefined"
			draggable="false"
			tabindex="-1"
			style="-webkit-user-drag: none;"
		></canvas>
		<img
			v-show="!hide"
			key="img"
			ref="img"
			:height="imgHeight ?? undefined"
			:width="imgWidth ?? undefined"
			:class="$style.img"
			:src="imgSrc"
			:title="title ?? undefined"
			:alt="alt ?? undefined"
			decoding="async"
			draggable="false"
			tabindex="-1"
			style="-webkit-user-drag: none;"
			@load="onLoad"
		/>
	</TransitionGroup>
</div>
</template>

<script lang="ts">
import DrawBlurhash from '@/workers/draw-blurhash?worker';
import TestWebGL2 from '@/workers/test-webgl2?worker';
import { WorkerMultiDispatch } from '@shared/utility/worker-multi-dispatch.js';
import { extractAvgColorFromBlurhash } from '@shared/utility/extract-avg-color-from-blurhash.js';

// テスト環境で Web Worker インスタンスは作成できない
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
import { computed, onMounted, onUnmounted, useTemplateRef, watch, ref } from 'vue';
import { genId } from '@/utility/id.js';
import { calculateBlurhashDimensions } from '@shared/utility/blurhash.js';
import { render } from 'buraha';
import { prefer } from '@/preferences.js';

const props = withDefaults(defineProps<{
	transition?: {
		duration?: number | { enter: number; leave: number; };
		enterActiveClass?: string;
		leaveActiveClass?: string;
		enterFromClass?: string;
		leaveToClass?: string;
		enterToClass?: string;
		leaveFromClass?: string;
	} | null;
	src?: string | null;
	hash?: string | null;
	alt?: string | null;
	title?: string | null;
	height?: number;
	width?: number;
	cover?: boolean;
	forceBlurhash?: boolean;
	onlyAvgColor?: boolean; // 軽量化のためにBlurhashを使わずに平均色だけを描画
}>(), {
	transition: null,
	src: null,
	alt: '',
	title: null,
	height: 64,
	width: 64,
	cover: true,
	forceBlurhash: false,
	onlyAvgColor: false,
});

const viewId = genId();
const canvas = useTemplateRef('canvas');
const root = useTemplateRef('root');
const img = useTemplateRef('img');
const loaded = ref(false);
const canvasWidth = ref(64);
const canvasHeight = ref(64);
const imgWidth = ref(props.width);
const imgHeight = ref(props.height);
const bitmapTmp = ref<CanvasImageSource | undefined>();
const hide = computed(() => !loaded.value || props.forceBlurhash);

// 読み込み前はimg要素がv-showでdisplay:noneになっており、ネイティブのloading="lazy"は
// レイアウトボックスを持たない要素の交差判定ができず永久にフェッチを開始しない。
// そのため、常時表示されているroot要素をIntersectionObserverで監視し、
// ビューポート近傍に入ってから初めてsrcを結びつける（自前の遅延読み込み）
const shouldLoad = ref(false);
let intersectionObserver: IntersectionObserver | null = null;
let disposed = false;

const imgSrc = computed(() => (shouldLoad.value && props.src != null && props.src !== '') ? props.src : undefined);

function onLoad() {
	img.value?.decode().then(() => {
		loaded.value = true;
	}, error => {
		console.log('Error occurred during decoding image', img.value, error);
	});
}

function checkAlreadyLoaded() {
	// srcが同一URLの他要素で既にブラウザキャッシュ済みの場合、loadイベントが発火しないことがあるため、
	// complete状態を能動的にチェックする
	if (imgSrc.value != null && img.value?.complete) {
		onLoad();
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
	if (isTest && props.hash == null) return;

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

watch(imgSrc, (newSrc) => {
	// srcが結びついていない場合はonLoadが発火しないため、ここでblurhash表示に戻す
	if (newSrc == null) {
		loaded.value = false;
	} else {
		checkAlreadyLoaded();
	}
}, {
	flush: 'post',
});

watch(() => props.hash, () => {
	draw();
});

onMounted(() => {
	// drawImageがmountedより先に呼ばれている場合はここで描画する
	if (bitmapTmp.value) {
		drawImage(bitmapTmp.value);
	}

	intersectionObserver = new IntersectionObserver((entries) => {
		if (entries.some(entry => entry.isIntersecting)) {
			shouldLoad.value = true;
			intersectionObserver?.disconnect();
			intersectionObserver = null;
		}
	}, {
		rootMargin: '300px',
	});
	if (root.value) {
		intersectionObserver.observe(root.value);
	}
});

onUnmounted(() => {
	disposed = true;
	intersectionObserver?.disconnect();
	intersectionObserver = null;
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
.transition_leaveActive {
	position: absolute;
	top: 0;
	left: 0;
}
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
