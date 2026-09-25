<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<img
	:alt="alt"
	v-if="errored && fallbackToImage"
	:class="[$style.root, { [$style.normal]: normal, [$style.noStyle]: noStyle }]"
	src="/client-assets/dummy.png"
	:title="alt"
/>
<span v-else-if="errored">:{{ customEmojiName }}:</span>
<img
	v-else
	:class="[$style.root, { [$style.normal]: normal, [$style.noStyle]: noStyle }]"
	:src="url"
	:alt="alt"
	:title="alt"
	decoding="async"
	@error="errored = true"
	@load="errored = false"
/>
</template>

<script lang="ts" setup>
import { inject, ref } from 'vue';
import { useCustomEmojiUrl } from '@shared/utility/use-custom-emoji-url.js';
import { customEmojisMap } from '@/custom-emojis.js';
import { DI } from '@/di.js';

const mediaProxy = inject(DI.mediaProxy)!;

const props = defineProps<{
	name: string;
	normal?: boolean;
	noStyle?: boolean;
	host?: string | null;
	url?: string | undefined;
	useOriginalSize?: boolean;
	fallbackToImage?: boolean;
}>();

const { customEmojiName, url, alt } = useCustomEmojiUrl(props, {
	emojisMap: customEmojisMap,
	getProxiedImageUrl: (...args) => mediaProxy.getProxiedImageUrl(...args),
});
const errored = ref(url.value == null);
</script>

<style lang="scss" module>
.root {
	height: 2em;
	vertical-align: middle;
	transition: transform 0.2s ease;

	&:hover {
		transform: scale(1.2);
	}
}

.normal {
	height: 1.25em;
	vertical-align: -0.25em;

	&:hover {
		transform: none;
	}
}

.noStyle {
	height: auto;
}
</style>
