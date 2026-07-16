<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div style="position: relative;">
	<MkA :to="`/channels/${channel.id}`" class="eftoefju _panel" @click="updateLastReadedAt">
		<div class="banner" :class="{ bannerFallback: !channel.bannerUrl }" :style="bannerStyle">
			<div class="fade"></div>
			<div class="name"><i class="ti ti-device-tv" aria-hidden="true"></i> {{ channel.name }}</div>
			<div v-if="channel.isSensitive" class="sensitiveIndicator">{{ i18n.ts.sensitive }}</div>
			<div class="status">
				<div>
					<i class="ti ti-users ti-fw" aria-hidden="true"></i>
					<I18n :src="i18n.ts._channel.usersCount" tag="span" style="margin-left: var(--MI-space-xs);">
						<template #n>
							<b>{{ channel.usersCount }}</b>
						</template>
					</I18n>
				</div>
				<div>
					<i class="ti ti-pencil ti-fw" aria-hidden="true"></i>
					<I18n :src="i18n.ts._channel.notesCount" tag="span" style="margin-left: var(--MI-space-xs);">
						<template #n>
							<b>{{ channel.notesCount }}</b>
						</template>
					</I18n>
				</div>
				<div v-if="$i != null && $i.id === channel.userId" style="color: var(--MI_THEME-warn)">
					<i class="ti ti-user-star ti-fw" aria-hidden="true"></i>
					<span style="margin-left: var(--MI-space-xs);">{{ i18n.ts.youAreAdmin }}</span>
				</div>
			</div>
		</div>
		<article v-if="channel.description">
			<p :title="channel.description">{{ channel.description }}</p>
		</article>
		<footer>
			<span v-if="channel.lastNotedAt">
				{{ i18n.ts.updatedAt }}: <MkTime :time="channel.lastNotedAt"/>
			</span>
		</footer>
	</MkA>
	<div
		v-if="channel.lastNotedAt && (channel.isFavorited || channel.isFollowing) && (!lastReadedAt || Date.parse(channel.lastNotedAt) > lastReadedAt)"
		class="indicator"
	></div>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { $i } from '@/i.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';

const props = defineProps<{
	channel: Misskey.entities.Channel;
}>();

const getLastReadedAt = (): number | null => {
	return miLocalStorage.getItemAsJson(
		`channelLastReadedAt:${props.channel.id}`,
		(value): value is number => typeof value === 'number' && Number.isFinite(value),
	) ?? null;
};

const lastReadedAt = ref(getLastReadedAt());

watch(() => props.channel.id, () => {
	lastReadedAt.value = getLastReadedAt();
});

const updateLastReadedAt = () => {
	lastReadedAt.value = props.channel.lastNotedAt ? Date.parse(props.channel.lastNotedAt) : Date.now();
};

const bannerStyle = computed(() => {
	if (props.channel.bannerUrl) {
		return { backgroundImage: `url(${props.channel.bannerUrl})` };
	} else {
		return undefined;
	}
});
</script>

<style lang="scss" scoped>
.eftoefju {
	display: block;
	position: relative;
	overflow: hidden;
	width: 100%;

	&:hover {
		text-decoration: none;
	}

	&:focus-visible {
		outline: none;

		&::after {
			content: '';
			position: absolute;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			border-radius: inherit;
			pointer-events: none;
			box-shadow: inset 0 0 0 2px var(--MI_THEME-focus);
		}
	}

	> .banner {
		position: relative;
		width: 100%;
		height: 200px;
		background-position: center;
		background-size: cover;

		&.bannerFallback {
			background: var(--MI-surface-subtle);
		}

		> .fade {
			position: absolute;
			bottom: 0;
			left: 0;
			width: 100%;
			height: 64px;
			background: linear-gradient(0deg, var(--MI_THEME-panel), color(from var(--MI_THEME-panel) srgb r g b / 0));
		}

		> .name {
			position: absolute;
			top: var(--MI-space-lg);
			left: var(--MI-space-lg);
			max-width: calc(100% - 32px);
			padding: var(--MI-space-md) var(--MI-space-lg);
			box-sizing: border-box;
			background: rgba(0, 0, 0, 0.7);
			color: #fff;
			font-size: 1.2em;
		}

		> .status {
			position: absolute;
			z-index: 1;
			bottom: var(--MI-space-lg);
			right: var(--MI-space-lg);
			padding: var(--MI-space-sm) var(--MI-space-md);
			font-size: 80%;
			background: rgba(0, 0, 0, 0.7);
			border-radius: var(--MI-radius-md);
			color: #fff;
		}

		> .sensitiveIndicator {
			position: absolute;
			z-index: 1;
			bottom: var(--MI-space-lg);
			left: var(--MI-space-lg);
			background: rgba(0, 0, 0, 0.7);
			color: var(--MI_THEME-warn);
			border-radius: var(--MI-radius-md);
			font-weight: bold;
			font-size: 1em;
			padding: var(--MI-space-xs) var(--MI-space-sm);
		}
	}

	> article {
		padding: var(--MI-space-lg);

		> p {
			margin: 0;
			font-size: 1em;
			display: -webkit-box;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 2;
			line-clamp: 2;
			overflow: hidden;
		}
	}

	> footer {
		padding: var(--MI-space-md) var(--MI-space-lg);
		border-top: solid 0.5px var(--MI_THEME-divider);

		> span {
			opacity: 0.7;
			font-size: 0.9em;
		}
	}

	@media (max-width: 550px) {
		font-size: 0.9em;

		> .banner {
			height: 80px;

			> .status {
				display: none;
			}
		}

		> article {
			padding: var(--MI-space-md);
		}

		> footer {
			display: none;
		}
	}

	@media (max-width: 500px) {
		font-size: 0.8em;

		> .banner {
			height: 70px;
		}

		> article {
			padding: var(--MI-space-sm);
		}
	}
}

.indicator {
	position: absolute;
	top: 0;
	right: 0;
	transform: translate(25%, -25%);
	background-color: var(--MI_THEME-accent);
	border: solid var(--MI_THEME-bg) 4px;
	border-radius: var(--MI-radius-full);
	width: 1.5rem;
	height: 1.5rem;
	aspect-ratio: 1 / 1;
}

</style>
