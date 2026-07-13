<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, (video.isSensitive && prefer.highlightSensitiveMedia) && $style.sensitive]" @contextmenu.stop="onContextmenu">
	<button v-if="hide" type="button" :class="$style.hidden" @click="reveal">
		<span :class="$style.hiddenTextWrapper">
			<b v-if="video.isSensitive"><i class="ti ti-eye-exclamation"></i> {{ i18n.ts.sensitive }}{{ prefer.dataSaver.media ? ` (${i18n.ts.video}${video.size ? ' ' + bytes(video.size) : ''})` : '' }}</b>
			<b v-else><i class="ti ti-movie"></i> {{ prefer.dataSaver.media && video.size ? bytes(video.size) : i18n.ts.video }}</b>
			<span>{{ i18n.ts.clickToShow }}</span>
		</span>
	</button>
	<div v-else :class="$style.videoRoot">
		<button type="button" class="_button" :class="$style.preview" :aria-label="video.comment ?? video.name" @click="emit('mediaClick', $event)">
			<img v-if="video.thumbnailUrl" :class="$style.video" :src="video.thumbnailUrl" :alt="video.comment ?? ''" :data-marker="marker ?? undefined">
			<video v-else :class="$style.video" :data-marker="marker ?? undefined" preload="metadata" muted playsinline><source :src="video.url"></video>
			<span :class="$style.playIconWrapper"><span :class="$style.playIcon"><i class="ti ti-player-play"></i></span></span>
		</button>
		<button type="button" :class="$style.menu" class="_button" :aria-label="i18n.ts.menu" @click.stop="showMenu"><i class="ti ti-dots"></i></button>
		<button type="button" class="_button" :class="$style.hide" :aria-label="i18n.ts.hide" @click.stop="hide = true"><i class="ti ti-eye-off"></i></button>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import bytes from '@/filters/bytes.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import * as os from '@/os.js';
import { getFileMenu } from '@/features/media-viewer/get-file-menu.js';
import { canRevealFile, shouldHideFileByDefault } from '@/features/media-viewer/sensitive-file.js';

const props = defineProps<{ video: Misskey.entities.DriveFile; marker?: string }>();
const emit = defineEmits<{ (event: 'mediaClick', ev: Event): void }>();
const hide = ref(shouldHideFileByDefault(props.video));

watch(() => props.video, video => { hide.value = shouldHideFileByDefault(video); }, { deep: true });

async function reveal() {
	if (await canRevealFile(props.video)) hide.value = false;
}

function showMenu(ev: PointerEvent) {
	os.popupMenu(getFileMenu(props.video, value => { hide.value = value; }), (ev.currentTarget ?? ev.target ?? undefined) as HTMLElement | undefined);
}

function onContextmenu(ev: PointerEvent) {
	os.contextMenu(getFileMenu(props.video, value => { hide.value = value; }), ev);
}
</script>

<style lang="scss" module>
.root { container-type: inline-size; position: relative; overflow: clip; }
.preview:hover .playIcon { scale: 1.2; }
.sensitive::after { content: ""; position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 0 4px var(--MI_THEME-warn); }
.hidden { width: 100%; height: 100%; background: #000; border: 0; font: inherit; color: inherit; cursor: pointer; padding: 12px 0; display: flex; align-items: center; justify-content: center; }
.hiddenTextWrapper { display: grid; gap: 4px; text-align: center; font-size: .8em; color: #fff; }
.videoRoot { position: relative; width: 100%; height: 100%; background: #000; }
.preview { display: block; width: 100%; height: 100%; cursor: zoom-in; color: inherit; }
.video { display: block; height: 100%; width: 100%; object-fit: contain; }
.playIconWrapper { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
.playIcon { display: grid; place-items: center; width: 50px; height: 50px; border-radius: 100%; font-size: 120%; background: var(--MI_THEME-accent); color: var(--MI_THEME-fgOnAccent); transition: scale 100ms ease; }
.menu, .hide { position: absolute; color: #fff; background-color: rgba(0, 0, 0, .3); backdrop-filter: var(--MI-blur, blur(15px)); }
.menu { right: 0; bottom: 0; width: 32px; height: 32px; border-radius: 9px 0 0 0; }
.hide { top: 0; right: 0; padding: 7px 9px; border-radius: 0 0 0 9px; opacity: .7; }
.preview:focus-visible, .hidden:focus-visible { outline: 2px solid var(--MI_THEME-focus); outline-offset: -2px; }
</style>
