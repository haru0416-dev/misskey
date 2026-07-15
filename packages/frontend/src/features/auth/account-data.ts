/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';

export type AccountWithToken = Misskey.entities.MeDetailed & { token: string };

type AccountWithTokenCandidate = Record<string, unknown> & {
	id?: unknown;
	username?: unknown;
	token?: unknown;
	notesCount?: unknown;
	policies?: unknown;
};

export function isAccountWithToken(value: unknown): value is AccountWithToken {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

	const account = value as AccountWithTokenCandidate;
	return (
		typeof account.id === 'string' &&
		typeof account.username === 'string' &&
		typeof account.token === 'string' &&
		typeof account.notesCount === 'number' &&
		Number.isFinite(account.notesCount) &&
		typeof account.policies === 'object' &&
		account.policies !== null &&
		!Array.isArray(account.policies)
	);
}
