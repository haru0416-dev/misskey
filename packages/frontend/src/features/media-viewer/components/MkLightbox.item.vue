<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="$style.root">
	<div
		ref="mainEl"
		:class="$style.main"
		@pointerdown.passive="onPointerdown"
		@pointermove.passive="onPointermove"
		@pointerup.passive="onPointerup"
		@pointercancel.passive="cancelPointerGesture"
		@touchstart.passive="doubleTapDetector.onTouchstart"
		@touchmove.passive="doubleTapDetector.onTouchmove"
		@touchcancel.passive="cancelPointerGesture"
		@contextmenu="cancelPointerGesture"
		@wheel="onWheel"
		@click="onClick"
	>
		<div :class="[$style.transformer, { [$style.transition]: enableTransition }]" :style="{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }" @transitionend.self="enableTransition = false" @transitioncancel.self="enableTransition = false">
			<div :class="[$style.contentWrapper, { [$style.hideForFallback]: hideForFallback }]">
				<button
					v-if="hide"
					type="button"
					data-gallery-click-action="hidden"
					:class="[$style.hidden, { [$style.sensitive]: content.file?.isSensitive && prefer.highlightSensitiveMedia }]"
					:style="hiddenStyle"
					@click.stop="onHiddenClick"
				>
					<span :class="$style.hiddenWrapper">
						<MkBlurhash v-if="content.type === 'image' && content.file?.blurhash != null" :class="$style.hiddenBlurhash" :blurhash="content.file.blurhash" :height="content.height ?? undefined" :width="content.width ?? undefined"/>
						<img v-else-if="content.type === 'video' && content.thumbnailUrl != null" :src="content.thumbnailUrl" :class="$style.hiddenThumbnail" alt="">
						<span v-else :class="$style.hiddenPlaceholder"></span>
						<span :class="[$style.hiddenText, { [$style.withBlur]: content.type === 'video' && content.thumbnailUrl != null }]">
							<span :class="$style.hiddenTextWrapper">
								<b v-if="content.file?.isSensitive"><i class="ti ti-eye-exclamation"></i> {{ i18n.ts.sensitive }}</b>
								<b v-else><i class="ti" :class="content.type === 'image' ? 'ti-photo' : 'ti-movie'"></i> {{ content.type === 'image' ? i18n.ts.image : i18n.ts.video }}</b>
								<span>{{ i18n.ts.clickToShow }}</span>
							</span>
						</span>
					</span>
				</button>
				<template v-else>
					<img v-if="(!originalContentLoaded || !thumbnailContentLoaded) && content.thumbnailUrl != null" :class="[$style.content, $style.thumbnail]" :src="content.thumbnailUrl" alt="" draggable="false" @load="onThumbnailLoaded" @error="onThumbnailSettled">
					<template v-if="activated">
						<img v-if="content.type === 'image'" :class="$style.content" :src="content.url" :alt="content.file?.comment ?? ''" draggable="false" @load="onOriginalLoaded">
						<video v-else ref="videoEl" data-gallery-click-action="video" :class="$style.content" :src="content.url" :aria-label="content.file?.comment ?? content.filename ?? i18n.ts.video" draggable="false" :controls="prefer.useNativeUiForVideoAudioPlayer" playsinline @loadedmetadata="onOriginalLoaded" @click.stop="onVideoClick"></video>
						<div v-if="content.type === 'video' && !prefer.useNativeUiForVideoAudioPlayer && !isVideoPlaying" data-gallery-click-action="video" :class="$style.playIconWrapper"><div :class="$style.playIcon"><i class="ti ti-player-play"></i></div></div>
					</template>
					<div v-if="activated && (!originalContentLoaded || (content.type === 'video' && isVideoPlaying && !isVideoActuallyPlaying))" :class="$style.loading"><MkLoading/></div>
				</template>
			</div>
		</div>
	</div>

	<header :class="[$style.header, { [$style.infoShowing]: infoShowing && !isZooming }]">
		<div :class="$style.title" class="_acrylic">
			<button type="button" class="_button" :class="$style.titleButton" :aria-label="i18n.ts.menu" @click="openMenu"><i class="ti ti-dots"></i></button>
			<div :class="$style.titleText"><MkCondensedLine :minScale="0.5">{{ content.filename }}</MkCondensedLine></div>
			<button type="button" class="_button" :class="$style.titleButton" :aria-label="i18n.ts.close" @click="closeThis"><i class="ti ti-x"></i></button>
		</div>
	</header>
	<footer :class="[$style.footer, { [$style.infoShowing]: infoShowing && !isZooming }]">
		<div v-if="content.type === 'video' && !hide && !prefer.useNativeUiForVideoAudioPlayer" :class="$style.mediaControl"><MkVideoControl v-if="videoEl != null" ref="videoControl"/></div>
	</footer>
