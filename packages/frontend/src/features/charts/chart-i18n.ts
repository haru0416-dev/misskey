/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';

type ChartLocaleKey =
	| 'peak'
	| 'series'
	| 'noData'
	| 'read'
	| 'write'
	| 'completed'
	| 'failed'
	| 'process'
	| 'active'
	| 'delayed'
	| 'waiting'
	| 'incoming'
	| 'outgoing'
	| 'outgoingSucceeded'
	| 'outgoingFailed'
	| 'retention'
	| 'startDate';

const fallback: Record<ChartLocaleKey, string> = {
	peak: 'Peak',
	series: 'Visible series',
	noData: 'No data for this period',
	read: 'Read',
	write: 'Write',
	completed: 'Completed',
	failed: 'Failed',
	process: 'Processed',
	active: 'Active',
	delayed: 'Delayed',
	waiting: 'Waiting',
	incoming: 'Incoming',
	outgoing: 'Outgoing',
	outgoingSucceeded: 'Outgoing: succeeded',
	outgoingFailed: 'Outgoing: failed',
	retention: 'Retention rate',
	startDate: 'Start date',
};

export function chartText(key: ChartLocaleKey): string {
	const chartLocale = (i18n.locale as unknown as { _chart?: Partial<Record<ChartLocaleKey, unknown>> })._chart;
	const value = chartLocale?.[key];
	return typeof value === 'string' ? value : fallback[key];
}
