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
	const getPart = (index: number): number => {
		const part = time[index];
		if (part == null) throw new Error('wrong number of arguments');
		return part;
	};

	let d: number;
	switch (time.length) {
		case 2:
			d = Date.UTC(getPart(0), getPart(1));
			break;
		case 3:
			d = Date.UTC(getPart(0), getPart(1), getPart(2));
			break;
		case 4:
			d = Date.UTC(getPart(0), getPart(1), getPart(2), getPart(3));
			break;
		case 5:
			d = Date.UTC(getPart(0), getPart(1), getPart(2), getPart(3), getPart(4));
			break;
		case 6:
			d = Date.UTC(getPart(0), getPart(1), getPart(2), getPart(3), getPart(4), getPart(5));
			break;
		case 7:
			d = Date.UTC(getPart(0), getPart(1), getPart(2), getPart(3), getPart(4), getPart(5), getPart(6));
			break;
		default:
			throw new Error('wrong number of arguments');
	}

	if (Number.isNaN(d)) throw new Error('wrong number of arguments');

	return new Date(d);
}

export function isTimeSame(a: Date, b: Date): boolean {
	return a.getTime() === b.getTime();
}

export function isTimeBefore(a: Date, b: Date): boolean {
	return a.getTime() - b.getTime() < 0;
}

function isTimeAfter(a: Date, b: Date): boolean {
	return a.getTime() - b.getTime() > 0;
}

export function addTime(x: Date, value: number, span: keyof typeof dateTimeIntervals = 'ms'): Date {
	return new Date(x.getTime() + value * dateTimeIntervals[span]);
}

export function subtractTime(x: Date, value: number, span: keyof typeof dateTimeIntervals = 'ms'): Date {
	return new Date(x.getTime() - value * dateTimeIntervals[span]);
}