</div>
</template>

<script lang="ts">
import * as Misskey from 'misskey-js';

type Size = { width: number; height: number };
type Rect = Size & { left: number; top: number };

export type LightboxContent = {
	id: string;
	type: 'image' | 'video';
	url: string;
	thumbnailUrl?: string | null;
	width?: number | null;
	height?: number | null;
	filename?: string | null;
	file?: Misskey.entities.DriveFile;
	sourceElement?: HTMLElement | null;
};

export function calculateSourceTransform({ fit, contentRenderingRect, sourceRect }: { fit: string; contentRenderingRect: Rect; sourceRect: Rect }): { x: number; y: number; scale: number } {
	const scale = fit === 'cover'
		? Math.max(sourceRect.width / contentRenderingRect.width, sourceRect.height / contentRenderingRect.height)
		: Math.min(sourceRect.width / contentRenderingRect.width, sourceRect.height / contentRenderingRect.height);
	const sourceContentWidth = contentRenderingRect.width * scale;
	const sourceContentHeight = contentRenderingRect.height * scale;
	return {
		x: sourceRect.left + (sourceRect.width - sourceContentWidth) / 2 - contentRenderingRect.left * scale,
		y: sourceRect.top + (sourceRect.height - sourceContentHeight) / 2 - contentRenderingRect.top * scale,
		scale,
	};
}

export function calculatePinchScale(scale: number, distanceDelta: number): number {
	return Math.max(Number.EPSILON, scale * Math.max(Number.EPSILON, 1 + distanceDelta / 200));
}

export function normalizeGestureTransform(transform: { x: number; y: number; scale: number }): { x: number; y: number; scale: number } {
	if (!Number.isFinite(transform.scale) || transform.scale <= 1) return { x: 0, y: 0, scale: 1 };
	return transform;
}
</script>

<script lang="ts" setup>
import { computed, markRaw, nextTick, provide, ref, toRef, useTemplateRef, watch } from 'vue';
import MkBlurhash from '@/features/media-viewer/components/MkBlurhash.vue';
import MkVideoControl from '@/features/media-viewer/components/MkVideoControl.vue';
import XFileInfo from '@/features/media-viewer/components/MkLightbox.item.fileinfo.vue';
import type { MenuItem } from '@/types/menu.js';
import { DI } from '@/di.js';
import * as os from '@/os.js';
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';
import { canRevealFile, shouldHideFileByDefault } from '@/features/media-viewer/sensitive-file.js';
import { makeDoubleTapDetector } from '@/features/media-viewer/double-tap.js';
import { deviceKind } from '@/utility/device-kind.js';
import { isTouchUsing } from '@/utility/touch.js';
import { getFileMenu } from '@/features/media-viewer/get-file-menu.js';

