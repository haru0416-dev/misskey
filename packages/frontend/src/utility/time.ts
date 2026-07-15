/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const dateTimeIntervals = {
	day: 86400000,
	hour: 3600000,
	ms: 1,
};

export function dateUTC(time: number[]): Date {
	const [year, month, date, hours, minutes, seconds, ms] = time;
	if (year == null || month == null) throw new Error('wrong number of arguments');
	const d =
		time.length === 2
			? Date.UTC(year, month)
			: time.length === 3 && date != null
				? Date.UTC(year, month, date)
				: time.length === 4 && date != null && hours != null
					? Date.UTC(year, month, date, hours)
					: time.length === 5 && date != null && hours != null && minutes != null
						? Date.UTC(year, month, date, hours, minutes)
						: time.length === 6 && date != null && hours != null && minutes != null && seconds != null
							? Date.UTC(year, month, date, hours, minutes, seconds)
							: time.length === 7 && date != null && hours != null && minutes != null && seconds != null && ms != null
								? Date.UTC(year, month, date, hours, minutes, seconds, ms)
								: null;

	if (d == null) throw new Error('wrong number of arguments');

	return new Date(d);
}

export function isTimeSame(a: Date, b: Date): boolean {
	return a.getTime() === b.getTime();
}

export function isTimeBefore(a: Date, b: Date): boolean {
	return a.getTime() - b.getTime() < 0;
}

export function isTimeAfter(a: Date, b: Date): boolean {
	return a.getTime() - b.getTime() > 0;
}

export function addTime(x: Date, value: number, span: keyof typeof dateTimeIntervals = 'ms'): Date {
	return new Date(x.getTime() + value * dateTimeIntervals[span]);
}

export function subtractTime(x: Date, value: number, span: keyof typeof dateTimeIntervals = 'ms'): Date {
	return new Date(x.getTime() - value * dateTimeIntervals[span]);
}
