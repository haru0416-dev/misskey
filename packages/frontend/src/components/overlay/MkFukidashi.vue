<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	:class="[
		$style.root,
		tail === 'left' ? $style.left : tail === 'right' ? $style.right : null,
		accented === true && $style.accented,
		fullWidth === true && $style.fullWidth,
	]"
>
	<div :class="$style.bg">
		<div :class="$style.content">
			<slot></slot>
		</div>
	</div>
</div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
	/** 発言者のいる側。その側の上角だけ鋭角 (ドッキングコーナー) になる。none は全角均一 */
	tail?: 'left' | 'right' | 'none';
	accented?: boolean;
	fullWidth?: boolean;
}>(), {
	tail: 'right',
	accented: false,
	fullWidth: false,
});
</script>

<style module lang="scss">
// ドッキングコーナー吹き出し: テール装飾の代わりに発言者側の上角だけを鋭角にして向きを示す。
// 鋭角UIトークン (radius-lg/radius-xs) に整合し、テールSVGだった頃の張り出し補正 padding は不要
.root {
	--fukidashi-radius: var(--MI-radius-lg);
	--fukidashi-dock-radius: var(--MI-radius-xs);
	--fukidashi-bg: var(--MI_THEME-panel);

	position: relative;
	display: inline-block;
	min-height: calc(var(--fukidashi-radius) * 2);

	&.accented {
		--fukidashi-bg: color-mix(in srgb, var(--MI_THEME-accent), var(--MI_THEME-panel) 85%);
	}

	&.fullWidth {
		width: 100%;
	}
}

.bg {
	width: 100%;
	height: 100%;
	background: var(--fukidashi-bg);
	border-radius: var(--fukidashi-radius);
}

.left > .bg {
	border-top-left-radius: var(--fukidashi-dock-radius);
}

.right > .bg {
	border-top-right-radius: var(--fukidashi-dock-radius);
}

.content {
	position: relative;
	padding: 10px 14px;
	box-sizing: border-box;
}

@container (max-width: 450px) {
	.content {
		padding: 8px 12px;
	}
}
</style>
