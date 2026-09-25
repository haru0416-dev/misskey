/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const name = 'activeUsers';

export const schema = {
	readWrite: { intersection: ['read', 'write'] },
	read: { uniqueIncrement: true },
	write: { uniqueIncrement: true },
	registeredWithinWeek: { uniqueIncrement: true },
	registeredWithinMonth: { uniqueIncrement: true },
	registeredWithinYear: { uniqueIncrement: true },
	registeredOutsideWeek: { uniqueIncrement: true },
	registeredOutsideMonth: { uniqueIncrement: true },
	registeredOutsideYear: { uniqueIncrement: true },
} as const;
