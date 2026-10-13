<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<!-- eslint-disable vue/no-v-html -->
<template>
<pre
	:class="[$style.root, {
		[$style.codeEditor]: codeEditor,
		[$style.outerStyle]: !codeEditor && withOuterStyle,
	}]"
><code :class="$style.code" v-html="html"></code></pre>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { highlightCode } from '@/features/code/code-highlighter.js';

const props = withDefaults(
	defineProps<{
		code: string;
		lang?: string;
		codeEditor?: boolean;
		withOuterStyle?: boolean;
	}>(),
	{
		codeEditor: false,
		withOuterStyle: true,
	},
);

// highlightCode は文字をすべてエスケープした HTML を返すので、v-html に渡してよい。
const html = computed(() => highlightCode(props.code, props.lang));
</script>

<style module lang="scss">
@use '@/features/code/_code-colors.scss' as code;

.root {
	@include code.code-colors;
	overflow: auto;
	color: var(--MI_THEME-codeBlockFg);
	font-family: Consolas, Monaco, Andale Mono, Ubuntu Mono, monospace;
}

.code {
	font-family: inherit;
}

.outerStyle {
	padding: 1em;
	margin: 0;
	border-radius: 8px;
	border: 1px solid var(--MI_THEME-divider);
	background-color: var(--MI_THEME-codeBlockBg);
}

// MkCodeEditor の textarea の下に重ねて表示する。文字の位置を textarea と揃えるため、余白・行の高さ・
// 文字の大きさは textarea と同じ値にする。
.codeEditor {
	padding: 12px;
	margin: 0;
	border-radius: 6px;
	border: none;
	min-height: 130px;
	pointer-events: none;
	min-width: calc(100% - 24px);
	height: 100%;
	display: inline-block;
	line-height: 1.5em;
	font-size: 1em;
	overflow: visible;
	text-rendering: inherit;
	text-transform: inherit;
	white-space: pre;
	background-color: var(--MI_THEME-codeBlockBg);

	// 末尾が改行のとき最後の行は空になる。textarea はその行の高さを取るので、こちらも行ごとに高さを持たせる。
	& :global(.sh__line) {
		display: inline-block;
		min-height: 1em;
	}
}
</style>
