<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- 一覧の続きの取得に失敗したとき、「もっと見る」の上に理由を出す。 -->
<template>
<div v-if="failure" :class="$style.root">{{ paginatorErrorText(failure.code) ?? i18n.ts.somethingHappened }}</div>
</template>

<script lang="ts" setup>
import { i18n } from '@/i18n.js';
import { paginatorErrorText } from '@/utility/paginator.js';
import type { PaginatorFailure } from '@/utility/paginator.js';

defineProps<{
	failure: PaginatorFailure | null;
}>();
</script>

<style lang="scss" module>
.root {
	margin-bottom: 8px;
	text-align: center;
	font-size: 0.9em;
	opacity: 0.7;
}
</style>
