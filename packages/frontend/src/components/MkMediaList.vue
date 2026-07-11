<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<XBanner v-for="media in mediaList.filter(media => !previewable(media))" :key="media.id" :media="media"/>
	<div v-if="mediaList.filter(media => previewable(media)).length > 0" :class="$style.container">
		<div
			ref="gallery"
			:class="[
				$style.medias,
				...(prefer.showMediaListByGridInWideArea ? [$style.gridInWideArea] : []),
				count === 1 ? [$style.n1, {
					[$style.n116_9]: prefer.mediaListWithOneImageAppearance === '16_9',
					[$style.n11_1]: prefer.mediaListWithOneImageAppearance === '1_1',
					[$style.n12_3]: prefer.mediaListWithOneImageAppearance === '2_3',
				}] : count === 2 ? $style.n2 : count === 3 ? $style.n3 : count === 4 ? $style.n4 : $style.nMany,
				square ? $style.square : null,
			]"
			@click="onGalleryClick"
		>
			<template v-for="media in mediaList.filter(media => previewable(media))">
				<XVideo v-if="media.type.startsWith('video')" :key="`video:${media.id}`" :class="$style.media" :video="media"/>
				<XImage v-else-if="media.type.startsWith('image')" :key="`image:${media.id}`" :class="$style.media" class="image" :data-id="media.id" :image="media" :raw="raw"/>
			</template>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, onMounted, onUnmounted, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import type PhotoSwipeLightbox from 'photoswipe/lightbox';
import { FILE_TYPE_BROWSERSAFE } from '@shared/utility/const.js';
import XBanner from '@/components/MkMediaBanner.vue';
import XImage from '@/components/MkMediaImage.vue';
import * as os from '@/os.js';
import { focusParent } from '@/utility/focus.js';
import { prefer } from '@/preferences.js';

const XVideo = defineAsyncComponent(() => import('@/components/MkMediaVideo.vue'));

const props = withDefaults(defineProps<{
	mediaList: Misskey.entities.DriveFile[];
	raw?: boolean;
	square?: boolean;
	eagerLightbox?: boolean;
}>(), {
	eagerLightbox: true,
});

const gallery = useTemplateRef('gallery');
const pswpZIndex = os.claimZIndex('middle');
window.document.documentElement.style.setProperty('--mk-pswp-root-z-index', pswpZIndex.toString());
const count = computed(() => props.mediaList.filter(media => previewable(media)).length);
let lightbox: PhotoSwipeLightbox | null = null;
let lightboxPromise: Promise<PhotoSwipeLightbox | null> | null = null;
let isUnmounted = false;

let activeEl: HTMLElement | null = null;

const popstateHandler = (): void => {
	if (lightbox?.pswp && lightbox.pswp.isOpen === true) {
		lightbox.pswp.close();
	}
};

async function calcAspectRatio() {
	if (!gallery.value) return;

	const img = props.mediaList[0];

	if (props.mediaList.length !== 1 || !(img.properties.width && img.properties.height)) {
		gallery.value.style.aspectRatio = '';
		return;
	}

	const ratioMax = (ratio: number) => {
		if (img.properties.width == null || img.properties.height == null) return '';
		return `${Math.max(ratio, img.properties.width / img.properties.height).toString()} / 1`;
	};

	switch (prefer.mediaListWithOneImageAppearance) {
		case '16_9':
			gallery.value.style.aspectRatio = ratioMax(16 / 9);
			break;
		case '1_1':
			gallery.value.style.aspectRatio = ratioMax(1 / 1);
			break;
		case '2_3':
			gallery.value.style.aspectRatio = ratioMax(2 / 3);
			break;
		default:
			gallery.value.style.aspectRatio = '';
			break;
	}
}

function getGalleryImages() {
	return props.mediaList.filter(media => {
		if (media.type === 'image/svg+xml') return true; // svgのwebpublicはpngなのでtrue
		return media.type.startsWith('image') && FILE_TYPE_BROWSERSAFE.includes(media.type);
	});
}

