<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<div :class="$style.label" @click="focus"><slot name="label"></slot></div>
	<div>
		<slot></slot>
	</div>
	<div :class="$style.caption"><slot name="caption"></slot></div>
</div>
</template>

<script lang="ts" setup>

function focus() {
	// TODO: ラベルに対応するフォームコントロールへフォーカスを移す
}
</script>

<style lang="scss" module>
.label {
	font-size: 0.85em;
	padding: 0 0 8px 0;
	user-select: none;
}

.caption {
	font-size: 0.85em;
	padding: 8px 0 0 0;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.75);
}

:is(.label, .caption):empty {
	display: none;
}
</style>
