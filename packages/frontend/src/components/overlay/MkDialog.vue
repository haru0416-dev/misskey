<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" :preferType="'dialog'" :zPriority="'high'" @click="onBgClick" @closed="emit('closed')" @esc="cancel()">
	<div :class="$style.root" :role="(input || select) ? 'dialog' : 'alertdialog'" aria-modal="true" :aria-labelledby="title ? titleId : undefined" :aria-describedby="text ? textId : undefined">
		<div v-if="icon" :class="$style.icon" aria-hidden="true">
			<i :class="icon"></i>
		</div>
		<div
			v-else-if="!input && !select"
			:class="[$style.icon]"
			aria-hidden="true"
		>
			<MkSystemIcon v-if="type === 'success'" :class="[$style.iconInner, $style.systemIcon]" type="success"/>
			<MkSystemIcon v-else-if="type === 'error'" :class="[$style.iconInner, $style.systemIcon]" type="error"/>
			<MkSystemIcon v-else-if="type === 'warning'" :class="[$style.iconInner, $style.systemIcon]" type="warn"/>
			<MkSystemIcon v-else-if="type === 'info'" :class="[$style.iconInner, $style.systemIcon]" type="info"/>
			<MkSystemIcon v-else-if="type === 'question'" :class="[$style.iconInner, $style.systemIcon]" type="question"/>
			<MkLoading v-else-if="type === 'waiting'" :class="$style.iconInner" :em="true"/>
		</div>
		<header v-if="title" :id="titleId" :class="$style.title" class="_selectable"><Mfm :text="title"/></header>
		<div v-if="text" :id="textId" :class="$style.text" class="_selectable"><Mfm :text="text"/></div>
		<MkInput v-if="input" v-model="inputValue" v-bind="{ ...(input.placeholder == null ? {} : { placeholder: input.placeholder }), ...(input.autocomplete === undefined ? {} : { autocomplete: input.autocomplete }) }" autofocus :type="input.type || 'text'" @keydown="onInputKeydown">
			<template v-if="input.type === 'password'" #prefix><i class="ti ti-lock"></i></template>
			<template #caption>
				<span v-if="okButtonDisabledReason === 'charactersExceeded'" v-text="i18n.tsx._dialog.charactersExceeded({ current: (inputValue as string)?.length ?? 0, max: input.maxLength ?? 'NaN' })"></span>
				<span v-else-if="okButtonDisabledReason === 'charactersBelow'" v-text="i18n.tsx._dialog.charactersBelow({ current: (inputValue as string)?.length ?? 0, min: input.minLength ?? 'NaN' })"></span>
			</template>
		</MkInput>
		<MkSelect v-if="select" v-model="selectedValue" :items="selectDef" autofocus></MkSelect>
		<div v-if="(showOkButton || showCancelButton) && !actions" :class="$style.buttons">
			<MkButton v-if="showOkButton" data-cy-modal-dialog-ok inline primary rounded :autofocus="!input && !select" :disabled="okButtonDisabledReason != null" @click="ok">{{ okText ?? ((showCancelButton || input || select) ? i18n.ts.ok : i18n.ts.gotIt) }}</MkButton>
			<MkButton v-if="showCancelButton || input || select" data-cy-modal-dialog-cancel inline rounded @click="cancel">{{ cancelText ?? i18n.ts.cancel }}</MkButton>
		</div>
		<div v-if="actions" :class="$style.buttons">
			<MkButton v-for="action in actions" :key="action.text" v-bind="{ ...(action.primary === undefined ? {} : { primary: action.primary }), ...(action.danger === undefined ? {} : { danger: action.danger }) }" inline rounded @click="() => { action.callback(); modal?.close(); }">{{ action.text }}</MkButton>
		</div>
	</div>
</MkModal>
</template>

<script lang="ts">
export type Result = string | number | true | null;
export type MkDialogReturnType<T = Result> = { canceled: true, result: undefined } | { canceled: false, result: T };
</script>

