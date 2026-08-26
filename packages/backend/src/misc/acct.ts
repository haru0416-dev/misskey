/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type Acct = {
	username: string;
	host: string | null;
};

export function parse(acct: string): Acct {
	if (acct.startsWith('@')) acct = acct.substring(1);
	const separator = acct.indexOf('@');
	const nextSeparator = separator === -1 ? -1 : acct.indexOf('@', separator + 1);
	return separator === -1
		? { username: acct, host: null }
		: {
				username: acct.slice(0, separator),
				host: acct.slice(separator + 1, nextSeparator === -1 ? undefined : nextSeparator),
			};
}

export function toString(acct: Acct): string {
	return acct.host == null ? acct.username : `${acct.username}@${acct.host}`;
}
