/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { listLatestRetentionAggregations } from '@/core/RetentionAggregationStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiRetentionDependencies = {
	db: MiDrizzleDatabase;
};

export const retentionParamDef = z.object({});

export async function handleHonoApiRetention(
	deps: HonoApiRetentionDependencies,
	body: Record<string, unknown>,
): Promise<{
	createdAt: string;
	users: number;
	data: Record<string, number>;
}[]> {
	parseHonoApiParams(retentionParamDef, body);
	const records = await listLatestRetentionAggregations(deps.db, 30);

	return records.map(record => ({
		createdAt: record.createdAt.toISOString(),
		users: record.usersCount,
		data: record.data,
	}));
}
