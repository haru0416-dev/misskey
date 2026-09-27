<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<EmCustomEmoji v-if="reaction[0] === ':'" ref="elRef" :name="reaction" :normal="true" :noStyle="noStyle" :url="emojiUrl" :fallbackToImage="true"/>
<EmEmoji v-else ref="elRef" :emoji="reaction" :normal="true" :noStyle="noStyle"/>
</template>

<script lang="ts" setup>
import EmCustomEmoji from './EmCustomEmoji.vue';
import EmEmoji from './EmEmoji.vue';

defineProps<{
	reaction: string;
	noStyle?: boolean;
	emojiUrl?: string | undefined;
}>();
</script>
