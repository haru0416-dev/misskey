<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.seekbar"><MkMediaRange v-model="rangePercent" :buffer="bufferedDataRatio" :ariaLabel="i18n.ts.position"/></div>
	<div :class="[$style.controlsChild, $style.controlsLeft]">
		<button type="button" class="_button" :class="$style.controlButton" :aria-label="isPlaying ? i18n.ts._mediaControls.pause : i18n.ts._mediaControls.play" @click="togglePlayPause"><i :class="isPlaying ? 'ti ti-player-pause' : 'ti ti-player-play'"></i></button>
		<div :class="$style.controlsTime">{{ hms(elapsedTimeMs) }} / {{ hms(durationMs) }}</div>
	</div>
	<div :class="$style.controlsCenter"></div>
	<div :class="[$style.controlsChild, $style.controlsRight]">
		<button type="button" class="_button" :class="$style.controlButton" :aria-label="String(i18n.ts.volume)" @click="toggleMute"><i :class="volume === 0 ? 'ti ti-volume-3' : 'ti ti-volume'"></i></button>
		<MkMediaRange v-model="volume" :class="$style.volumeSeekbar" :ariaLabel="i18n.ts.volume"/>
		<button type="button" class="_button" :class="$style.controlButton" :aria-label="i18n.ts.settings" @click="showMenu"><i class="ti ti-settings"></i></button>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, inject, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import type { MenuItem } from '@/types/menu.js';
import { DI } from '@/di.js';
import { hms } from '@/filters/hms.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import hasAudio from '@/features/media-viewer/media-has-audio.js';
import MkMediaRange from '@/features/media-viewer/components/MkMediaRange.vue';

const videoEl = inject(DI.mkLightboxItemVideoEl, shallowRef<HTMLVideoElement | null>(null));
const active = inject(DI.mkLightboxItemActive, ref(true));
const isReady = ref(false);
const isPlaying = ref(false);
const isActuallyPlaying = ref(false);
const elapsedTimeMs = ref(0);
const durationMs = ref(0);
const volume = ref(.25);
const speed = ref(1);
const loop = ref(false);
const bufferedEnd = ref(0);
let mediaTickFrameId: number | null = null;

const rangePercent = computed({
	get: () => durationMs.value > 0 ? elapsedTimeMs.value / durationMs.value : 0,
	set: to => {
		const video = videoEl.value;
		if (video == null || !Number.isFinite(to) || durationMs.value <= 0) return;
		const currentTime = to * durationMs.value / 1000;
		if (!Number.isFinite(currentTime)) return;
		video.currentTime = currentTime;
		elapsedTimeMs.value = currentTime * 1000;
	},
});

const bufferedDataRatio = computed(() => {
	const duration = videoEl.value?.duration;
	if (duration == null || !Number.isFinite(duration) || duration <= 0) return 0;
	return Math.min(1, Math.max(0, bufferedEnd.value / duration));
});

function showMenu(ev: PointerEvent) {
	const menu: MenuItem[] = [{ type: 'switch', text: i18n.ts._mediaControls.loop, icon: 'ti ti-repeat', ref: loop }, {
		type: 'radio',
		text: i18n.ts._mediaControls.playbackRate,
		icon: 'ti ti-clock-play',
		ref: speed,
		options: [.25, .5, .75, 1, 1.25, 1.5, 2].map(value => ({ label: `${value}x`, value })),
	}];
	if (window.document.pictureInPictureEnabled) menu.push({ text: i18n.ts._mediaControls.pip, icon: 'ti ti-picture-in-picture', action: togglePictureInPicture });
	os.popupMenu(menu, ev.currentTarget ?? ev.target, { align: 'right' });
}

function togglePlayPause() {
	const video = videoEl.value;
	if (!isReady.value || video == null) return;
	if (isPlaying.value) video.pause();
	else {
		isPlaying.value = true;
		void video.play().catch(() => {
			if (videoEl.value === video) isPlaying.value = false;
		});
	}
}

function togglePictureInPicture() {
	if (window.document.pictureInPictureElement != null) void window.document.exitPictureInPicture();
	else void videoEl.value?.requestPictureInPicture();
}

function toggleMute() {
	volume.value = volume.value === 0 ? .25 : 0;
}

function updateElapsedTime(video: HTMLVideoElement) {
	elapsedTimeMs.value = Number.isFinite(video.currentTime) ? video.currentTime * 1000 : 0;
}