const props = withDefaults(defineProps<{ content: LightboxContent; activated: boolean; initiallyOpened?: boolean }>(), { initiallyOpened: false });
const emit = defineEmits<{ (ev: 'close'): void; (ev: 'horizontalSwipe', offset: number): void; (ev: 'next'): void; (ev: 'prev'): void; (ev: 'cancelHorizontalSwipe'): void }>();
const rootEl = useTemplateRef('rootEl');
const mainEl = useTemplateRef('mainEl');
const videoEl = useTemplateRef('videoEl');
const videoControl = useTemplateRef('videoControl');
provide(DI.mkLightboxItemVideoEl, videoEl);
provide(DI.mkLightboxItemActive, toRef(props, 'activated'));

const originalContentLoaded = ref(false);
const thumbnailContentLoaded = ref(false);
const enableTransition = ref(false);
const infoShowing = ref(false);
const hide = ref(true);
const isVideoPlaying = computed(() => videoControl.value?.isPlaying ?? false);
const isVideoActuallyPlaying = computed(() => videoControl.value?.isActuallyPlaying ?? false);
const headerSize = 32;
const footerSize = props.content.type === 'video' && !prefer.useNativeUiForVideoAudioPlayer ? 80 : 0;
const padding = deviceKind === 'smartphone'
	? { top: headerSize + 10, right: 0, bottom: footerSize + 10, left: 0 }
	: { top: Math.max(30, headerSize + 10), right: 30, bottom: Math.max(30, footerSize + 10), left: 30 };

function calcContentRenderingSize(content: LightboxContent) {
	if (content.width == null || content.height == null || content.width <= 0 || content.height <= 0) return null;
	const ratio = Math.min((window.innerWidth - padding.left - padding.right) / content.width, (window.innerHeight - padding.top - padding.bottom) / content.height);
	return { width: content.width * ratio, height: content.height * ratio };
}

const contentRenderingSize = calcContentRenderingSize(props.content);
const hiddenStyle = computed(() => contentRenderingSize == null ? { width: '100%', height: '100%' } : { width: `${contentRenderingSize.width}px`, height: `${contentRenderingSize.height}px` });
const transform = ref({ x: 0, y: 0, scale: 1 });
const isZooming = ref(false);
let canOpenAnimation = false;

function getContentRenderingRect(): Rect | null {
	if (contentRenderingSize == null) return null;
	return {
		left: (window.innerWidth - contentRenderingSize.width + padding.left - padding.right) / 2,
		top: (window.innerHeight - contentRenderingSize.height + padding.top - padding.bottom) / 2,
		...contentRenderingSize,
	};
}

function getSourceTransform() {
	const sourceElement = props.content.sourceElement;
	const contentRect = getContentRenderingRect();
	if (sourceElement == null || contentRect == null) return null;
	const sourceRect = sourceElement.getBoundingClientRect();
	if (sourceRect.width <= 0 || sourceRect.height <= 0) return null;
	return calculateSourceTransform({ fit: sourceElement.dataset.objectFit ?? window.getComputedStyle(sourceElement).objectFit, contentRenderingRect: contentRect, sourceRect });
}

if (props.activated) {
	const source = getSourceTransform();
	if (source != null) {
		transform.value = source;
		canOpenAnimation = true;
	}
}
const hideForFallback = ref(!canOpenAnimation);

function clampTransform(next: { x: number; y: number; scale: number }) {
	const normalized = normalizeGestureTransform(next);
	if (mainEl.value == null || normalized.scale === 1) return normalized;
	const rect = mainEl.value.getBoundingClientRect();
	const margin = 24;
	return {
		x: Math.min(margin, Math.max(rect.width - rect.width * normalized.scale - margin, normalized.x)),
		y: Math.min(margin, Math.max(rect.height - rect.height * normalized.scale - margin, normalized.y)),
		scale: normalized.scale,
	};
}

