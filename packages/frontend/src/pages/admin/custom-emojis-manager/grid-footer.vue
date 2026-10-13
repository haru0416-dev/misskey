<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- 表の下に固定する操作の列。左に取り消せない操作、中央にページ切り替え、右に確定の操作を置く。 -->
<template>
<div :class="$style.footer">
	<div :class="$style.left"><slot name="left"></slot></div>
	<div :class="$style.center"><slot name="center"></slot></div>
	<div :class="$style.right"><slot name="right"></slot></div>
</div>
</template>

<style lang="scss" module>
.footer {
	position: sticky;
	/* ページ下部のタブバーなど、外側の sticky の下端より上に留める */
	bottom: var(--MI-stickyBottom, 0px);
	z-index: 1;
	display: grid;
	grid-template-columns: 1fr auto 1fr;
	gap: 8px;
	padding: 12px 0;
	background-color: var(--MI_THEME-bg);
	border-top: solid 0.5px var(--MI_THEME-divider);
}

.left,
.center,
.right {
	display: flex;
	align-items: center;
	gap: 8px;
}

.center {
	justify-content: center;
}

.right {
	justify-content: flex-end;
}

/* 狭い画面では 3 列に収まらないので、ページ切り替えを上の行に出して操作を下に並べる */
@container (max-width: 560px) {
	.footer {
		grid-template-columns: 1fr 1fr;
	}

	.center {
		grid-column: 1 / -1;
		grid-row: 1;
	}
}
</style>
