<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialogEl"
	:width="500"
	:height="500"
	@close="dialogEl?.close()"
	@closed="emit('closed')"
>
	<template #header>{{ i18n.ts.serverRules }}</template>

	<div class="_spacer">
		<ol class="_gaps_s" :class="$style.rules">
			<li v-for="item in instance.serverRules" :key="item" :class="$style.rule">
				<div :class="$style.ruleText" v-html="item"></div>
			</li>
		</ol>
	</div>
</MkModalWindow>
</template>

<script lang="ts" setup>
import { useTemplateRef } from 'vue';
import MkModalWindow from '@/components/overlay/MkModalWindow.vue';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const dialogEl = useTemplateRef('dialogEl');
</script>

<style lang="scss" module>
.rules {
	counter-reset: rules;
	list-style: none;
	margin: 0;
	padding: 0;
}

.rule {
	display: flex;
	gap: 8px;

	&::before {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		position: sticky;
		top: 0;
		counter-increment: rules;
		content: counter(rules);
		width: 32px;
		height: 32px;
		line-height: 32px;
		font-size: 13px;
		font-weight: bold;
		color: var(--MI_THEME-accent);
		background-color: color(from var(--MI_THEME-accent) srgb r g b / 0.15);
		border-radius: 50%;
	}
}

.ruleText {
	padding-top: 6px;
}
</style>
