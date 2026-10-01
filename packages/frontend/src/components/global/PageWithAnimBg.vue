<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<MkAnimBg style="position: absolute;"/>
	<div class="_pageScrollable" :class="$style.body">
		<slot></slot>
	</div>
</div>
</template>

<script lang="ts" setup>
import MkAnimBg from '@/components/display/MkAnimBg.vue';
</script>

<style lang="scss" module>
.body {
	position: absolute;
	top: 0;
	width: 100%;
	height: 100%;

	// 背景の canvas を隠さないよう、_pageScrollable の背景色を上書きする。
	background: transparent !important;
}
</style>