async function createLightbox(): Promise<PhotoSwipeLightbox | null> {
	const galleryEl = gallery.value;
	const galleryImages = getGalleryImages();
	if (galleryEl == null || galleryImages.length === 0) return null;

	const modules = await Promise.all([
		import('photoswipe/lightbox'),
		import('photoswipe'),
		import('photoswipe/style.css'),
	]).catch((error: unknown) => {
		console.error('Failed to load PhotoSwipe', error);
		return null;
	});
	if (modules == null) return null;

	if (isUnmounted || gallery.value !== galleryEl) return null;

	const [photoSwipeLightboxModule, photoSwipeModule] = modules;
	const instance = new photoSwipeLightboxModule.default({
		dataSource: galleryImages.map(media => {
			const item = {
				src: media.url,
				w: media.properties.width,
				h: media.properties.height,
				// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
				alt: media.comment || media.name,
				// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
				comment: media.comment || media.name,
			};
			if (media.properties.orientation != null && media.properties.orientation >= 5) {
				[item.w, item.h] = [item.h, item.w];
			}
			return item;
		}),
		gallery: galleryEl,
		mainClass: 'pswp',
		children: '.image',
		thumbSelector: '.image',
		loop: false,
		padding: window.innerWidth > 500 ? {
			top: 32,
			bottom: 90,
			left: 32,
			right: 32,
		} : {
			top: 0,
			bottom: 78,
			left: 0,
			right: 0,
		},
		imageClickAction: 'close',
		tapAction: 'close',
		bgOpacity: 1,
		showAnimationDuration: 100,
		hideAnimationDuration: 100,
		returnFocus: false,
		pswpModule: photoSwipeModule.default,
	});

	instance.addFilter('itemData', (itemData) => {
		// element is children
		const { element } = itemData;

		const id = element?.dataset.id;
		const file = props.mediaList.find(media => media.id === id);
		if (!file) return itemData;

		itemData.src = file.url;
		itemData.w = Number(file.properties.width);
		itemData.h = Number(file.properties.height);
		if (file.properties.orientation != null && file.properties.orientation >= 5) {
			[itemData.w, itemData.h] = [itemData.h, itemData.w];
		}
		itemData.msrc = file.thumbnailUrl ?? undefined;
		// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
		itemData.alt = file.comment || file.name;
		// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
		itemData.comment = file.comment || file.name;
		itemData.thumbCropped = true;

		return itemData;
	});

	instance.on('uiRegister', () => {
		instance.pswp?.ui?.registerElement({
			name: 'altText',
			className: 'pswp__alt-text-container',
			appendTo: 'wrapper',
			onInit: (el, pswp) => {
				const textBox = window.document.createElement('p');
				textBox.className = 'pswp__alt-text _acrylic';
				el.appendChild(textBox);

				pswp.on('change', () => {
					textBox.textContent = pswp.currSlide?.data.comment;
				});
			},
		});
	});

	instance.on('afterInit', () => {
		activeEl = window.document.activeElement instanceof HTMLElement ? window.document.activeElement : null;
		focusParent(activeEl, true, true);
		instance.pswp?.element?.focus({
			preventScroll: true,
		});
		window.history.pushState(null, '', '#pswp');
	});

	instance.on('destroy', () => {
		focusParent(activeEl, true, false);
		activeEl = null;
		if (window.location.hash === '#pswp') {
			window.history.back();
		}
	});

	instance.init();
	lightbox = instance;
	return instance;
}

function ensureLightbox(): Promise<PhotoSwipeLightbox | null> {
	if (lightbox != null) return Promise.resolve(lightbox);
	lightboxPromise ??= createLightbox();
	return lightboxPromise;
}

async function onGalleryClick(ev: MouseEvent) {
	if (lightbox != null || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.altKey || ev.ctrlKey || ev.shiftKey) return;
	if (!(ev.target instanceof Element) || gallery.value == null) return;

	const imageEl = ev.target.closest<HTMLElement>('.image');
	if (imageEl == null || !gallery.value.contains(imageEl)) return;

	const imageIndex = getGalleryImages().findIndex(media => media.id === imageEl.dataset.id);
	if (imageIndex < 0) return;

	ev.preventDefault();
	ev.stopImmediatePropagation();

	const fallbackLink = imageEl.querySelector<HTMLAnchorElement>('a[href]');
	const instance = await ensureLightbox();
	if (instance != null) {
		instance.loadAndOpen(imageIndex);
	} else if (fallbackLink != null) {
		window.location.href = fallbackLink.href;
	}
}

onMounted(() => {
	calcAspectRatio();
	window.addEventListener('popstate', popstateHandler);

	if (props.eagerLightbox && getGalleryImages().length > 0) {
		void ensureLightbox();
	}
});

