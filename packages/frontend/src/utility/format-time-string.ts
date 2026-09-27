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

// 字句を 1 回の走査で置き換える。置換を順に重ねると、挿入した月名 (March の M・h、September の m など) が
// 後の字句として再処理される。長い字句を先に並べ、MMMM が M として拾われないようにする。
const dateTimeTokens = /yyyy|yy|MMMM|MMM|MM|M|dd|d|HH|H|hh|h|mm|m|ss|s|tt/g;

export function formatDateTimeString(date: Date, format: string): string {
	return format.replaceAll(dateTimeTokens, (token) => {
		switch (token) {
			case 'yyyy':
				return date.getFullYear().toString();
			case 'yy':
				return date.getFullYear().toString().slice(-2);
			case 'MMMM':
				return date.toLocaleString(window.navigator.language, { month: 'long' });
			case 'MMM':
				return date.toLocaleString(window.navigator.language, { month: 'short' });
			case 'MM':
				return `0${date.getMonth() + 1}`.slice(-2);
			case 'M':
				return (date.getMonth() + 1).toString();
			case 'dd':
				return `0${date.getDate()}`.slice(-2);
			case 'd':
				return date.getDate().toString();
			case 'HH':
				return `0${date.getHours()}`.slice(-2);
			case 'H':
				return date.getHours().toString();
			case 'hh':
				return `0${date.getHours() % 12 || 12}`.slice(-2);
			case 'h':
				return (date.getHours() % 12 || 12).toString();
			case 'mm':
				return `0${date.getMinutes()}`.slice(-2);
			case 'm':
				return date.getMinutes().toString();
			case 'ss':
				return `0${date.getSeconds()}`.slice(-2);
			case 's':
				return date.getSeconds().toString();
			default:
				return date.getHours() >= 12 ? 'PM' : 'AM';
		}
	});
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
