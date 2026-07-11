/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const SIZES = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB', 'RB', 'QB'];
const LOG_1024 = Math.log(1024);

export default (v: number | null, digits = 0) => {
	if (v == null) return '?';
	if (v === 0) return '0';
	const isMinus = v < 0;
	if (isMinus) v = -v;
	const i = Math.floor(Math.log(v) / LOG_1024);
	return (
		(isMinus ? '-' : '') +
		(v / Math.pow(1024, i))
			.toFixed(digits)
			.replace(/(\.[1-9]*)0+$/, '$1')
			.replace(/\.$/, '') +
		(SIZES[i] ?? `e+${i * 3}B`)
	);
};
