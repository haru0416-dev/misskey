<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[hide ? $style.hidden : $style.visible, cover && $style.cover, (image.isSensitive && prefer.highlightSensitiveMedia) && $style.sensitive]" @click="onClick" @contextmenu.stop="onContextmenu">
	<component
		:is="disableImageLink ? 'div' : 'a'"
		v-bind="disableImageLink ? {
			title: image.name,
			class: $style.imageContainer,
			role: controls ? 'button' : undefined,
			tabindex: controls ? 0 : undefined,
		} : {
			title: image.name,
			class: $style.imageContainer,
			href: image.url,
			style: 'cursor: zoom-in;'
		}"
		@keydown.enter="onKeyboardOpen"
		@keydown.space.prevent="onKeyboardOpen"
	>
		<MkImgWithBlurhash
			v-if="prefer.enableHighQualityImagePlaceholders"
			:hash="image.blurhash"
			:src="(prefer.dataSaver.media && hide) ? null : url"
			v-bind="{ ...(image.properties.width === undefined ? {} : { width: image.properties.width }), ...(image.properties.height === undefined ? {} : { height: image.properties.height }), ...(marker === undefined ? {} : { marker }) }"
			:forceBlurhash="hide"
			:cover="hide || cover"
			:alt="image.comment || image.name"
			:title="image.comment || image.name"
			:style="hide ? 'filter: brightness(0.7);' : null"
			:class="$style.image"
		/>
		<div
			v-else-if="prefer.dataSaver.media || hide"
			:title="image.comment || image.name"
			:style="hide ? 'background: #888;' : null"
			:class="$style.image"
			:data-marker="marker"
		></div>
		<img
			v-else
			:src="url"
			:alt="image.comment || image.name"
			:title="image.comment || image.name"
			:class="$style.image"
			:data-marker="marker"
		/>
	</component>
	<template v-if="hide">
		<div :class="$style.hiddenText">
			<div :class="$style.hiddenTextWrapper">
				<b v-if="image.isSensitive" style="display: block;"><i class="ti ti-eye-exclamation"></i> {{ i18n.ts.sensitive }}{{ prefer.dataSaver.media ? ` (${i18n.ts.image}${image.size ? ' ' + bytes(image.size) : ''})` : '' }}</b>
				<b v-else style="display: block;"><i class="ti ti-photo"></i> {{ prefer.dataSaver.media && image.size ? bytes(image.size) : i18n.ts.image }}</b>
				<span v-if="controls" style="display: block;">{{ i18n.ts.clickToShow }}</span>
			</div>
		</div>
	</template>
	<template v-else-if="controls">
		<div :class="$style.indicators">
			<div v-if="['image/gif', 'image/apng'].includes(image.type)" :class="$style.indicator">GIF</div>
			<div v-if="image.comment" :class="$style.indicator">ALT</div>
			<div v-if="image.isSensitive" :class="$style.indicator" style="color: var(--MI_THEME-warn);" :title="i18n.ts.sensitive"><i class="ti ti-eye-exclamation"></i></div>
		</div>
		<button type="button" :class="$style.menu" class="_button" :aria-label="i18n.ts.menu" @click.stop="showMenu"><i class="ti ti-dots" style="vertical-align: middle;"></i></button>
		<button type="button" class="_button" :class="$style.hide" :aria-label="i18n.ts.hide" @click.stop="hide = true"><i class="ti ti-eye-off"></i></button>
	</template>
</div>
</template>

<script lang="ts" setup>
import { watch, ref, computed } from 'vue';
import * as Misskey from 'misskey-js';
import { getStaticImageUrl } from '@/utility/media-proxy.js';
import bytes from '@/filters/bytes.js';
import MkImgWithBlurhash from '@/features/media-viewer/components/MkImgWithBlurhash.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { prefer } from '@/preferences.js';
import { shouldHideFileByDefault, canRevealFile } from '@/features/media-viewer/sensitive-file.js';
import { getFileMenu } from '@/features/media-viewer/get-file-menu.js';

const props = withDefaults(
	defineProps<{
		image: Misskey.entities.DriveFile;
		raw?: boolean;
		cover?: boolean;
		disableImageLink?: boolean;
		controls?: boolean;
		marker?: string;
	}>(),
	{
		cover: false,
		disableImageLink: false,
		controls: true,
	},
);

