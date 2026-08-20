<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div>
	<div v-if="c.type === 'root'" :class="$style.root">
		<template v-for="child in c.children" :key="child">
			<MkAsUi v-if="!g(child).hidden" :component="g(child)" :components="props.components" :size="size"/>
		</template>
	</div>
	<span v-else-if="c.type === 'text'" :class="{ [$style.fontSerif]: c.font === 'serif', [$style.fontMonospace]: c.font === 'monospace' }" :style="{ fontSize: c.size ? `${c.size * 100}%` : undefined, fontWeight: c.bold ? 'bold' : undefined, color: c.color }">{{ c.text }}</span>
	<Mfm v-else-if="c.type === 'mfm'" :class="{ [$style.fontSerif]: c.font === 'serif', [$style.fontMonospace]: c.font === 'monospace' }" :style="{ fontSize: c.size ? `${c.size * 100}%` : null, fontWeight: c.bold ? 'bold' : null, color: c.color ?? null }" :text="c.text ?? ''" @clickEv="c.onClickEv"/>
	<MkButton v-else-if="c.type === 'button'" v-bind="getButtonProps(c)" :small="size === 'small'" inline @click="c.onClick">{{ c.text }}</MkButton>
	<div v-else-if="c.type === 'buttons'" class="_buttons" :style="{ justifyContent: align }">
		<MkButton v-for="button in c.buttons" v-bind="getButtonProps(button)" inline :small="size === 'small'" @click="button.onClick">{{ button.text }}</MkButton>
	</div>
	<MkSwitch v-else-if="c.type === 'switch'" :modelValue="valueForSwitch" @update:modelValue="onSwitchUpdate">
		<template v-if="c.label" #label>{{ c.label }}</template>
		<template v-if="c.caption" #caption>{{ c.caption }}</template>
	</MkSwitch>
	<MkTextarea v-else-if="c.type === 'textarea'" :modelValue="c.default ?? null" @update:modelValue="c.onInput">
		<template v-if="c.label" #label>{{ c.label }}</template>
		<template v-if="c.caption" #caption>{{ c.caption }}</template>
	</MkTextarea>
	<MkInput v-else-if="c.type === 'textInput'" :small="size === 'small'" :modelValue="c.default ?? null" @update:modelValue="c.onInput">
		<template v-if="c.label" #label>{{ c.label }}</template>
		<template v-if="c.caption" #caption>{{ c.caption }}</template>
	</MkInput>
	<MkInput v-else-if="c.type === 'numberInput'" :small="size === 'small'" :modelValue="c.default ?? null" type="number" @update:modelValue="c.onInput">
		<template v-if="c.label" #label>{{ c.label }}</template>
		<template v-if="c.caption" #caption>{{ c.caption }}</template>
	</MkInput>
	<MkSelect v-else-if="c.type === 'select'" :small="size === 'small'" :modelValue="valueForSelect" :items="selectDef" @update:modelValue="onSelectUpdate">
		<template v-if="c.label" #label>{{ c.label }}</template>
		<template v-if="c.caption" #caption>{{ c.caption }}</template>
	</MkSelect>
	<MkButton v-else-if="c.type === 'postFormButton'" v-bind="getButtonProps(c)" :small="size === 'small'" inline @click="openPostForm">{{ c.text }}</MkButton>
	<div v-else-if="c.type === 'postForm'" :class="$style.postForm">
		<MkPostForm
			v-bind="embeddedPostFormProps"
		/>
	</div>
	<MkFolder v-else-if="c.type === 'folder'" v-bind="c.opened === undefined ? {} : { defaultOpen: c.opened }">
		<template #label>{{ c.title }}</template>
		<template v-for="child in c.children" :key="child">
			<MkAsUi v-if="!g(child).hidden" :component="g(child)" :components="props.components" :size="size"/>
		</template>
	</MkFolder>
	<div v-else-if="c.type === 'container'" :class="[$style.container, { [$style.fontSerif]: c.font === 'serif', [$style.fontMonospace]: c.font === 'monospace' }]" :style="containerStyle">
		<template v-for="child in c.children" :key="child">
			<MkAsUi v-if="!g(child).hidden" v-bind="c.align === undefined ? {} : { align: c.align }" :component="g(child)" :components="props.components" :size="size"/>
		</template>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import type { Ref } from 'vue';
