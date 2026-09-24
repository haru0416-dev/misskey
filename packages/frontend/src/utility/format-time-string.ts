/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const defaultLocaleStringFormats: { [index: string]: string } = {
	weekday: 'narrow',
	era: 'narrow',
	year: 'numeric',
	month: 'numeric',
	day: 'numeric',
	hour: 'numeric',
	minute: 'numeric',
	second: 'numeric',
	timeZoneName: 'short',
};

function formatLocaleString(date: Date, format: string): string {
	return format.replaceAll(/\{\{(\w+)(:(\w+))?\}\}/g, (match: string, kind: string, unused?, option?: string) => {
		if (['weekday', 'era', 'year', 'month', 'day', 'hour', 'minute', 'second', 'timeZoneName'].includes(kind)) {
			return date.toLocaleString(window.navigator.language, {
				[kind]: option ? option : defaultLocaleStringFormats[kind],
			});
		}
		return match;
	});
}

export function formatDateTimeString(date: Date, format: string): string {
	return format
		.replaceAll('yyyy', date.getFullYear().toString())
		.replaceAll('yy', date.getFullYear().toString().slice(-2))
		.replaceAll('MMMM', date.toLocaleString(window.navigator.language, { month: 'long' }))
		.replaceAll('MMM', date.toLocaleString(window.navigator.language, { month: 'short' }))
		.replaceAll('MM', `0${date.getMonth() + 1}`.slice(-2))
		.replaceAll('M', (date.getMonth() + 1).toString())
		.replaceAll('dd', `0${date.getDate()}`.slice(-2))
		.replaceAll('d', date.getDate().toString())
		.replaceAll('HH', `0${date.getHours()}`.slice(-2))
		.replaceAll('H', date.getHours().toString())
		.replaceAll('hh', `0${date.getHours() % 12 || 12}`.slice(-2))
		.replaceAll('h', (date.getHours() % 12 || 12).toString())
		.replaceAll('mm', `0${date.getMinutes()}`.slice(-2))
		.replaceAll('m', date.getMinutes().toString())
		.replaceAll('ss', `0${date.getSeconds()}`.slice(-2))
		.replaceAll('s', date.getSeconds().toString())
		.replaceAll('tt', date.getHours() >= 12 ? 'PM' : 'AM');
}

export function formatTimeString(date: Date, format: string): string {
	return format.replaceAll(
		/\[(([^\[]|\[\])*)\]|(([yMdHhmst])\4{0,3})/g,
		(match: string, localeformat?: string, unused?, datetimeformat?: string) => {
			if (localeformat) {
				return formatLocaleString(date, localeformat);
			}
			if (datetimeformat) {
				return formatDateTimeString(date, datetimeformat);
			}
			return match;
		},
	);
}
