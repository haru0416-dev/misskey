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

const slots =
	defineSlots<T extends ParameterizedString<infer R> ? { [K in R]: () => unknown } : NonNullable<unknown>>();

const parsed = computed(() => splitI18nSlotTemplate(props.src as string));

const render = () => {
	return h(
		props.tag,
		parsed.value.map((x) =>
			typeof x === 'string' ? (props.textTag ? h(props.textTag, x) : x) : (slots as any)[x.arg](),
		),
	);
};
</script>
