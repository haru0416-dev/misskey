<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="Object.values(form).filter(item => typeof item.hidden !== 'boolean' || item.hidden === true).length > 0" class="_gaps_m">
	<template v-for="v, k in form">
		<template v-if="typeof v.hidden == 'function' ? v.hidden(values) : v.hidden"></template>
		<MkInput v-else-if="v.type === 'number'" v-model="values[k]" v-bind="v.manualSave === undefined ? {} : { manualSave: v.manualSave }" type="number" :step="v.step || 1" @savingStateChange="(changed, invalid) => onSavingStateChange(k, changed, invalid)">
			<template #label><span v-text="v.label || k"></span><span v-if="v.required === false"> ({{ i18n.ts.optional }})</span></template>
			<template v-if="v.description" #caption>{{ v.description }}</template>
		</MkInput>
		<MkInput v-else-if="v.type === 'string' && !v.multiline" v-model="values[k]" v-bind="{ ...(v.treatAsMfm === undefined ? {} : { mfmAutocomplete: v.treatAsMfm }), ...(v.manualSave === undefined ? {} : { manualSave: v.manualSave }) }" type="text" @savingStateChange="(changed, invalid) => onSavingStateChange(k, changed, invalid)">
			<template #label><span v-text="v.label || k"></span><span v-if="v.required === false"> ({{ i18n.ts.optional }})</span></template>
			<template v-if="v.description" #caption>{{ v.description }}</template>
		</MkInput>
		<MkTextarea v-else-if="v.type === 'string' && v.multiline" v-model="values[k]" v-bind="{ ...(v.treatAsMfm === undefined ? {} : { mfmAutocomplete: v.treatAsMfm, mfmPreview: v.treatAsMfm }), ...(v.manualSave === undefined ? {} : { manualSave: v.manualSave }) }" @savingStateChange="(changed, invalid) => onSavingStateChange(k, changed, invalid)">
			<template #label><span v-text="v.label || k"></span><span v-if="v.required === false"> ({{ i18n.ts.optional }})</span></template>
			<template v-if="v.description" #caption>{{ v.description }}</template>
		</MkTextarea>
		<MkSwitch v-else-if="v.type === 'boolean'" v-model="values[k]">
			<span v-text="v.label || k"></span>
			<template v-if="v.description" #caption>{{ v.description }}</template>
		</MkSwitch>
		<MkSelect v-else-if="v.type === 'enum'" v-model="values[k]" :items="getMkSelectDef(v)">
			<template #label><span v-text="v.label || k"></span><span v-if="v.required === false"> ({{ i18n.ts.optional }})</span></template>
		</MkSelect>
		<MkRadios v-else-if="v.type === 'radio'" v-model="values[k]" :options="getRadioOptionsDef(v)">
			<template #label><span v-text="v.label || k"></span><span v-if="v.required === false"> ({{ i18n.ts.optional }})</span></template>
		</MkRadios>
		<MkRange v-else-if="v.type === 'range'" v-model="values[k]" v-bind="{ ...(v.step === undefined ? {} : { step: v.step }), ...(v.textConverter === undefined ? {} : { textConverter: v.textConverter }) }" :min="v.min" :max="v.max">
			<template #label><span v-text="v.label || k"></span><span v-if="v.required === false"> ({{ i18n.ts.optional }})</span></template>
			<template v-if="v.description" #caption>{{ v.description }}</template>
		</MkRange>
		<MkButton v-else-if="v.type === 'button'" @click="v.action($event, values)">
			<span v-text="v.content || k"></span>
		</MkButton>
		<XFile
			v-else-if="v.type === 'drive-file'"
			:fileId="v.defaultFileId ?? null"
			:validate="async f => !v.validate || await v.validate(f)"
			@update="f => values[k] = f"
		/>
	</template>
</div>
<MkResult v-else type="empty" :text="i18n.ts.nothingToConfigure"/>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import XFile from '@/features/dynamic-form/components/MkForm.File.vue';
import MkInput from '@/components/form/MkInput.vue';
import MkTextarea from '@/components/form/MkTextarea.vue';
import MkSwitch from '@/components/form/MkSwitch.vue';
import MkSelect from '@/components/form/MkSelect.vue';
import MkRange from '@/components/form/MkRange.vue';
import MkButton from '@/components/form/MkButton.vue';
import MkRadios from '@/components/form/MkRadios.vue';
import { i18n } from '@/i18n.js';
import type { MkSelectItem } from '@/components/form/MkSelect.vue';
import type { MkRadiosOption } from '@/components/form/MkRadios.vue';
import type { Form, EnumFormItem, RadioFormItem } from '@/utility/form.js';

const props = defineProps<{
	form: Form;
}>();

const emit = defineEmits<{
	(ev: 'canSaveStateChange', canSave: boolean): void;
}>();

const values = defineModel<Record<string, any>>({ required: true });

// 保存可能状態の管理
const inputSavingStates = ref<Record<string, { changed: boolean; invalid: boolean }>>({});

function onSavingStateChange(key: string, changed: boolean, invalid: boolean) {
	inputSavingStates.value[key] = { changed, invalid };
}

const canSave = computed(() => {
	for (const key in inputSavingStates.value) {
		const state = inputSavingStates.value[key];
		const formItem = props.form[key];
		if (state == null || formItem == null) continue;
		if (
			('manualSave' in formItem && formItem.manualSave && state.changed) ||
			state.invalid
	 	) {
			return false;
		}
		if ('required' in formItem && formItem.required) {
			const val = values.value[key];
			if (val === null || val === undefined || val === '') {
				return false;
			}
		}
	}
	return true;
});

watch(canSave, (newCanSave) => {
	emit('canSaveStateChange', newCanSave);
}, { immediate: true });

function getMkSelectDef(def: EnumFormItem): MkSelectItem[] {
	return def.enum.map((v) => {
		if (typeof v === 'string') {
			return { value: v, label: v };
		} else {
			return { value: v.value, label: v.label };
		}
	});
}

function getRadioOptionsDef(def: RadioFormItem): MkRadiosOption[] {
	return def.options.map<MkRadiosOption>((v) => {
		if (typeof v === 'string') {
			return { value: v, label: v };
		} else {
			return { value: v.value, label: v.label };
		}
	});
}
</script>