import type { AsUiButton, AsUiComponent, AsUiRoot, AsUiPostFormButton } from '@/aiscript/ui.js';
import * as os from '@/os.js';
import MkButton from '@/components/form/MkButton.vue';
import MkInput from '@/components/form/MkInput.vue';
import MkSwitch from '@/components/form/MkSwitch.vue';
import MkTextarea from '@/components/form/MkTextarea.vue';
import MkSelect from '@/components/form/MkSelect.vue';
import MkFolder from '@/components/layout/MkFolder.vue';
import MkPostForm from '@/features/post-composer/components/MkPostForm.vue';
import { useMkSelect } from '@/composables/useMkSelect.js';

const props = withDefaults(defineProps<{
	component: AsUiComponent;
	components: Ref<AsUiComponent>[];
	size?: 'small' | 'medium' | 'large';
	align?: 'left' | 'center' | 'right';
}>(), {
	size: 'medium',
	align: 'left',
});

const c = props.component;

const embeddedPostFormProps = computed(() => {
	if (c.type !== 'postForm') return {};

	return {
		fixed: true,
		instant: true,
		...(c.form?.text === undefined ? {} : { initialText: c.form.text }),
		...(c.form?.cw === undefined ? {} : { initialCw: c.form.cw }),
		...(c.form?.visibility === undefined ? {} : { initialVisibility: c.form.visibility }),
		...(c.form?.localOnly === undefined ? {} : { initialLocalOnly: c.form.localOnly }),
	};
});

function getButtonProps(button: AsUiButton | AsUiPostFormButton) {
	return {
		...(button.primary === undefined ? {} : { primary: button.primary }),
		...(button.rounded === undefined ? {} : { rounded: button.rounded }),
		...('disabled' in button && button.disabled !== undefined ? { disabled: button.disabled } : {}),
	};
}

function g(id: string) {
	const v = props.components.find(x => x.value.id === id)?.value;
	if (v) return v;

	return {
		id: 'dummy',
		type: 'root',
		children: [],
	} as AsUiRoot;
}

const containerStyle = computed(() => {
	if (c.type !== 'container') return undefined;

	// 枠線の一部だけ指定された場合も、ブラウザの初期値に依存せず表示できるようにする。
	// radius単独の指定は枠線を必要としないため判定対象から除外する。
	const isBordered = c.borderWidth ?? c.borderColor ?? c.borderStyle;

	const border = isBordered ? {
		borderWidth: `${c.borderWidth ?? 1}px`,
		borderColor: c.borderColor ?? 'var(--MI_THEME-divider)',
		borderStyle: c.borderStyle ?? 'solid',
	} : undefined;

	return {
		textAlign: c.align,
		backgroundColor: c.bgColor,
		color: c.fgColor,
		padding: c.padding ? `${c.padding}px` : 0,
		borderRadius: (c.borderRadius ?? (c.rounded ? 8 : 0)) + 'px',
		...border,
	};
});

const valueForSwitch = ref('default' in c && typeof c.default === 'boolean' ? c.default : false);

function onSwitchUpdate(v: boolean) {
	valueForSwitch.value = v;
	if ('onChange' in c && c.onChange) {
		c.onChange(v as never);
	}
}

const {
	model: valueForSelect,
	def: selectDef,
} = useMkSelect({
	items: computed(() => {
		if (c.type !== 'select') return [];
		return (c.items ?? []).map(item => ({
			value: item.value,
			label: item.text,
		}));
	}),
	initialValue: (c.type === 'select' && 'default' in c && typeof c.default !== 'boolean') ? c.default ?? null : null,
});

function onSelectUpdate(v: string | null) {
	valueForSelect.value = v;
	if ('onChange' in c && c.onChange) {
		c.onChange(v as never);
	}
}

function openPostForm() {
	const form = (c as AsUiPostFormButton).form;
	if (!form) return;

	os.post({
		initialText: form.text,
		...(form.cw === undefined ? {} : { initialCw: form.cw }),
		...(form.visibility === undefined ? {} : { initialVisibility: form.visibility }),
		...(form.localOnly === undefined ? {} : { initialLocalOnly: form.localOnly }),
		instant: true,
	});
}
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.container {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.fontSerif {
	font-family: serif;
}

.fontMonospace {
	font-family: Fira code, Fira Mono, Consolas, Menlo, Courier, monospace;
}

.postForm {
	background: var(--MI_THEME-bg);
	border-radius: 8px;
}
</style>
