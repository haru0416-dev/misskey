<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" data-cy-mkw-memo class="mkw-memo">
	<template #icon><i class="ti ti-note"></i></template>
	<template #header>{{ widgetProps.title || i18n.ts._widgets.memo }}</template>
	<template #func="{ buttonStyleClass }"><button v-tooltip="i18n.ts.settings" class="_button" :class="buttonStyleClass" :aria-label="i18n.ts.settings" @click="configure"><i class="ti ti-settings"></i></button></template>

	<div :class="$style.root">
		<textarea v-model="text" :style="`height: ${widgetProps.height}px;`" :class="$style.textarea" :placeholder="i18n.ts.memo" @input="onChange"></textarea>
		<button :class="$style.save" :disabled="!changed" class="_buttonPrimary" @click="saveMemo">{{ i18n.ts.save }}</button>
	</div>
</MkContainer>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentEmits, WidgetComponentExpose, WidgetComponentProps } from './widget.js';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import MkContainer from '@/components/layout/MkContainer.vue';
import { store } from '@/store.js';
import { i18n } from '@/i18n.js';
import { miLocalStorage } from '@/local-storage.js';
import { $i } from '@/i.js';

const name = 'memo';

const widgetPropsDef = {
	title: {
		type: 'string',
		label: i18n.ts.title,
		default: '',
	},
	text: {
		type: 'string',
		label: i18n.ts.memo,
		default: '',
		multiline: true,
		hidden: true,
	},
	showHeader: {
		type: 'boolean',
		label: i18n.ts._widgetOptions.showHeader,
		default: true,
	},
	height: {
		type: 'number',
		label: i18n.ts.height,
		default: 100,
	},
} satisfies FormWithDefault;

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, save, configure } = useWidgetPropsManager(name,
	widgetPropsDef,
	props,
	emit,
);

const migrationKey = `memoWidgetMigrationCompleted:${$i?.id ?? 'guest'}` as const;
const shouldMigrateLegacyMemo = props.widget?.id !== '__PREVIEW__'
	&& props.widget != null
	&& props.widget.data.text === undefined
	&& miLocalStorage.getItem(migrationKey) !== 'true';
if (shouldMigrateLegacyMemo) {
	widgetProps.text = store.memo ?? '';
	miLocalStorage.setItem(migrationKey, 'true');
	save();
}

const text = ref(widgetProps.text);
const changed = ref(false);
let timeoutId: number | null = null;

const saveMemo = () => {
	widgetProps.text = text.value;
	save();
	changed.value = false;
};

const onChange = () => {
	changed.value = true;
	if (timeoutId != null) window.clearTimeout(timeoutId);
	timeoutId = window.setTimeout(saveMemo, 1000);
};

watch(() => widgetProps.text, newText => {
	text.value = newText;
});

onBeforeUnmount(() => {
	if (timeoutId != null) window.clearTimeout(timeoutId);
	if (changed.value) saveMemo();
});

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>

<style lang="scss" module>
.root {
	padding-bottom: 28px + 16px;
}

.textarea {
	display: block;
	width: 100%;
	max-width: 100%;
	min-width: 100%;
	padding: 16px;
	color: var(--MI_THEME-fg);
	background: transparent;
	border: none;
	border-bottom: solid 0.5px var(--MI_THEME-divider);
	border-radius: 0;
	box-sizing: border-box;
	font: inherit;
	font-size: 0.9em;

	&:focus-visible {
		outline: 2px solid var(--MI_THEME-focus);
		outline-offset: -2px;
	}
}

.save {
	display: block;
	position: absolute;
	bottom: 8px;
	right: 8px;
	margin: 0;
	padding: 0 10px;
	height: 28px;
	outline: none;
	border-radius: 4px;

	&:disabled {
		opacity: 0.7;
		cursor: default;
	}
}
</style>
