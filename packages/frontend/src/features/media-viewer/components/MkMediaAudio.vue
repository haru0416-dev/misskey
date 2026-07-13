<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	ref="playerEl"
	v-hotkey="keymap"
	tabindex="0"
	:class="[
		$style.audioContainer,
		(audio.isSensitive && prefer.highlightSensitiveMedia) && $style.sensitive,
	]"
	@contextmenu.stop
	@keydown.stop
>
	<button v-if="hide" :class="$style.hidden" @click="reveal">
		<div :class="$style.hiddenTextWrapper">
			<b v-if="audio.isSensitive" style="display: block;"><i class="ti ti-eye-exclamation"></i> {{ i18n.ts.sensitive }}{{ prefer.dataSaver.media ? ` (${i18n.ts.audio}${audio.size ? ' ' + bytes(audio.size) : ''})` : '' }}</b>
			<b v-else style="display: block;"><i class="ti ti-music"></i> {{ prefer.dataSaver.media && audio.size ? bytes(audio.size) : i18n.ts.audio }}</b>
			<span style="display: block;">{{ i18n.ts.clickToShow }}</span>
		</div>
	</button>

	<div v-else-if="prefer.useNativeUiForVideoAudioPlayer" :class="$style.nativeAudioContainer">
		<audio
			ref="audioEl"
			preload="metadata"
			controls
			:class="$style.nativeAudio"
			@keydown.prevent
		>
			<source :src="audio.url">
		</audio>
	</div>

	<div v-else :class="$style.audioControls">
		<audio
			ref="audioEl"
			preload="metadata"
			@keydown.prevent="() => {}"
		>
			<source :src="audio.url">
		</audio>
		<div :class="[$style.controlsChild, $style.controlsLeft]">
			<button
				:class="['_button', $style.controlButton]"
				tabindex="-1"
				@click.stop="togglePlayPause"
			>
				<i v-if="isPlaying" class="ti ti-player-pause-filled"></i>
				<i v-else class="ti ti-player-play-filled"></i>
			</button>
		</div>
		<div :class="[$style.controlsChild, $style.controlsRight]">
			<button
				:class="['_button', $style.controlButton]"
				tabindex="-1"
				@click.stop="() => {}"
				@mousedown.prevent.stop="showMenu"
			>
				<i class="ti ti-settings"></i>
			</button>
		</div>
		<div :class="[$style.controlsChild, $style.controlsTime]">{{ hms(elapsedTimeMs) }}</div>
		<div :class="[$style.controlsChild, $style.controlsVolume]">
			<button
				:class="['_button', $style.controlButton]"
				tabindex="-1"
				@click.stop="toggleMute"
			>
				<i v-if="volume === 0" class="ti ti-volume-3"></i>
				<i v-else class="ti ti-volume"></i>
			</button>
			<MkMediaRange
				v-model="volume"
				:class="$style.volumeSeekbar"
			/>
		</div>
		<MkMediaRange
			v-model="rangePercent"
			:class="$style.seekbarRoot"
			:buffer="bufferedDataRatio"
		/>
	</div>
</div>
</template>

<script lang="ts" setup>
import { useTemplateRef, watch, computed, ref, onDeactivated, onActivated, onMounted, onUnmounted } from 'vue';
import * as Misskey from 'misskey-js';
import type { MenuItem } from '@/types/menu.js';
import type { Keymap } from '@/utility/hotkey.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import bytes from '@/filters/bytes.js';
import { hms } from '@/filters/hms.js';
import MkMediaRange from '@/features/media-viewer/components/MkMediaRange.vue';
import { prefer } from '@/preferences.js';
import { canRevealFile, shouldHideFileByDefault } from '@/features/media-viewer/sensitive-file.js';
import { getFileMenu } from '@/features/media-viewer/get-file-menu.js';

const props = defineProps<{
	audio: Misskey.entities.DriveFile;
}>();

const keymap = {
	'up': {
		allowRepeat: true,
		callback: () => {
			if (hasFocus() && audioEl.value) {
				volume.value = Math.min(volume.value + 0.1, 1);
			}
		},
	},
	'down': {
		allowRepeat: true,
		callback: () => {
			if (hasFocus() && audioEl.value) {
				volume.value = Math.max(volume.value - 0.1, 0);
			}
		},
	},
	'left': {
		allowRepeat: true,
		callback: () => {
			if (hasFocus() && audioEl.value) {
				audioEl.value.currentTime = Math.max(audioEl.value.currentTime - 5, 0);
			}
		},
	},
	'right': {
		allowRepeat: true,
		callback: () => {
			if (hasFocus() && audioEl.value) {
				audioEl.value.currentTime = Math.min(audioEl.value.currentTime + 5, audioEl.value.duration);
			}
		},
	},
	'space': () => {
		if (hasFocus()) {
			togglePlayPause();
		}
	},
} as const satisfies Keymap;

