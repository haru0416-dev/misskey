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
import type { VNodeChild } from 'vue';

const props = withDefaults(defineProps<{
	src: T;
	tag?: string;
	textTag?: string;
}>(), {
	tag: 'span',
});

const slots = defineSlots<Record<string, () => unknown>>();

const parsed = computed(() => {
	let str = props.src as string;
	const value: (string | { arg: string; })[] = [];
	for (; ;) {
		const nextBracketOpen = str.indexOf('{');
		const nextBracketClose = str.indexOf('}');

		if (nextBracketOpen === -1) {
			value.push(str);
			break;
		} else {
			if (nextBracketOpen > 0) value.push(str.substring(0, nextBracketOpen));
			value.push({
				arg: str.substring(nextBracketOpen + 1, nextBracketClose),
			});
		}

		str = str.substring(nextBracketClose + 1);
	}

	return value;
});

const render = () => {
	const children: VNodeChild[] = parsed.value.map((x): VNodeChild => {
		if (typeof x === 'string') return props.textTag ? h(props.textTag, x) : x;
		return slots[x.arg]?.() as VNodeChild;
	});
	return h(props.tag, {}, children);
};
</script>
