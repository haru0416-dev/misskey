<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="root" :class="['chromatic-ignore', $style.root, { [$style.cover]: cover }]" :title="title ?? ''" :data-marker="marker ?? undefined" :data-object-fit="cover ? 'cover' : 'contain'">
	<TransitionGroup
		v-bind="transitionGroupProps"
	>
		<MkBlurhash
			key="canvas"
			:class="$style.canvas"
			:blurhash="hash ?? null"
			:width="props.width"
			:height="props.height"
			:onlyAvgColor="onlyAvgColor"
			:show="hide"
		/>
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

<script lang="ts" setup>
import { computed, onMounted, onUnmounted, useCssModule, useTemplateRef, watch, ref } from 'vue';
import { calculateBlurhashDimensions } from '@shared/utility/blurhash.js';
import { prefer } from '@/preferences.js';
import MkBlurhash from '@/features/media-viewer/components/MkBlurhash.vue';

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
	marker?: string;
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

const style = useCssModule();
const transitionGroupProps = computed(() => {
	if (!prefer.animation) return {};

	const leaveActiveClass = props.transition?.leaveActiveClass ?? style.transition_leaveActive;
	return {
		...(props.transition?.duration ? { duration: props.transition.duration } : {}),
		...(props.transition?.enterActiveClass ? { enterActiveClass: props.transition.enterActiveClass } : {}),
		...(leaveActiveClass ? { leaveActiveClass } : {}),
		...(props.transition?.enterFromClass ? { enterFromClass: props.transition.enterFromClass } : {}),
		...(props.transition?.leaveToClass ? { leaveToClass: props.transition.leaveToClass } : {}),
		...(props.transition?.enterToClass ? { enterToClass: props.transition.enterToClass } : {}),
		...(props.transition?.leaveFromClass ? { leaveFromClass: props.transition.leaveFromClass } : {}),
	};
});

const root = useTemplateRef('root');
const img = useTemplateRef('img');
const loaded = ref(false);
const imgWidth = ref(props.width);
const imgHeight = ref(props.height);
const hide = computed(() => !loaded.value || props.forceBlurhash);

// 読み込み前はimg要素がv-showでdisplay:noneになっており、ネイティブのloading="lazy"は
// レイアウトボックスを持たない要素の交差判定ができず永久にフェッチを開始しない。
// そのため、常時表示されているroot要素をIntersectionObserverで監視し、
// ビューポート近傍に入ってから初めてsrcを結びつける（自前の遅延読み込み）
const shouldLoad = ref(false);
let intersectionObserver: IntersectionObserver | null = null;

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
	const clientWidth = root.value?.clientWidth ?? 300;
	imgWidth.value = clientWidth;
	imgHeight.value = Math.max(1, Math.round(clientWidth / dimensions.ratio));
}, {
	immediate: true,
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

onMounted(() => {
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
	intersectionObserver?.disconnect();
	intersectionObserver = null;
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