onUnmounted(() => {
	isUnmounted = true;
	window.removeEventListener('popstate', popstateHandler);
	lightbox?.destroy();
	lightbox = null;
	lightboxPromise = null;
	activeEl = null;
});

const previewable = (file: Misskey.entities.DriveFile): boolean => {
	if (file.type === 'image/svg+xml') return true; // svgのwebpublic/thumbnailはpngなのでtrue
	// FILE_TYPE_BROWSERSAFEに適合しないものはブラウザで表示するのに不適切
	return (file.type.startsWith('video') || file.type.startsWith('image')) && FILE_TYPE_BROWSERSAFE.includes(file.type);
};

const openGallery = async () => {
	if (getGalleryImages().length > 0) {
		(await ensureLightbox())?.loadAndOpen(0);
	}
};

defineExpose({
	openGallery,
});
</script>

<style lang="scss" module>
.root {
	container-type: inline-size;
}

.container {
	position: relative;
	width: 100%;
}

.medias {
	display: grid;
	gap: 8px;

	height: 100%;
	width: 100%;

	&.n1 {
		grid-template-rows: 1fr;

		// default but fallback (expand)
		min-height: 64px;
		max-height: clamp(
			64px,
			50cqh,
			min(360px, 50vh)
		);

		&.n116_9 {
			min-height: initial;
			max-height: initial;
			aspect-ratio: 16 / 9; // fallback
		}

		&.n11_1{
			min-height: initial;
			max-height: initial;
			aspect-ratio: 1 / 1; // fallback
		}

		&.n12_3 {
			min-height: initial;
			max-height: initial;
			aspect-ratio: 2 / 3; // fallback
		}
	}

	&.n2 {
		aspect-ratio: 16/9;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr;
	}

	&.n3 {
		aspect-ratio: 16/9;
		grid-template-columns: 1fr 0.5fr;
		grid-template-rows: 1fr 1fr;

		> .media:nth-child(1) {
			grid-row: 1 / 3;
		}

		> .media:nth-child(3) {
			grid-column: 2 / 3;
			grid-row: 2 / 3;
		}
	}

	&.n4 {
		aspect-ratio: 16/9;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr 1fr;
	}

	&.nMany {
		grid-template-columns: 1fr 1fr;

		> .media:nth-child(n) {
			aspect-ratio: 16/9;
		}
	}

	&.square {
		min-height: 0;
		max-height: none;
		aspect-ratio: 1 / 1;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		grid-template-rows: repeat(2, minmax(0, 1fr));

		> .media:nth-child(n) {
			grid-column: auto;
			grid-row: auto;
			aspect-ratio: auto;
			border-radius: 0;
		}

		> .media:only-child {
			grid-column: 1 / -1;
			grid-row: 1 / -1;
		}
	}
}

.media {
	overflow: hidden; // clipにするとバグる
	border-radius: 8px;
}

@container (min-width: 500px) {
	.medias.gridInWideArea:not(.square) {
		display: grid;
		aspect-ratio: auto;
		grid-template-columns: repeat(4, 1fr);
		grid-template-rows: auto;
		gap: 8px;

		> .media {
			aspect-ratio: 1 / 1;
		}
	}
}

:global(.pswp) {
	--pswp-root-z-index: var(--mk-pswp-root-z-index, 2000700) !important;
	--pswp-bg: var(--MI_THEME-modalBg) !important;
}
</style>

<style lang="scss">
.pswp__bg {
	background: var(--MI_THEME-modalBg);
	backdrop-filter: var(--MI-modalBgFilter);
}

.pswp__alt-text-container {
	display: flex;
	flex-direction: row;
	align-items: center;

	position: absolute;
	bottom: 20px;
	left: 50%;
	transform: translateX(-50%);

	width: 75%;
	max-width: 800px;
}

.pswp__alt-text {
	color: var(--MI_THEME-fg);
	margin: 0 auto;
	text-align: center;
	padding: var(--MI-margin);
	border-radius: var(--MI-radius);
	max-height: 8em;
	overflow-y: auto;
	text-shadow: var(--MI_THEME-bg) 0 0 10px, var(--MI_THEME-bg) 0 0 3px, var(--MI_THEME-bg) 0 0 3px;
	white-space: pre-line;
}
</style>
