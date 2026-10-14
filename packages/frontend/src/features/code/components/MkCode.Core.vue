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
import { ref, watch } from 'vue';
import { highlightCode, highlightCodeIfLoaded, renderPlainCode } from '@/features/code/code-highlighter.js';

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

// highlightCode と renderPlainCode は文字をすべてエスケープした HTML を返すので、v-html に渡してよい。
// 言語を読み込み済みなら同期で色を付ける。読み込む間は最新のコードを色なしで出しておき、読み込めたら差し替える。
// MkCodeEditor は入力欄の文字を透明にしてこの表示を重ねるので、待つ間も古いコードを出し続けると打った文字が見えない。
const html = ref(highlightCodeIfLoaded(props.code, props.lang) ?? renderPlainCode(props.code));
let generation = 0;
watch(
	() => [props.code, props.lang] as const,
	async ([code, lang]) => {
		const current = ++generation;
		const ready = highlightCodeIfLoaded(code, lang);
		if (ready != null) {
			html.value = ready;
			return;
		}
		html.value = renderPlainCode(code);
		const highlighted = await highlightCode(code, lang);
		// 待つ間にコードが変わっていたら、古い結果で上書きしない
		if (current === generation) {
			html.value = highlighted;
		}
	},
	{ immediate: true },
);
</script>

<style module lang="scss">
@use '@/features/code/_code-colors.scss' as code;

.root {
	@include code.code-colors;
	overflow: auto;
	color: var(--MI_THEME-codeBlockFg);
	font-family: Consolas, Monaco, Andale Mono, Ubuntu Mono, monospace;

	// 差分の追加・削除・範囲の行は、行の中の字句をすべて 1 色にする。背景に色を敷くと、コードの背景に対して
	// 4.6 程度しかない記号やコメントの色が 4.5 を割るため、文字の色で示す。削除の赤は --MI-text-error と同じ混ぜ方で、
	// 標準テーマのコードの背景に対してライト 4.75、ダーク 5.25。テーマのプレビューに追従するよう、ここで混ぜる。
	& :global(.sh__line[data-annotations~="diff-add"]) {
		@include code.code-colors-single(var(--MI_THEME-codeBlockString));
	}

	& :global(.sh__line[data-annotations~="diff-remove"]) {
		@include code.code-colors-single(color-mix(in srgb, var(--MI_THEME-error) 60%, var(--MI_THEME-fgHighlighted)));
	}

	& :global(.sh__line[data-annotations~="diff-hunk"]) {
		@include code.code-colors-single(var(--MI_THEME-codeBlockFunction));
	}

	& :global(.sh__line[data-annotations~="diff-meta"]) {
		font-weight: bold;
	}
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
