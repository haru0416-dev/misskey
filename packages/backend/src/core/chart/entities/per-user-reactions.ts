/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const name = 'perUserReaction';

export const schema = {
	'local.count': { range: 'small' },
	'remote.count': { range: 'small' },
} as const;
