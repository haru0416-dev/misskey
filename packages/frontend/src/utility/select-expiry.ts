/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as os from '@/os.js';
import { i18n } from '@/i18n.js';

const PERIOD_MS = {
	tenMinutes: 1000 * 60 * 10,
	oneHour: 1000 * 60 * 60,
	oneDay: 1000 * 60 * 60 * 24,
	oneWeek: 1000 * 60 * 60 * 24 * 7,
	oneMonth: 1000 * 60 * 60 * 24 * 30,
} as const;

type ExpiryPeriod = keyof typeof PERIOD_MS;

// 無期限を先頭・既定にした期間選択を出す。expiresAt が null のときは無期限。
export async function selectExpiry(
	title: string,
	periods: readonly ExpiryPeriod[],
): Promise<{ canceled: true } | { canceled: false; expiresAt: number | null }> {
	// ロケールのインライン化は i18n.ts への動的なキー参照を扱えないため、キーを静的に書く。
	const periodLabels: Record<ExpiryPeriod, string> = {
		tenMinutes: i18n.ts.tenMinutes,
		oneHour: i18n.ts.oneHour,
		oneDay: i18n.ts.oneDay,
		oneWeek: i18n.ts.oneWeek,
		oneMonth: i18n.ts.oneMonth,
	};

	const { canceled, result: period } = await os.select({
		title,
		items: [
			{ value: 'indefinitely' as const, label: i18n.ts.indefinitely },
			...periods.map((p) => ({ value: p, label: periodLabels[p] })),
		],
		default: 'indefinitely',
	});
	if (canceled) {
		return { canceled: true };
	}

	return {
		canceled: false,
		expiresAt: period == null || period === 'indefinitely' ? null : Date.now() + PERIOD_MS[period],
	};
}
