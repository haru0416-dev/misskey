<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkA :to="`/gallery/${post.id}`" class="ttasepnz _panel" @pointerenter="enterHover" @pointerleave="leaveHover">
	<div class="thumbnail">
		<MkImgWithBlurhash
			class="img layered"
			:transition="safe ? null : {
				duration: 500,
				leaveActiveClass: $style.transition_toggle_leaveActive,
				leaveToClass: $style.transition_toggle_leaveTo,
			}"
			v-bind="{
				...(post.files?.[0]?.thumbnailUrl === undefined ? {} : { src: post.files[0].thumbnailUrl }),
				...(post.files?.[0]?.blurhash === undefined ? {} : { hash: post.files[0].blurhash }),
			}"
			:forceBlurhash="!show"
		/>
	</div>
	<article>
		<header>
			<MkAvatar :user="post.user" class="avatar" link preview/>
		</header>
		<footer>
			<span class="title">{{ post.title }}</span>
		</footer>
	</article>
</MkA>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { computed, ref } from 'vue';
import MkImgWithBlurhash from '@/features/media-viewer/components/MkImgWithBlurhash.vue';
import { prefer } from '@/preferences.js';

const props = defineProps<{
	post: Misskey.entities.GalleryPost;
}>();

const hover = ref(false);
const safe = computed(() => prefer.nsfw === 'ignore' || prefer.nsfw === 'respect' && !props.post.isSensitive);
const show = computed(() => safe.value || hover.value);

function enterHover(): void {
	hover.value = true;
}

function leaveHover(): void {
	hover.value = false;
}
</script>

<style lang="scss" module>
.transition_toggle_leaveActive {
	transition: opacity .5s;
	position: absolute;
	top: 0;
	left: 0;
}

.transition_toggle_leaveTo {
	opacity: 0;
}
</style>

<style lang="scss" scoped>
.ttasepnz {
	display: block;
	position: relative;
	height: 200px;

	&:hover {
		text-decoration: none;
	}

	> .thumbnail {
		width: 100%;
		height: 100%;
		position: absolute;

		> .img {
			width: 100%;
			height: 100%;
			object-fit: cover;

			&.layered {
				position: absolute;
				top: 0;
			}
		}
	}

	> article {
		position: absolute;
		z-index: 1;
		width: 100%;
		height: 100%;

		> header {
			position: absolute;
			top: 0;
			width: 100%;
			padding: var(--MI-space-md);
			box-sizing: border-box;
			display: flex;

			> .avatar {
				margin-left: auto;
				width: 32px;
				height: 32px;
			}
		}

		> footer {
			position: absolute;
			bottom: 0;
			width: 100%;
			padding: var(--MI-space-lg);
			box-sizing: border-box;
			color: #fff;
			text-shadow: 0 0 8px #000;
			background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));

			> .title {
				font-weight: bold;
				display: -webkit-box;
				-webkit-box-orient: vertical;
				-webkit-line-clamp: 2;
				line-clamp: 2;
				overflow: hidden;
				overflow-wrap: anywhere;
			}
		}
	}
}
</style>
