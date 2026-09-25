/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed } from 'vue';
import type { EnumFormItem } from '@/utility/form.js';
import { timezones } from '@/utility/timezones.js';
import { i18n } from '@/i18n.js';

// 値は timezones の name を小文字化したもの。null はブラウザのタイムゾーンに従う。
export const clockTimezonePropDef = {
	type: 'enum',
	label: i18n.ts._widgetOptions._clock.timezone,
	default: null,
	enum: [
		...timezones.map((tz) => ({
			label: tz.name,
			value: tz.name.toLowerCase(),
		})),
		{
			label: i18n.ts.auto,
			value: null,
		},
	],
} satisfies EnumFormItem;

export function useClockTimezone(timezone: () => string | null) {
	const tzAbbrev = computed(
		() =>
			(timezone() === null
				? timezones.find(
						(tz) => tz.name.toLowerCase() === Intl.DateTimeFormat().resolvedOptions().timeZone.toLowerCase(),
					)?.abbrev
				: timezones.find((tz) => tz.name.toLowerCase() === timezone())?.abbrev) ?? '?',
	);

	const tzOffset = computed(() =>
		timezone() === null
			? 0 - new Date().getTimezoneOffset()
			: (timezones.find((tz) => tz.name.toLowerCase() === timezone())?.offset ?? 0),
	);

	const tzOffsetLabel = computed(
		() =>
			(tzOffset.value >= 0 ? '+' : '-') +
			Math.floor(tzOffset.value / 60)
				.toString()
				.padStart(2, '0') +
			':' +
			(tzOffset.value % 60).toString().padStart(2, '0'),
	);

	return { tzAbbrev, tzOffset, tzOffsetLabel };
}
