/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { gt, lt } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/** ID 境界を両端とも含まない範囲条件として conditions へ足す。空文字の境界は指定なしとみなす。 */
export function pushIdPaginationConditions(
	conditions: SQL[],
	column: AnyPgColumn,
	sinceId?: string | null,
	untilId?: string | null,
): void {
	if (sinceId) {
		conditions.push(gt(column, sinceId));
	}
	if (untilId) {
		conditions.push(lt(column, untilId));
	}
}
