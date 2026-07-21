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
	return format.replace(/\{\{(\w+)(:(\w+))?\}\}/g, (match: string, kind: string, unused?, option?: string) => {
		if (['weekday', 'era', 'year', 'month', 'day', 'hour', 'minute', 'second', 'timeZoneName'].includes(kind)) {
			return date.toLocaleString(window.navigator.language, {
				[kind]: option ? option : defaultLocaleStringFormats[kind],
			});
		} else {
			return match;
		}
	});
}

export function formatDateTimeString(date: Date, format: string): string {
	return format
		.replaceAll(/yyyy/g, date.getFullYear().toString())
		.replaceAll(/yy/g, date.getFullYear().toString().slice(-2))
		.replaceAll(/MMMM/g, date.toLocaleString(window.navigator.language, { month: 'long' }))
		.replaceAll(/MMM/g, date.toLocaleString(window.navigator.language, { month: 'short' }))
		.replaceAll(/MM/g, `0${date.getMonth() + 1}`.slice(-2))
		.replaceAll(/M/g, (date.getMonth() + 1).toString())
		.replaceAll(/dd/g, `0${date.getDate()}`.slice(-2))
		.replaceAll(/d/g, date.getDate().toString())
		.replaceAll(/HH/g, `0${date.getHours()}`.slice(-2))
		.replaceAll(/H/g, date.getHours().toString())
		.replaceAll(/hh/g, `0${date.getHours() % 12 || 12}`.slice(-2))
		.replaceAll(/h/g, (date.getHours() % 12 || 12).toString())
		.replaceAll(/mm/g, `0${date.getMinutes()}`.slice(-2))
		.replaceAll(/m/g, date.getMinutes().toString())
		.replaceAll(/ss/g, `0${date.getSeconds()}`.slice(-2))
		.replaceAll(/s/g, date.getSeconds().toString())
		.replaceAll(/tt/g, date.getHours() >= 12 ? 'PM' : 'AM');
}

export function formatTimeString(date: Date, format: string): string {
	return format.replace(
		/\[(([^\[]|\[\])*)\]|(([yMdHhmst])\4{0,3})/g,
		(match: string, localeformat?: string, unused?, datetimeformat?: string) => {
			if (localeformat) return formatLocaleString(date, localeformat);
			if (datetimeformat) return formatDateTimeString(date, datetimeformat);
			return match;
		},
	);
}