// PlayerElもしくはその子要素にフォーカスがあるかどうか
function hasFocus() {
	if (!playerEl.value) return false;
	return playerEl.value === window.document.activeElement || playerEl.value.contains(window.document.activeElement);
}

const playerEl = useTemplateRef('playerEl');
const audioEl = useTemplateRef('audioEl');

const hide = ref(shouldHideFileByDefault(props.audio));

async function reveal() {
	if (!(await canRevealFile(props.audio))) {
		return;
	}

	hide.value = false;
}

// Menu
const menuShowing = ref(false);

function showMenu(ev: MouseEvent) {
	const menu: MenuItem[] = [
		// TODO: 再生キューに追加
		{
			type: 'switch',
			text: i18n.ts._mediaControls.loop,
			icon: 'ti ti-repeat',
			ref: loop,
		},
		{
			type: 'radio',
			text: i18n.ts._mediaControls.playbackRate,
			icon: 'ti ti-clock-play',
			ref: speed,
			options: [{
				label: '0.25x',
				value: 0.25,
			}, {
				label: '0.5x',
				value: 0.5,
			}, {
				label: '0.75x',
				value: 0.75,
			}, {
				label: '1.0x',
				value: 1,
			}, {
				label: '1.25x',
				value: 1.25,
			}, {
				label: '1.5x',
				value: 1.5,
			}, {
				label: '2.0x',
				value: 2,
			}],
		},
		{ type: 'divider' },
		...getFileMenu(props.audio, value => { hide.value = value; }),
	];

	menuShowing.value = true;
	os.popupMenu(menu, ev.currentTarget ?? ev.target, {
		align: 'right',
		onClosing: () => {
			menuShowing.value = false;
		},
	});
}

// MediaControl: Common State
const isReady = ref(false);
const isPlaying = ref(false);
const elapsedTimeMs = ref(0);
const durationMs = ref(0);
const rangePercent = computed({
	get: () => {
		return (elapsedTimeMs.value / durationMs.value) || 0;
	},
	set: (to) => {
		if (!audioEl.value) return;
		const currentTime = to * durationMs.value / 1000;
		audioEl.value.currentTime = currentTime;
		elapsedTimeMs.value = currentTime * 1000;
	},
});
const volume = ref(.25);
const speed = ref(1);
const loop = ref(false); // TODO: ドライブファイルのフラグに置き換える
const bufferedEnd = ref(0);
const bufferedDataRatio = computed(() => {
	if (!audioEl.value || !Number.isFinite(audioEl.value.duration) || audioEl.value.duration <= 0) return 0;
	return bufferedEnd.value / audioEl.value.duration;
});

// MediaControl Events
function togglePlayPause() {
	if (!isReady.value || !audioEl.value) return;

	if (isPlaying.value) {
		audioEl.value.pause();
		isPlaying.value = false;
	} else {
		const audio = audioEl.value;
		isPlaying.value = true;
		void audio.play().catch(() => {
			if (audioEl.value === audio) isPlaying.value = false;
		});
	}
}

function toggleMute() {
	if (volume.value === 0) {
		volume.value = .25;
	} else {
		volume.value = 0;
	}
}

let onceInit = false;
let mediaTickFrameId: number | null = null;
let stopAudioElWatch: (() => void) | null = null;

function updateElapsedTime(audio: HTMLAudioElement) {
	elapsedTimeMs.value = Number.isFinite(audio.currentTime) ? audio.currentTime * 1000 : 0;
}

function updateDuration(audio: HTMLAudioElement) {
	durationMs.value = Number.isFinite(audio.duration) ? audio.duration * 1000 : 0;
}