function zoomInTo(x: number, y: number, factor = 1.1, withAnimation = false, clamp = true) {
	if (mainEl.value == null) return;
	const rect = mainEl.value.getBoundingClientRect();
	const offsetX = x - rect.left;
	const offsetY = y - rect.top;
	const nextScale = Math.max(Number.EPSILON, transform.value.scale * Math.max(Number.EPSILON, factor));
	const effectiveFactor = nextScale / transform.value.scale;
	const next = {
		x: offsetX - (offsetX - transform.value.x) * effectiveFactor,
		y: offsetY - (offsetY - transform.value.y) * effectiveFactor,
		scale: nextScale,
	};
	if (next.scale <= 1) {
		resetToNeutral();
		return;
	}
	isZooming.value = true;
	if (withAnimation) enableTransition.value = true;
	transform.value = clamp ? clampTransform(next) : next;
}

function resetToNeutral() {
	isZooming.value = false;
	enableTransition.value = true;
	transform.value = { x: 0, y: 0, scale: 1 };
}

function closeThis() {
	emit('close');
	infoShowing.value = false;
	const source = getSourceTransform();
	if (source != null) {
		enableTransition.value = true;
		transform.value = source;
	} else hideForFallback.value = true;
}

function onWheel(event: WheelEvent) {
	event.preventDefault();
	const factor = event.deltaY > 0 ? 1 / 1.1 : 1.1;
	if (transform.value.scale * factor < 1) resetToNeutral();
	else zoomInTo(event.clientX, event.clientY, factor);
}

let isClick = false;
let clickAction: 'hidden' | 'video' | null = null;
let pointerId: number | null = null;
let start = { x: 0, y: 0 };
let last = { x: 0, y: 0 };
let horizontal = false;
let vertical = false;
let horizontalDelta = 0;
let verticalDelta = 0;
const pointers = new Map<number, PointerEvent>();
let pinchDistance = 0;

function resolveClickAction(target: EventTarget | null) {
	if (!(target instanceof Element)) return null;
	const action = target.closest('[data-gallery-click-action]')?.getAttribute('data-gallery-click-action');
	return action === 'hidden' || action === 'video' ? action : null;
}

function onPointerdown(ev: PointerEvent) {
	pointers.set(ev.pointerId, ev);
	mainEl.value?.setPointerCapture(ev.pointerId);
	isClick = true;
	clickAction = resolveClickAction(ev.target);
	if (pointerId == null) {
		pointerId = ev.pointerId;
		start = last = { x: ev.clientX, y: ev.clientY };
	}
}

