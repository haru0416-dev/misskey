<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<XBanner v-for="media in mediaList.filter(media => !previewable(media))" :key="media.id" :media="media"/>
	<div v-if="previewableMedia.length > 0" :class="$style.container">
		<div
			ref="gallery"
			:class="[
				$style.medias,
				prefer.showMediaListByGridInWideArea && $style.gridInWideArea,
				count === 1 ? [$style.n1, {
					[$style.n116_9]: prefer.mediaListWithOneImageAppearance === '16_9',
					[$style.n11_1]: prefer.mediaListWithOneImageAppearance === '1_1',
					[$style.n12_3]: prefer.mediaListWithOneImageAppearance === '2_3',
				}] : count === 2 ? $style.n2 : count === 3 ? $style.n3 : count === 4 ? $style.n4 : $style.nMany,
				square && $style.square,
			]"
		>
			<template v-for="media in previewableMedia" :key="media.id">
				<XVideo v-if="media.type.startsWith('video')" :class="$style.media" :video="media" :marker="`${markerId}:${media.id}`" @mediaClick="onMediaClick(media, $event)"/>
				<XImage v-else :class="$style.media" :image="media" :raw="raw" :marker="`${markerId}:${media.id}`" @mediaClick="onMediaClick(media, $event)"/>
			</template>
		</div>
	</div>
</div>
</template>

<script lang="ts">
export function singleFlight<TArgs extends unknown[]>(task: (...args: TArgs) => Promise<void>): (...args: TArgs) => Promise<void> {
	let pending: Promise<void> | null = null;
	return (...args) => {
		pending ??= task(...args).finally(() => { pending = null; });
		return pending;
	};
}
</script>