<script lang="ts" setup>
import { ref, useTemplateRef, computed, useId } from 'vue';
import MkModal from '@/components/overlay/MkModal.vue';
import MkButton from '@/components/form/MkButton.vue';
import MkInput from '@/components/form/MkInput.vue';
import MkSelect from '@/components/form/MkSelect.vue';
import type { MkSelectItem } from '@/components/form/MkSelect.vue';
import type { OptionValue } from '@/types/option-value.js';
import { useMkSelect } from '@/composables/useMkSelect.js';
import { i18n } from '@/i18n.js';

type Input = {
	type?: 'text' | 'number' | 'password' | 'email' | 'url' | 'date' | 'time' | 'search' | 'datetime-local';
	placeholder?: string | null;
	autocomplete?: string;
	default: string | number | null;
	minLength?: number;
	maxLength?: number;
};

type Select = {
	items: MkSelectItem[];
	default: OptionValue | null;
};

const props = withDefaults(defineProps<{
	type?: 'success' | 'error' | 'warning' | 'info' | 'question' | 'waiting';
	title?: string;
	text?: string;
	input?: Input;
	select?: Select;
	icon?: string;
	actions?: {
		text: string;
		primary?: boolean,
		danger?: boolean,
		callback: (...args: unknown[]) => void;
	}[];
	showOkButton?: boolean;
	showCancelButton?: boolean;
	cancelableByBgClick?: boolean;
	okText?: string;
	cancelText?: string;
}>(), {
	type: 'info',
	showOkButton: true,
	showCancelButton: false,
	cancelableByBgClick: true,
});

const emit = defineEmits<{
	(ev: 'done', v: MkDialogReturnType): void;
	(ev: 'closed'): void;
}>();

const modal = useTemplateRef('modal');

const titleId = useId();
const textId = useId();

const inputValue = ref<string | number | null>(props.input?.default ?? null);

const okButtonDisabledReason = computed<null | 'charactersExceeded' | 'charactersBelow'>(() => {
	if (props.input) {
		if (props.input.minLength) {
			if (inputValue.value == null || (inputValue.value as string).length < props.input.minLength) {
				return 'charactersBelow';
			}
		}
		if (props.input.maxLength) {
			if (inputValue.value && (inputValue.value as string).length > props.input.maxLength) {
				return 'charactersExceeded';
			}
		}
	}

	return null;
});

const {
	def: selectDef,
	model: selectedValue,
} = useMkSelect({
	items: computed(() => props.select?.items ?? []),
	initialValue: props.select?.default ?? null,
});

// overload function を使いたいので lint エラーを無視する
function done(canceled: true): void;
function done(canceled: false, result: Result): void;

function done(canceled: boolean, result?: Result): void {
	emit('done', { canceled, result } as MkDialogReturnType);
	modal.value?.close();
}

async function ok() {
	if (!props.showOkButton) return;

	const result =
		props.input ? inputValue.value :
		props.select ? selectedValue.value :
		true;
	done(false, result);
}

function cancel() {
	done(true);
}

function onBgClick() {
	if (props.cancelableByBgClick) cancel();
}

function onInputKeydown(evt: KeyboardEvent) {
	if (evt.key === 'Enter' && okButtonDisabledReason.value === null) {
		evt.preventDefault();
		evt.stopPropagation();
		ok();
	}
}
</script>

<style lang="scss" module>
.root {
	position: relative;
	margin: auto;
	padding: var(--MI-space-3xl);
	min-width: 320px;
	max-width: 480px;
	box-sizing: border-box;
	text-align: center;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
}

.icon {
	font-size: 24px;

	& + .title {
		margin-top: var(--MI-space-sm);
	}
}

.iconInner {
	display: block;
	margin: 0 auto;
}

.systemIcon {
	width: 45px;
}

.title {
	margin: 0 0 var(--MI-space-sm) 0;
	font-weight: bold;
	font-size: 1.1em;

	& + .text {
		margin-top: var(--MI-space-sm);
	}
}

.text {
	margin: var(--MI-space-lg) 0 0 0;
}

.buttons {
	margin-top: var(--MI-space-lg);
	display: flex;
	gap: var(--MI-space-sm);
	flex-wrap: wrap;
	justify-content: center;
}
</style>