const emit = defineEmits<{
	(event: 'mediaClick', ev: Event): void;
}>();

const hide = ref(true);

const url = computed(() =>
	props.raw || prefer.loadRawImages
		? props.image.url
		: prefer.disableShowingAnimatedImages
			? getStaticImageUrl(props.image.url)
			: props.image.thumbnailUrl!,
);

async function onClick(ev: Event) {
	if (!props.controls) {
		emit('mediaClick', ev);
		return;
	}

	if (hide.value) {
		ev.stopPropagation();
		if (!(await canRevealFile(props.image))) {
			return;
		}

		hide.value = false;
	} else {
		emit('mediaClick', ev);
	}
}

function onKeyboardOpen(ev: KeyboardEvent) {
	if (!props.disableImageLink) {
		return;
	}
	void onClick(ev);
}

// Plugin:register_note_view_interruptor を使って書き換えられる可能性があるためwatchする
watch(
	() => props.image,
	(newImage) => {
		hide.value = shouldHideFileByDefault(newImage);
	},
	{
		deep: true,
		immediate: true,
	},
);

function showMenu(ev: PointerEvent) {
	os.popupMenu(
		getFileMenu(props.image, (value) => {
			hide.value = value;
		}),
		(ev.currentTarget ?? ev.target ?? undefined) as HTMLElement | undefined,
	);
}

function onContextmenu(ev: PointerEvent) {
	os.contextMenu(
		getFileMenu(props.image, (value) => {
			hide.value = value;
		}),
		ev,
	);
}

defineExpose({
	/** 一覧でぼかしを外しているか。画像ビューワーを開くときに引き継ぐ。 */
	isRevealed: () => !hide.value,
});
</script>

<style lang="scss" module>
.hidden {
	position: relative;
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

.hiddenText {
	position: absolute;
	left: 0;
	top: 0;
	width: 100%;
	height: 100%;
	z-index: 1;
	display: flex;
	justify-content: center;
	align-items: center;
	cursor: pointer;
}

.hide {
	display: block;
	position: absolute;
	background-color: rgba(0, 0, 0, 0.3);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
	border-radius: 0 0 0 var(--MI-radius-lg);
	color: #fff;
	font-size: var(--MI-text-meta);
	opacity: .5;
	padding: var(--MI-step-2) var(--MI-step-3);
	text-align: center;
	cursor: pointer;
	top: 0;
	right: 0;
}

.hiddenTextWrapper {
	display: table-cell;
	text-align: center;
	font-size: 0.8em;
	color: #fff;
}

// 縦横比が枠と合わない画像の余りは無地の面にして、画像の輪郭だけが目に入るようにする。
.visible {
	position: relative;
	background: var(--MI-surface-subtle);
}

.cover .image {
	object-fit: cover;
}

.menu {
	display: flex;
	align-items: center;
	justify-content: center;
	position: absolute;
	background-color: rgba(0, 0, 0, 0.3);
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
	border-radius: var(--MI-radius-lg) 0 0 0;
	color: #fff;
	font-size: var(--MI-text-meta);
	width: var(--MI-step-6);
	height: var(--MI-step-6);
	text-align: center;
	bottom: 0;
	right: 0;
}

.imageContainer {
	display: block;
	overflow: hidden;
	width: 100%;
	height: 100%;
	background-position: center;
	background-size: contain;
	background-repeat: no-repeat;
}

.indicators {
	display: inline-flex;
	position: absolute;
	top: var(--MI-step-3);
	left: var(--MI-step-3);
	pointer-events: none;
	opacity: .5;
	gap: var(--MI-step-2);
}

.indicator {
	/* --MI_THEME-bg と --MI_THEME-fg は明暗テーマのどちらかで読みにくくなるため、黒に固定する。 */
	background-color: black;
	border-radius: 6px;
	color: hsl(from var(--MI_THEME-accent) h s calc(l + 10));
	display: inline-block;
	font-weight: bold;
	font-size: 0.8em;
	padding: 2px 5px;
}

.image {
	display: block;
	width: 100%;
	height: 100%;
	object-fit: contain;
	object-position: center;
}
</style>
