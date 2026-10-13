<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<div :class="$style.label"><slot name="label"></slot></div>
	<div :class="[$style.input, { [$style.disabled]: disabled, [$style.focused]: focused }]">
		<input
			ref="inputEl"
			v-model="v"
			v-adaptive-border
			:class="[$style.inputCore, { [$style.unsetInput]: unset }]"
			type="color"
			:disabled="disabled"
			:required="required"
			:readonly="readonly"
			@focus="focused = true"
			@blur="focused = false"
			@input="onInput"
		>
		<span v-if="unset" :class="$style.unsetLabel">{{ i18n.ts.notSet }}</span>
		<button v-else-if="clearable && !disabled && !readonly" type="button" class="_button" :class="$style.clear" :aria-label="i18n.ts.clear" @click="clear"><i class="ti ti-x"></i></button>
	</div>
	<div :class="$style.caption"><slot name="caption"></slot></div>
</div>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef, toRefs } from 'vue';
import tinycolor from 'tinycolor2';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	modelValue: string | null;
	required?: boolean;
	readonly?: boolean;
	disabled?: boolean;
	/** 未設定 (空の値) に戻せるようにする。空を保存できる項目だけで使う。 */
	clearable?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'update:modelValue', value: string): void;
}>();

// <input type="color"> は #rrggbb の形しか受け付けず、空の値や #000 を入れるとブラウザが警告して黒を表示する。
// 表示用の値だけをその形にそろえ、v-model の値は利用者が色を選ぶまで変えない。
// input イベントは値が変わったときしか起きず、ピッカーを開いた色をそのまま確定しても選んだことにならない。
// 未設定のときは、黒やクリアする前の色、よく使われる #808080 などと重ならない灰色から選び始める。
const UNSET_PICKER_VALUE = '#808081';

function toColorInputValue(color: string | null): string {
	const parsed = tinycolor(color ?? '');
	return parsed.isValid() ? parsed.toHexString() : UNSET_PICKER_VALUE;
}

const { modelValue } = toRefs(props);
const v = ref(toColorInputValue(modelValue.value));
const focused = ref(false);
const inputEl = useTemplateRef('inputEl');

// <input type="color"> は空の値を表せず黒を表示するので、未設定かどうかは別に持って表示を変える
const unset = ref(modelValue.value == null || modelValue.value === '');

const onInput = () => {
	unset.value = false;
	emit('update:modelValue', v.value ?? '');
};

function clear() {
	unset.value = true;
	v.value = UNSET_PICKER_VALUE;
	emit('update:modelValue', '');
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
	color: var(--MI-text-muted);
}

:is(.label, .caption):empty {
	display: none;
}

.input {
	position: relative;

	&.focused {
		> .inputCore {
			border-color: var(--MI_THEME-accent) !important;
		}
	}

	&.disabled {
		opacity: 0.7;

		&,
		> .inputCore {
			cursor: not-allowed;
		}
	}
}

.inputCore {
	appearance: none;
	-webkit-appearance: none;
	display: block;
	height: 42px;
	width: 100%;
	margin: 0;
	padding: 0 12px;
	font: inherit;
	font-weight: normal;
	font-size: 1em;
	color: var(--MI_THEME-fg);
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-panel);
	border-radius: 6px;
	outline: none;
	box-shadow: none;
	box-sizing: border-box;
	transition: border-color 0.1s ease-out;

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: 2px;
	}

	&:hover {
		border-color: var(--MI_THEME-inputBorderHover) !important;
	}
}

/* 未設定のときは色見本を透かし、上に「未設定」と出す。押すと色を選べる */
.unsetInput {
	opacity: 0;
}

.unsetLabel {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	padding: 0 12px;
	color: var(--MI-text-muted);
	background: var(--MI_THEME-panel);
	border-radius: 6px;
	pointer-events: none;
}

.clear {
	position: absolute;
	top: 50%;
	right: 6px;
	display: grid;
	place-items: center;
	width: 30px;
	height: 30px;
	transform: translateY(-50%);
	color: var(--MI_THEME-fg);
	background: var(--MI_THEME-panel);
	border-radius: 999px;
}
</style>
