<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkA :to="`/play/${flash.id}`" class="vhpxefrk _panel" :class="[{ gray: flash.visibility === 'private' }]">
	<article>
		<header>
			<h1 :title="flash.title">{{ flash.title }}<span v-if="flash.visibility === 'private'" class="privateBadge">{{ i18n.ts.private }}</span></h1>
		</header>
		<p v-if="flash.summary" :title="flash.summary">
			<Mfm class="summaryMfm" :text="flash.summary" :plain="true" :nowrap="true"/>
		</p>
		<footer>
			<img class="icon" :src="flash.user.avatarUrl" alt=""/>
			<p>{{ userName(flash.user) }}</p>
		</footer>
	</article>
</MkA>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { userName } from '@/filters/user.js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	flash: Misskey.entities.Flash;
}>();
</script>

<style lang="scss" scoped>
.vhpxefrk {
	display: block;

	&:hover {
		text-decoration: none;
		color: var(--MI_THEME-accent);
	}

	&:focus-visible {
		outline-offset: -2px;
	}

	> article {
		padding: var(--MI-space-lg);

		> header {
			margin-bottom: var(--MI-space-sm);

			> h1 {
				margin: 0;
				font-size: 1em;
				font-weight: 600;

				> .privateBadge {
					margin-left: var(--MI-space-sm);
					font-size: 0.7em;
					padding: var(--MI-space-2xs) var(--MI-space-sm);
					border-radius: var(--MI-radius-sm);
					color: color-mix(in oklab, var(--MI_THEME-fg) 72%, transparent);
					border: 1px solid var(--MI-border-muted);
				}
			}
		}

		> p {
			margin: 0;
			color: color-mix(in oklab, var(--MI_THEME-fg) 72%, transparent);
			font-size: 0.8em;
			overflow: clip;

			> .summaryMfm {
				display: block;
				width: 100%;
			}
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

	&.gray {
		--c: var(--MI_THEME-bg);
		background-image: linear-gradient(45deg, var(--c) 16.67%, transparent 16.67%, transparent 50%, var(--c) 50%, var(--c) 66.67%, transparent 66.67%, transparent 100%);
		background-size: 16px 16px;
	}

	@media (max-width: 550px) {
		font-size: 12px;

		> article {
			padding: var(--MI-space-md);
		}
	}

	@media (max-width: 500px) {
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