<script lang="ts" setup>
import { computed, markRaw, onBeforeUnmount, onMounted, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import { FILE_TYPE_BROWSERSAFE } from '@shared/utility/const.js';
import type { LightboxContent } from '@/features/media-viewer/components/MkLightbox.item.vue';
import XBanner from '@/features/media-viewer/components/MkMediaBanner.vue';
import XImage from '@/features/media-viewer/components/MkMediaImage.vue';
import XVideo from '@/features/media-viewer/components/MkMediaVideo.vue';
import * as os from '@/os.js';
import { prefer } from '@/preferences.js';
import { genId } from '@/utility/id.js';

const props = defineProps<{
	mediaList: Misskey.entities.DriveFile[];
	raw?: boolean;
	square?: boolean;
}>();

const gallery = useTemplateRef('gallery');
const markerId = genId();
const previewableMedia = computed(() => props.mediaList.filter(previewable));
const count = computed(() => previewableMedia.value.length);

function previewable(file: Misskey.entities.DriveFile): boolean {
	if (file.type === 'image/svg+xml') return true;
	return (file.type.startsWith('video') || file.type.startsWith('image')) && FILE_TYPE_BROWSERSAFE.includes(file.type);
}

function calcAspectRatio() {
	if (gallery.value == null) return;
	const media = previewableMedia.value[0];
	if (previewableMedia.value.length !== 1 || media?.properties.width == null || media.properties.height == null) {
		gallery.value.style.aspectRatio = '';
		return;
	}
	const ratioMax = (ratio: number) => `${Math.max(ratio, media.properties.width! / media.properties.height!).toString()} / 1`;
	switch (prefer.mediaListWithOneImageAppearance) {
		case '16_9': gallery.value.style.aspectRatio = ratioMax(16 / 9); break;
		case '1_1': gallery.value.style.aspectRatio = ratioMax(1); break;
		case '2_3': gallery.value.style.aspectRatio = ratioMax(2 / 3); break;
		default: gallery.value.style.aspectRatio = '';
	}
}

function onMediaClick(file: Misskey.entities.DriveFile, ev: Event) {
	if (ev instanceof MouseEvent && (ev.button !== 0 || ev.metaKey || ev.altKey || ev.ctrlKey || ev.shiftKey)) return;
	ev.preventDefault();
	if (file.type.startsWith('image') && prefer.imageNewTab) {
		window.open(file.url, '_blank', 'noopener');
		return;
	}
	void openGallery(file.id);
}

let unmounted = false;
let lightboxDispose: (() => void) | null = null;

const openGallery = singleFlight(async (id?: string) => {
	const first = previewableMedia.value[0];
	if (first == null) return;
	const selectedId = id ?? first.id;
	const getElementByMarker = (marker: string) => {
		const found = gallery.value?.querySelector<HTMLElement>(`[data-marker="${marker}"]`) ?? null;
		return found == null ? null : markRaw(found);
	};
	const contents = previewableMedia.value.map<LightboxContent>(media => {
		const width = media.properties.width;
		const height = media.properties.height;
		return {
			id: media.id,
			type: media.type.startsWith('video') ? 'video' : 'image',
			url: media.url,
			thumbnailUrl: media.thumbnailUrl,
			...(width === undefined ? {} : { width }),
			...(height === undefined ? {} : { height }),
			filename: media.name,
			file: media,
			sourceElement: getElementByMarker(`${markerId}:${media.id}`),
		};
	});
	const lightbox = await import('@/features/media-viewer/components/MkLightbox.vue');
	if (unmounted) return;
	const { dispose } = await os.popupAsyncWithDialog(Promise.resolve(lightbox.default), {
		defaultIndex: Math.max(0, contents.findIndex(content => content.id === selectedId)),
		contents,
	}, { closed: () => {
		dispose();
		if (lightboxDispose === dispose) lightboxDispose = null;
	} });
	if (unmounted) dispose();
	else lightboxDispose = dispose;
});

onMounted(calcAspectRatio);
onBeforeUnmount(() => {
	unmounted = true;
	lightboxDispose?.();
	lightboxDispose = null;
});
defineExpose({ openGallery });
</script>

<style lang="scss" module>
.root { container-type: inline-size; }
.container { position: relative; width: 100%; }
.medias {
	display: grid;
	gap: 8px;
	height: 100%;
	width: 100%;
	&.n1 { grid-template-rows: 1fr; min-height: 64px; max-height: clamp(64px, 50cqh, min(360px, 50vh)); }
	&.n1.n116_9 { min-height: initial; max-height: initial; aspect-ratio: 16 / 9; }
	&.n1.n11_1 { min-height: initial; max-height: initial; aspect-ratio: 1 / 1; }
	&.n1.n12_3 { min-height: initial; max-height: initial; aspect-ratio: 2 / 3; }
	&.n2 { aspect-ratio: 16 / 9; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr; }
	&.n3 { aspect-ratio: 16 / 9; grid-template-columns: 1fr .5fr; grid-template-rows: 1fr 1fr; }
	&.n3 > .media:nth-child(1) { grid-row: 1 / 3; }
	&.n3 > .media:nth-child(3) { grid-column: 2 / 3; grid-row: 2 / 3; }
	&.n4 { aspect-ratio: 16 / 9; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
	&.nMany { grid-template-columns: 1fr 1fr; }
	&.nMany > .media { aspect-ratio: 16 / 9; }
	&.square { min-height: 0; max-height: none; aspect-ratio: 1 / 1; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); }
	&.square > .media { grid-column: auto; grid-row: auto; aspect-ratio: auto; border-radius: 0; }
	&.square > .media:only-child { grid-column: 1 / -1; grid-row: 1 / -1; }
}
.media { overflow: hidden; border-radius: 8px; cursor: zoom-in; }
@container (min-width: 500px) {
	.medias.gridInWideArea:not(.square) { display: grid; aspect-ratio: auto; grid-template-columns: repeat(4, 1fr); grid-template-rows: auto; gap: 8px; }
	.medias.gridInWideArea:not(.square) > .media { aspect-ratio: 1 / 1; }
}
</style>
