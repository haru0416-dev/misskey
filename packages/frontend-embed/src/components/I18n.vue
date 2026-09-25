<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<render/>
</template>

<script setup lang="ts" generic="T extends string | ParameterizedString">
import { computed, h } from 'vue';
import type { ParameterizedString } from 'i18n';
import { splitI18nSlotTemplate } from '@shared/utility/i18n-slot-template.js';
import type { VNodeChild } from 'vue';

const props = withDefaults(
	defineProps<{
		src: T;
		tag?: string;
		textTag?: string;
	}>(),
	{
		tag: 'span',
	},
);

const slots = defineSlots<Record<string, () => unknown>>();

const parsed = computed(() => splitI18nSlotTemplate(props.src as string));

const render = () => {
	const children: VNodeChild[] = parsed.value.map((x): VNodeChild => {
		if (typeof x === 'string') {
			return props.textTag ? h(props.textTag, x) : x;
		}
		return slots[x.arg]?.() as VNodeChild;
	});
	return h(props.tag, {}, children);
};
</script>
