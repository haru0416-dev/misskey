<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div v-for="v, k in paramDefs" :key="k">
		<MkSwitch
			v-if="v.type === 'boolean'"
			v-model="params[k]"
		>
			<template #label>{{ v.label ?? k }}</template>
			<template v-if="v.caption != null" #caption>{{ v.caption }}</template>
		</MkSwitch>
		<MkRange
			v-else-if="v.type === 'number'"
			v-model="params[k]"
			continuousUpdate
			:min="v.min"
			:max="v.max"
			v-bind="{ ...(v.step === undefined ? {} : { step: v.step }), ...(v.toViewValue === undefined ? {} : { textConverter: v.toViewValue }) }"
			@thumbDoubleClicked="() => {
				params[k] = v.default;
			}"
		>
			<template #label>{{ v.label ?? k }}</template>
			<template v-if="v.caption != null" #caption>{{ v.caption }}</template>
		</MkRange>
		<MkRadios v-else-if="v.type === 'number:enum'" v-model="params[k]" :options="v.enum">
			<template #label>{{ v.label ?? k }}</template>
			<template v-if="v.caption != null" #caption>{{ v.caption }}</template>
		</MkRadios>
		<div v-else-if="v.type === 'seed'">
			<MkRange v-model="params[k]" continuousUpdate type="number" :min="0" :max="10000" :step="1">
				<template #label>{{ v.label ?? k }}</template>
				<template v-if="v.caption != null" #caption>{{ v.caption }}</template>
			</MkRange>
		</div>
		<MkInput v-else-if="v.type === 'color'" :modelValue="rgbToHex(params[k])" type="color" @update:modelValue="v => { const c = hexToRgb(v); if (c != null) params[k] = c; }">
			<template #label>{{ v.label ?? k }}</template>
			<template v-if="v.caption != null" #caption>{{ v.caption }}</template>
		</MkInput>
	</div>
	<div v-if="Object.keys(paramDefs).length === 0" :class="$style.nothingToConfigure">
		{{ i18n.ts.nothingToConfigure }}
	</div>
</div>
</template>

<script setup lang="ts">
import type { ImageEffectorFxParamDefs } from '@/features/image-editor/effect/ImageEffector.js';
import MkInput from '@/components/form/MkInput.vue';
import MkRadios from '@/components/form/MkRadios.vue';
import MkSwitch from '@/components/form/MkSwitch.vue';
import MkRange from '@/components/form/MkRange.vue';
import { i18n } from '@/i18n.js';
import { hexToRgb, rgbToHex } from '@/features/image-editor/color.js';

defineProps<{
	paramDefs: ImageEffectorFxParamDefs;
}>();

const params = defineModel<Record<string, any>>({ required: true });

</script>

<style module>
.nothingToConfigure {
	opacity: 0.7;
	text-align: center;
	font-size: 14px;
	padding: 0 10px;
}
</style>
