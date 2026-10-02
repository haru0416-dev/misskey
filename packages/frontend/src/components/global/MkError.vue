<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkResult type="error" :text="props.text">
	<MkButton :class="$style.button" rounded @click="() => emit('retry')">{{ i18n.ts.retry }}</MkButton>
</MkResult>
</template>

<script lang="ts" setup>
import MkButton from '@/components/form/MkButton.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	/** 省略すると MkResult のデフォルト (問題が発生しました) を出す。 */
	text?: string | undefined;
}>();

const emit = defineEmits<{
	(ev: 'retry'): void;
}>();
</script>

<style lang="scss" module>
.button {
	margin: 0 auto;
}
</style>