function updateBufferedData(audio: HTMLAudioElement) {
	try {
		bufferedEnd.value = audio.buffered.length > 0 ? audio.buffered.end(0) : 0;
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
	const audio = audioEl.value;
	if (audio == null || audio.paused || audio.ended) {
		mediaTickFrameId = null;
		return;
	}

	updateElapsedTime(audio);
	mediaTickFrameId = window.requestAnimationFrame(updateMediaTick);
}

function startMediaTick() {
	if (mediaTickFrameId != null) return;
	const audio = audioEl.value;
	if (audio == null || audio.paused || audio.ended) return;

	updateElapsedTime(audio);
	mediaTickFrameId = window.requestAnimationFrame(updateMediaTick);
}

function teardown() {
	stopMediaTick();
	stopAudioElWatch?.();
	stopAudioElWatch = null;
	onceInit = false;
}

function init() {
	if (onceInit) return;
	onceInit = true;

	stopAudioElWatch = watch(audioEl, (audio, _oldAudio, onCleanup) => {
		stopMediaTick();
		if (audio == null) {
			isReady.value = false;
			return;
		}

		const abortController = new AbortController();
		onCleanup(() => {
			abortController.abort();
			stopMediaTick();
		});

		const eventOptions = { signal: abortController.signal };
		audio.addEventListener('play', () => {
			isPlaying.value = true;
			startMediaTick();
		}, eventOptions);
		audio.addEventListener('pause', () => {
			isPlaying.value = false;
			updateElapsedTime(audio);
			stopMediaTick();
		}, eventOptions);
		audio.addEventListener('ended', () => {
			isPlaying.value = false;
			updateElapsedTime(audio);
			stopMediaTick();
		}, eventOptions);
		audio.addEventListener('timeupdate', () => updateElapsedTime(audio), eventOptions);
		audio.addEventListener('durationchange', () => updateDuration(audio), eventOptions);
		audio.addEventListener('progress', () => updateBufferedData(audio), eventOptions);
		audio.addEventListener('loadedmetadata', () => {
			updateElapsedTime(audio);
			updateDuration(audio);
			updateBufferedData(audio);
		}, eventOptions);

		isReady.value = true;
		isPlaying.value = !audio.paused && !audio.ended;
		updateElapsedTime(audio);
		updateDuration(audio);
		updateBufferedData(audio);
		audio.volume = volume.value;
		audio.playbackRate = speed.value;
		audio.loop = loop.value;
		if (isPlaying.value) startMediaTick();
	}, {
		immediate: true,
	});
}

watch(volume, (to) => {
	if (audioEl.value) audioEl.value.volume = to;
});

watch(speed, (to) => {
	if (audioEl.value) audioEl.value.playbackRate = to;
});

watch(loop, (to) => {
	if (audioEl.value) audioEl.value.loop = to;
});

onMounted(() => {
	init();
});

onActivated(() => {
	init();
});

onDeactivated(() => {
	teardown();
	isReady.value = false;
	isPlaying.value = false;
	elapsedTimeMs.value = 0;
	durationMs.value = 0;
	bufferedEnd.value = 0;
	hide.value = (prefer.nsfw === 'force' || prefer.dataSaver.media) ? true : (props.audio.isSensitive && prefer.nsfw !== 'ignore');
});

onUnmounted(teardown);
</script>

<style lang="scss" module>
.audioContainer {
	container-type: inline-size;
	position: relative;
	border: .5px solid var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	overflow: clip;

	&:focus-visible {
		outline: none;
	}
}

.sensitive {
	position: relative;

	&::after {
		content: "";
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		border-radius: inherit;
		box-shadow: inset 0 0 0 4px var(--MI_THEME-warn);
	}
}

.hidden {
	width: 100%;
	background: #000;
	border: none;
	outline: none;
	font: inherit;
	color: inherit;
	cursor: pointer;
	padding: 12px 0;
	display: flex;
	align-items: center;
	justify-content: center;
}

.hiddenTextWrapper {
	text-align: center;
	font-size: 0.8em;
	color: #fff;
}

.audioControls {
	display: grid;
	grid-template-areas:
		"left time . volume right"
		"seekbar seekbar seekbar seekbar seekbar";
	grid-template-columns: auto auto 1fr auto auto;
	align-items: center;
	gap: 4px 8px;
	padding: 10px;
}

.controlsChild {
	display: flex;
	align-items: center;
	gap: 4px;

	.controlButton {
		padding: 6px;
		border-radius: calc(var(--MI-radius) / 2);
		font-size: 1.05rem;

		&:hover {
			color: var(--MI_THEME-accent);
			background-color: var(--MI_THEME-accentedBg);
		}

		&:focus-visible {
			outline: none;
		}
	}
}

.controlsLeft {
	grid-area: left;
}

.controlsRight {
	grid-area: right;
}

.controlsTime {
	grid-area: time;
	font-size: .9rem;
}

.controlsVolume {
	grid-area: volume;

	.volumeSeekbar {
		display: none;
	}
}

.seekbarRoot {
	grid-area: seekbar;
}

@container (min-width: 500px) {
	.audioControls {
		grid-template-areas: "left seekbar time volume right";
		grid-template-columns: auto 1fr auto auto auto;
	}

	.controlsVolume {
		.volumeSeekbar {
			max-width: 90px;
			display: block;
			flex-grow: 1;
		}
	}
}

.nativeAudioContainer {
	display: flex;
	align-items: center;
	padding: 6px;
}

.nativeAudio {
	display: block;
	width: 100%;
}
</style>
