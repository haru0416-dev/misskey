<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	:class="[
		$style.root,
		{ [$style.compact]: displayMode === 'compact', [$style.iconOnly]: displayMode === 'icon' },
	]"
	:style="themeColorStyle"
	:title="instanceName"
	:role="displayMode === 'icon' ? 'img' : undefined"
	:aria-label="displayMode === 'icon' ? instanceName : undefined"
>
	<img v-if="faviconUrl" :class="$style.icon" :src="faviconUrl" alt=""/>
	<div :class="$style.name">{{ instanceName }}</div>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { instanceName as localInstanceName } from '@shared/utility/config.js';
import type { CSSProperties } from 'vue';
import { instance as localInstance } from '@/instance.js';
import { getProxiedImageUrlNullable } from '@/utility/media-proxy.js';

const props = withDefaults(defineProps<{
	host: string | null;
	instance?: {
		faviconUrl?: string | null
		name?: string | null
		themeColor?: string | null
	};
	displayMode?: 'normal' | 'compact' | 'icon';
}>(), {
	displayMode: 'normal',
});

// if no instance data is given, this is for the local instance
const instanceName = computed(() => props.host == null ? localInstanceName : props.instance?.name ?? props.host);

const faviconUrl = computed(() => {
	let imageSrc: string | null = null;
	if (props.host == null) {
		if (localInstance.iconUrl == null) {
			return '/client-assets/erebia-icon.svg';
		} else {
			imageSrc = localInstance.iconUrl;
		}
	} else {
		imageSrc = props.instance?.faviconUrl ?? null;
	}
	return getProxiedImageUrlNullable(imageSrc);
});

const themeColorStyle = computed<CSSProperties>(() => {
	const themeColor = (props.host == null ? localInstance.themeColor : props.instance?.themeColor) ?? '#777777';
	return {
		background: `linear-gradient(90deg, ${themeColor}, ${themeColor}00)`,
	};
});
</script>

<style lang="scss" module>
$height: 2ex;

.root {
	display: flex;
	align-items: center;
	height: $height;
	border-radius: 4px 0 0 4px;
	overflow: clip;
	color: #fff;

	// text-shadowは重いから使うな

	mask-image: linear-gradient(90deg,
		rgb(0,0,0),
		rgb(0,0,0) calc(100% - 16px),
		rgba(0,0,0,0) 100%
	);
}

.icon {
	height: $height;
	flex-shrink: 0;
}

.name {
	margin-left: 4px;
	line-height: 1;
	font-size: 0.9em;
	font-weight: bold;
	white-space: nowrap;
	overflow: visible;

	// text-shadowは重いから使うな
	color: var(--MI_THEME-fg);
	-webkit-text-stroke: var(--MI_THEME-panel) .225em;
	paint-order: stroke fill;
}

.compact {
	max-width: 9em;
	height: 1.6ex;

	.icon {
		height: 1.6ex;
	}

	.name {
		font-size: 0.78em;
		text-overflow: ellipsis;
		overflow: hidden;
	}
}

.iconOnly {
	width: $height;
	border-radius: 4px;
	mask-image: none;

	.name {
		display: none;
	}
}
</style>