function onPointermove(ev: PointerEvent) {
	if (!pointers.has(ev.pointerId)) return;
	pointers.set(ev.pointerId, ev);
	if (pointers.size > 1) {
		isClick = false;
		const [a, b] = Array.from(pointers.values());
		if (a == null || b == null) return;
		const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
		if (pinchDistance > 0) {
			const nextScale = calculatePinchScale(transform.value.scale, distance - pinchDistance);
			if (nextScale <= 1) resetToNeutral();
			else zoomInTo((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, nextScale / transform.value.scale, false, false);
		}
		pinchDistance = distance;
		return;
	}
	if (pointerId !== ev.pointerId) return;
	const dx = ev.clientX - last.x;
	const dy = ev.clientY - last.y;
	if (Math.abs(ev.clientX - start.x) > 5 || Math.abs(ev.clientY - start.y) > 5) isClick = false;
	if (isZooming.value) transform.value = clampTransform({ x: transform.value.x + dx, y: transform.value.y + dy, scale: transform.value.scale });
	else if (vertical) {
		transform.value.y += dy;
		verticalDelta += dy;
	} else if (horizontal) {
		horizontalDelta = ev.clientX - start.x;
		emit('horizontalSwipe', horizontalDelta);
	} else if (Math.abs(dy) > Math.abs(dx)) vertical = true;
	else horizontal = true;
	last = { x: ev.clientX, y: ev.clientY };
}

function onPointerup(ev: PointerEvent) {
	pointers.delete(ev.pointerId);
	if (mainEl.value?.hasPointerCapture(ev.pointerId)) mainEl.value.releasePointerCapture(ev.pointerId);
	pinchDistance = 0;
	if (pointers.size > 0) {
		const [nextPointer] = pointers.values();
		if (nextPointer == null) return;
		pointerId = nextPointer.pointerId;
		start = last = { x: nextPointer.clientX, y: nextPointer.clientY };
		isClick = false;
	} else if (pointerId === ev.pointerId) {
		pointerId = null;
		if (vertical) {
			if (Math.abs(verticalDelta) > 200) closeThis();
			else resetToNeutral();
		} else if (horizontal) {
			if (horizontalDelta < -150) emit('next');
			else if (horizontalDelta > 150) emit('prev');
			else emit('cancelHorizontalSwipe');
		}
	}
	horizontal = false;
	vertical = false;
	horizontalDelta = 0;
	verticalDelta = 0;
	if (isZooming.value) {
		const normalized = clampTransform(transform.value);
		if (normalized.scale === 1) resetToNeutral();
		else transform.value = normalized;
	}
}

const doubleTapDetector = makeDoubleTapDetector(ev => {
	ev.preventDefault();
	ev.stopPropagation();
	if (isZooming.value) resetToNeutral();
	else {
		const touch = ev.touches.item(0);
		if (touch != null) zoomInTo(touch.clientX, touch.clientY, 2, true);
	}
});

function cancelPointerGesture() {
	const wasVertical = vertical;
	const wasHorizontal = horizontal;
	pointers.clear();
	pointerId = null;
	isClick = false;
	clickAction = null;
	pinchDistance = 0;
	horizontal = false;
	vertical = false;
	horizontalDelta = 0;
	verticalDelta = 0;
	doubleTapDetector.reset();
	if (wasVertical || transform.value.scale <= 1) resetToNeutral();
	if (wasHorizontal) emit('cancelHorizontalSwipe');
}

let sourceAnimationStarted = false;
function animateFromSource() {
	if (sourceAnimationStarted || !props.activated || props.content.sourceElement == null || rootEl.value == null) return;
	sourceAnimationStarted = true;
	enableTransition.value = true;
	transform.value = { x: 0, y: 0, scale: 1 };
	void nextTick(() => { if (props.content.sourceElement != null) props.content.sourceElement.style.visibility = 'hidden'; });
}

function onThumbnailLoaded() {
	thumbnailContentLoaded.value = true;
	animateFromSource();
}

function onThumbnailSettled() {
	thumbnailContentLoaded.value = true;
}

function onOriginalLoaded() {
	originalContentLoaded.value = true;
	animateFromSource();
}

watch([rootEl, hide], ([root, hidden]) => { if (root != null && hidden) animateFromSource(); }, { immediate: true });
watch(() => props.content, content => {
	if (content.file == null) hide.value = false;
	else {
		hide.value = shouldHideFileByDefault(content.file, true);
		if (content.file.isSensitive && prefer.nsfw !== 'force' && props.initiallyOpened) hide.value = false;
	}
}, { deep: true, immediate: true });
watch(rootEl, root => { if (root != null) { infoShowing.value = true; hideForFallback.value = false; } }, { immediate: true });

function onClick(ev: MouseEvent) {
	if (!isClick) return;
	const action = clickAction ?? resolveClickAction(ev.target);
	clickAction = null;
	if (action === 'hidden') void onHiddenClick();
	else if (action === 'video') onVideoClick();
	else if (!isTouchUsing) isZooming.value ? resetToNeutral() : closeThis();
}

async function onHiddenClick() {
	if (!hide.value || (props.content.file != null && !(await canRevealFile(props.content.file)))) return;
	hide.value = false;
	if (props.content.type === 'video') {
		await nextTick();
		if (props.activated) void videoEl.value?.play().catch(() => {});
	}
}

function onVideoClick() {
	if (prefer.useNativeUiForVideoAudioPlayer || videoEl.value == null) return;
	if (videoEl.value.paused) void videoEl.value.play().catch(() => {});
	else videoEl.value.pause();
}

function openMenu(ev: PointerEvent) {
	const menu: MenuItem[] = [{ type: 'component', component: markRaw(XFileInfo), props: { content: props.content } }, { type: 'divider' }, {
		text: i18n.ts.hide,
		icon: 'ti ti-eye-off',
		action: () => { hide.value = true; },
	}];
	if (props.content.file != null) menu.push({ type: 'divider' }, ...getFileMenu(props.content.file));
	os.popupMenu(menu, (ev.currentTarget ?? ev.target ?? undefined) as HTMLElement | undefined);
}

async function onActive() {
	await nextTick();
	if (props.activated && videoEl.value != null) void videoEl.value.play().catch(() => {});
}

function onDeactive() {
	if (isZooming.value) resetToNeutral();
	videoEl.value?.pause();
}

defineExpose({ onActive, onDeactive, closeThis });
</script>

<style lang="scss" module>
.root, .main { position: absolute; width: 100%; height: 100%; }
.root { container-type: size; }
.main { touch-action: none; }
.transformer { width: 100%; height: 100%; box-sizing: border-box; padding: v-bind("padding.top + 'px'") v-bind("padding.right + 'px'") v-bind("padding.bottom + 'px'") v-bind("padding.left + 'px'"); transform-origin: left top; }
.transition { transition: transform 200ms ease; }
.contentWrapper { position: relative; width: 100%; height: 100%; transition: scale 200ms ease, opacity 200ms ease; }
.hideForFallback { scale: .7; opacity: 0; }
.content { display: block; user-select: none; position: absolute; inset: 0; margin: auto; width: 100%; height: 100%; object-fit: contain; }
.thumbnail { pointer-events: none; }
.loading { position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; pointer-events: none; }
.hidden { position: absolute; inset: 0; margin: auto; display: grid; place-items: center; overflow: clip; padding: 0; border: 0; color: inherit; background: transparent; }
.sensitive::after { content: ""; position: absolute; inset: 0; box-shadow: inset 0 0 0 4px var(--MI_THEME-warn); pointer-events: none; }
.hiddenWrapper { position: relative; display: block; width: 100%; max-height: 100%; min-height: 0; }
.hiddenBlurhash, .hiddenThumbnail { display: block; width: 100%; height: 100%; object-fit: contain; filter: brightness(.7); }
.hiddenPlaceholder { display: block; width: 100%; aspect-ratio: 16 / 9; background: #000; }
.hiddenText { position: absolute; inset: 0; z-index: 1; display: flex; justify-content: center; align-items: center; text-align: center; cursor: pointer; color: #fff; }
.withBlur { backdrop-filter: blur(12px); }
.hiddenTextWrapper { display: grid; gap: 4px; }
.playIconWrapper { position: absolute; inset: 0; display: grid; place-items: center; }
.playIcon { display: grid; place-items: center; width: 50px; height: 50px; border-radius: 100%; font-size: 120%; background: var(--MI_THEME-accent); color: var(--MI_THEME-fgOnAccent); transition: scale 100ms ease; }
.playIconWrapper:hover .playIcon { scale: 1.2; }
.header, .footer { position: absolute; left: 0; right: 0; opacity: 0; transition: opacity 200ms ease, translate 200ms ease; }
.header { top: 0; height: v-bind("headerSize + 'px'"); translate: 0 -100%; }
.footer { bottom: 0; height: v-bind("footerSize + 'px'"); translate: 0 100%; }
.infoShowing { opacity: 1; translate: 0; }
.title { display: flex; align-items: center; width: max-content; max-width: calc(100% - 20px); margin: auto; box-sizing: border-box; border-radius: 0 0 10px 10px; font-size: 85%; }
.titleButton { flex-shrink: 0; width: 36px; height: 36px; }
.titleText { flex-grow: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; padding: 6px 0; }
.mediaControl { width: 100%; height: 100%; max-width: min(1000px, calc(100% - 16px)); box-sizing: border-box; padding: 12px 20px; margin: auto; background: var(--MI_THEME-panel); border-radius: 12px 12px 0 0; }
@container (max-width: 500px) { .mediaControl { padding: 8px 12px; } }
</style>
