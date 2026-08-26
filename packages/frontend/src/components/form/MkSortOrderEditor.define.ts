/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

type SortOrderDirection = '+' | '-';

export type SortOrder<T extends string> = {
	key: T;
	direction: SortOrderDirection;
};
