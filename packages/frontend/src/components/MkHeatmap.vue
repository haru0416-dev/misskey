<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl">
	<MkLoading v-if="fetching"/>
	<div v-else-if="cells.length === 0" :class="$style.empty">{{ chartText('noData') }}</div>
	<div v-else :class="$style.scroller">
		<div :class="$style.grid" :style="{ '--weeks': weeks }">
			<div
				v-for="cell in cells"
				:key="cell.date"
				:class="$style.cell"
				:style="{ '--level': cell.level }"
				:title="`${cell.date}: ${cell.value}`"
				:aria-label="`${cell.date}: ${cell.value}`"
				tabindex="0"
			></div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { nextTick, onMounted, ref, useTemplateRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { chartText } from '@/utility/chart-i18n.js';

export type HeatmapSource = 'active-users' | 'notes' | 'ap-requests-inbox-received' | 'ap-requests-deliver-succeeded' | 'ap-requests-deliver-failed';
const props = withDefaults(defineProps<{ src: HeatmapSource; user?: Misskey.entities.User; label?: string }>(), { user: undefined, label: '' });
const rootEl = useTemplateRef('rootEl');
const fetching = ref(true);
const weeks = ref(25);
const cells = ref<{ date: string; value: number; level: number }[]>([]);

async function load() {
	fetching.value = true;
	await nextTick();
	const width = rootEl.value?.offsetWidth ?? 600;
	weeks.value = width > 700 ? 50 : width < 400 ? 10 : 25;
	const limit = weeks.value * 7;
	let values: number[] = [];
	if (props.src === 'active-users') values = (await misskeyApi('charts/active-users', { limit, span: 'day' })).readWrite;
	else if (props.src === 'notes') values = props.user ? (await misskeyApi('charts/user/notes', { userId: props.user.id, limit, span: 'day' })).inc : (await misskeyApi('charts/notes', { limit, span: 'day' })).local.inc;
	else {
		const raw = await misskeyApi('charts/ap-request', { limit, span: 'day' });
		values = props.src === 'ap-requests-inbox-received' ? raw.inboxReceived : props.src === 'ap-requests-deliver-succeeded' ? raw.deliverSucceeded : raw.deliverFailed;
	}
	const max = values.slice().sort((a, b) => b - a).slice(0, 3).reduce((sum, value) => sum + value, 0) / 3 || 1;
	const today = new Date();
	cells.value = values.map((value, ago) => {
		const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ago);
		return { date: date.toLocaleDateString(), value, level: value === 0 ? 0 : Math.max(0.12, Math.min(1, value / max)) };
	}).reverse();
	fetching.value = false;
}
watch(() => [props.src, props.user?.id], load);
onMounted(load);
</script>

<style lang="scss" module>
.scroller { overflow-x: auto; padding: 4px; }
.grid { display: grid; grid-auto-flow: column; grid-template-rows: repeat(7, 12px); grid-auto-columns: 12px; gap: 4px; min-width: calc(var(--weeks) * 16px); width: max-content; }
.cell { border-radius: 3px; background: color-mix(in srgb, var(--MI_THEME-accent) calc(var(--level) * 100%), var(--MI_THEME-panel)); outline-offset: 2px; }
.cell:focus-visible { outline: 2px solid var(--MI_THEME-accent); }
.empty { min-height: 120px; display: grid; place-items: center; color: var(--MI_THEME-fg); opacity: 0.65; }
</style>
