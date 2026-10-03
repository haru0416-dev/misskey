<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<time :title="absolute" :class="{ [$style.old1]: colored && (ago > 60 * 60 * 24 * 90), [$style.old2]: colored && (ago > 60 * 60 * 24 * 180) }">
	<template v-if="invalid">{{ i18n.ts._ago.invalid }}</template>
	<template v-else-if="mode === 'relative'">{{ relative }}</template>
	<template v-else-if="mode === 'absolute'">{{ absolute }}</template>
	<template v-else-if="mode === 'detail'">{{ absolute }} ({{ relative }})</template>
</time>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { i18n } from '@/i18n.js';
import { dateTimeFormat } from '@/shared/utility/intl-const.js';
import { toTimeMs } from '@/shared/utility/time-input.js';
import { useLowresTime } from '@/composables/useLowresTime.js';

const props = withDefaults(
	defineProps<{
		time: Date | string | number | null;
		origin?: Date | null;
		mode?: 'relative' | 'absolute' | 'detail';
		colored?: boolean;
	}>(),
	{
		origin: null,
		mode: 'relative',
	},
);

const _time = toTimeMs(props.time);
const invalid = Number.isNaN(_time);
const absolute = !invalid ? dateTimeFormat.format(_time) : i18n.ts._ago.invalid;

const actualNow = useLowresTime();
const now = computed(() => (props.origin ? props.origin.getTime() : actualNow.value));

const ago = computed(() => (now.value - _time) / 1000 /*ms*/);

const relative = computed<string>(() => {
	if (props.mode === 'absolute') {
		return '';
	}
	if (invalid) {
		return i18n.ts._ago.invalid;
	}

	if (ago.value >= 31_536_000) {
		return i18n.tsx._ago.yearsAgo({ n: Math.round(ago.value / 31_536_000).toString() });
	}
	if (ago.value >= 2_592_000) {
		return i18n.tsx._ago.monthsAgo({ n: Math.round(ago.value / 2_592_000).toString() });
	}
	if (ago.value >= 604_800) {
		return i18n.tsx._ago.weeksAgo({ n: Math.round(ago.value / 604_800).toString() });
	}
	if (ago.value >= 86_400) {
		return i18n.tsx._ago.daysAgo({ n: Math.round(ago.value / 86_400).toString() });
	}
	if (ago.value >= 3600) {
		return i18n.tsx._ago.hoursAgo({ n: Math.round(ago.value / 3600).toString() });
	}
	if (ago.value >= 60) {
		return i18n.tsx._ago.minutesAgo({ n: (~~(ago.value / 60)).toString() });
	}
	if (ago.value >= 10) {
		return i18n.tsx._ago.secondsAgo({ n: (~~(ago.value % 60)).toString() });
	}
	if (ago.value >= -3) {
		return i18n.ts._ago.justNow;
	}
	if (ago.value < -31_536_000) {
		return i18n.tsx._timeIn.years({ n: Math.round(-ago.value / 31_536_000).toString() });
	}
	if (ago.value < -2_592_000) {
		return i18n.tsx._timeIn.months({ n: Math.round(-ago.value / 2_592_000).toString() });
	}
	if (ago.value < -604_800) {
		return i18n.tsx._timeIn.weeks({ n: Math.round(-ago.value / 604_800).toString() });
	}
	if (ago.value < -86_400) {
		return i18n.tsx._timeIn.days({ n: Math.round(-ago.value / 86_400).toString() });
	}
	if (ago.value < -3600) {
		return i18n.tsx._timeIn.hours({ n: Math.round(-ago.value / 3600).toString() });
	}
	if (ago.value < -60) {
		return i18n.tsx._timeIn.minutes({ n: (~~(-ago.value / 60)).toString() });
	}
	return i18n.tsx._timeIn.seconds({ n: (~~(-ago.value % 60)).toString() });
});
</script>

<style lang="scss" module>
.old1 {
	color: var(--MI_THEME-warn);
}

.old1.old2 {
	color: var(--MI_THEME-error);
}
</style>