function updateDuration(video: HTMLVideoElement) {
	durationMs.value = Number.isFinite(video.duration) ? video.duration * 1000 : 0;
}

function updateBuffered(video: HTMLVideoElement) {
	try {
		bufferedEnd.value = video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0;
	} catch {
		bufferedEnd.value = 0;
	}
}

function stopMediaTick() {
	if (mediaTickFrameId == null) return;
	window.cancelAnimationFrame(mediaTickFrameId);
	mediaTickFrameId = null;
}

function updateMediaTick() {
	const video = videoEl.value;
	if (video == null || video.paused || video.ended) {
		mediaTickFrameId = null;
		return;
	}
	updateElapsedTime(video);
	mediaTickFrameId = window.requestAnimationFrame(updateMediaTick);
}

function startMediaTick(video: HTMLVideoElement) {
	if (mediaTickFrameId != null || video.paused || video.ended) return;
	updateElapsedTime(video);
	mediaTickFrameId = window.requestAnimationFrame(updateMediaTick);
}

const stopVideoWatch = watch(videoEl, (video, _oldVideo, onCleanup) => {
	stopMediaTick();
	isReady.value = false;
	isPlaying.value = false;
	isActuallyPlaying.value = false;
	elapsedTimeMs.value = 0;
	durationMs.value = 0;
	bufferedEnd.value = 0;
	if (video == null) return;

	const abortController = new AbortController();
	onCleanup(() => {
		abortController.abort();
		stopMediaTick();
	});
	const options = { signal: abortController.signal };
	video.addEventListener('play', () => { isPlaying.value = true; }, options);
	video.addEventListener('playing', () => { isActuallyPlaying.value = true; startMediaTick(video); }, options);
	video.addEventListener('waiting', () => { isActuallyPlaying.value = false; stopMediaTick(); }, options);
	video.addEventListener('pause', () => { isPlaying.value = false; isActuallyPlaying.value = false; updateElapsedTime(video); stopMediaTick(); }, options);
	video.addEventListener('ended', () => { isPlaying.value = false; isActuallyPlaying.value = false; updateElapsedTime(video); stopMediaTick(); }, options);
	video.addEventListener('timeupdate', () => updateElapsedTime(video), options);
	video.addEventListener('durationchange', () => updateDuration(video), options);
	video.addEventListener('progress', () => updateBuffered(video), options);
	video.addEventListener('loadedmetadata', () => { updateElapsedTime(video); updateDuration(video); updateBuffered(video); }, options);

	isReady.value = true;
	isPlaying.value = !video.paused && !video.ended;
	isActuallyPlaying.value = isPlaying.value && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
	updateElapsedTime(video);
	updateDuration(video);
	updateBuffered(video);
	video.volume = volume.value;
	video.playbackRate = speed.value;
	video.loop = loop.value;
	if (isActuallyPlaying.value) startMediaTick(video);

	void hasAudio(video).then(had => {
		if (!had && active.value && !abortController.signal.aborted && videoEl.value === video) {
			video.loop = true;
			video.muted = true;
			void video.play().catch(() => {});
		}
	});
}, { immediate: true });

watch(volume, value => { if (videoEl.value != null) videoEl.value.volume = value; });
watch(speed, value => { if (videoEl.value != null) videoEl.value.playbackRate = value; });
watch(loop, value => { if (videoEl.value != null) videoEl.value.loop = value; });
watch(active, value => {
	if (!value) videoEl.value?.pause();
});

onBeforeUnmount(() => {
	stopVideoWatch();
	stopMediaTick();
});

defineExpose({ isPlaying, isActuallyPlaying });
</script>

<style lang="scss" module>
.root { display: grid; grid-template-areas: "seekbar seekbar seekbar" "left center right"; grid-template-columns: auto 1fr auto; align-items: center; gap: 4px 8px; width: 100%; }
.controlsChild { display: flex; align-items: center; gap: 4px; }
.controlsLeft { grid-area: left; }
.controlsRight { grid-area: right; }
.controlsCenter { grid-area: center; }
.controlsTime { font-size: 85%; }
.controlButton { padding: 6px; border-radius: 4px; }
.controlButton:hover { background-color: var(--MI_THEME-accentedBg); color: var(--MI_THEME-accent); }
.controlButton:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: 2px; }
.seekbar { grid-area: seekbar; }
.volumeSeekbar { width: 90px; }
</style>
