<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps" :class="$style.textRoot">
	<Mfm :text="block.text ?? ''" :parsedNodes="parsed" :isNote="false"/>
	<div v-if="isEnabledUrlPreview" class="_gaps_s">
		<MkUrlPreview v-for="url in urls" :key="url" :url="url"/>
	</div>
</div>
</template>

<script lang="ts" setup>
import { defineAsyncComponent } from 'vue';
import * as mfm from 'mfm-js';
import * as Misskey from 'misskey-js';
import { extractUrlFromMfm } from '@/utility/extract-url-from-mfm.js';
import { isEnabledUrlPreview } from '@/features/link-preview/url-preview.js';

const MkUrlPreview = defineAsyncComponent(() => import('@/features/link-preview/components/MkUrlPreview.vue'));

const props = defineProps<{
	block: Extract<Misskey.entities.PageBlock, { type: 'text' }>,
	page: Misskey.entities.Page,
}>();

// 本文の描画と URL プレビューの抽出で同じ構文木を使う。
const parsed = props.block.text ? mfm.parse(props.block.text) : null;
const urls = parsed ? extractUrlFromMfm(parsed) : [];
</script>

<style lang="scss" module>
.textRoot {
	font-size: 1.1rem;
}
</style>
