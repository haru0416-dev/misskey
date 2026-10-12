/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';

type ChartLocaleKey =
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
	| 'retentionDescription'
	| 'signupDate'
	| 'signups'
	| 'daysAfter';

const fallback: Record<ChartLocaleKey, string> = {
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
	retentionDescription: 'Share of users who signed up on each day and were active n days later',
	signupDate: 'Signed up',
	signups: 'Users',
	daysAfter: 'Day {n}',
};

export function chartText(key: ChartLocaleKey): string {
	const chartLocale = (i18n.locale as unknown as { _chart?: Partial<Record<ChartLocaleKey, unknown>> })._chart;
	const value = chartLocale?.[key];
	return typeof value === 'string' ? value : fallback[key];
}
