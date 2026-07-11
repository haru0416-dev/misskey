/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const SIZES = ['', 'K', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y', 'R', 'Q'];
const LOG_1000 = Math.log(1000);

export default (v: number | null, fractionDigits = 0) => {
	if (v == null) return 'N/A';
	if (v === 0) return '0';
	const isMinus = v < 0;
	if (isMinus) v = -v;
	const i = Math.floor(Math.log(v) / LOG_1000);
	return (
		(isMinus ? '-' : '') +
		(v / Math.pow(1000, i))
			.toFixed(fractionDigits)
			.replace(/(\.[1-9]*)0+$/, '$1')
			.replace(/\.$/, '') +
		(SIZES[i] ?? `e+${i * 3}`)
	);
};
