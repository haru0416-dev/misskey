<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkA :to="`/@${page.user.username}/pages/${page.name}`" class="vhpxefrj">
	<div v-if="page.eyeCatchingImage" class="thumbnail">
		<MediaImage
			:image="page.eyeCatchingImage"
			:disableImageLink="true"
			:controls="false"
			:cover="true"
			:class="$style.eyeCatchingImageRoot"
		/>
	</div>
	<article>
		<header>
			<h1 :title="page.title">{{ page.title }}</h1>
		</header>
		<p v-if="page.summary" :title="page.summary">{{ page.summary.length > 85 ? page.summary.slice(0, 85) + '…' : page.summary }}</p>
		<footer>
			<img class="icon" :src="page.user.avatarUrl" alt=""/>
			<p>{{ userName(page.user) }}</p>
		</footer>
	</article>
</MkA>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { userName } from '@/filters/user.js';
import MediaImage from '@/features/media-viewer/components/MkMediaImage.vue';

const props = defineProps<{
	page: Misskey.entities.Page;
}>();
</script>

<style module>
.eyeCatchingImageRoot {
	width: 100%;
	height: 200px;
	border-radius: var(--MI-radius) var(--MI-radius) 0 0;
	overflow: hidden;
}
</style>

<style lang="scss" scoped>
.vhpxefrj {
	display: block;
	position: relative;

	&:hover {
		text-decoration: none;
		color: var(--MI_THEME-accent);
	}

	&:focus-visible {
		outline: none;

		&::after {
			content: "";
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			border-radius: var(--MI-radius);
			pointer-events: none;
			box-shadow: inset 0 0 0 2px var(--MI_THEME-focus);
		}
	}

	> .thumbnail {
		& + article {
			border-radius: 0 0 var(--MI-radius) var(--MI-radius);
		}
	}

	> article {
		background-color: var(--MI_THEME-panel);
		padding: var(--MI-space-lg);
		border-radius: var(--MI-radius);

		> header {
			margin-bottom: var(--MI-space-sm);

			> h1 {
				margin: 0;
				font-size: 1em;
				font-weight: 600;
			}
		}

		> p {
			margin: 0;
			color: color-mix(in oklab, var(--MI_THEME-fg) 72%, transparent);
			font-size: 0.8em;
		}

		> footer {
			margin-top: var(--MI-space-sm);
			height: 16px;

			> img {
				display: inline-block;
				width: 16px;
				height: 16px;
				margin-right: var(--MI-space-xs);
				vertical-align: top;
			}

			> p {
				display: inline-block;
				margin: 0;
				color: color-mix(in oklab, var(--MI_THEME-fg) 72%, transparent);
				font-size: 0.8em;
				line-height: 16px;
				vertical-align: top;
			}
		}
	}

	@media (max-width: 700px) {
		> .thumbnail {
			position: relative;
			width: 100%;
			height: 100px;

			& + article {
				left: 0;
			}
		}
	}

	@media (max-width: 550px) {
		font-size: 12px;

		> .thumbnail {
			height: 80px;
			overflow: clip;
		}

		> article {
			padding: var(--MI-space-md);
		}
	}

	@media (max-width: 500px) {
		> .thumbnail {
			height: 70px;
		}

		> article {
			padding: var(--MI-space-sm);

			> header {
				margin-bottom: var(--MI-space-xs);
			}

			> footer {
				margin-top: var(--MI-space-xs);

				> img {
					width: 12px;
					height: 12px;
				}
			}
		}
	}
}

</style>
