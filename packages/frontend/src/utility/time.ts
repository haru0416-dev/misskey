/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const dateTimeIntervals = {
	day: 86_400_000,
	hour: 3_600_000,
	ms: 1,
};

export function addTime(x: Date, value: number, span: keyof typeof dateTimeIntervals = 'ms'): Date {
	return new Date(x.getTime() + value * dateTimeIntervals[span]);
}
