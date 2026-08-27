/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { listLatestRetentionAggregations } from '@/core/retention/RetentionAggregationStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseApiParams } from '../validation.js';

export type ApiRetentionDependencies = {
	db: MiDrizzleDatabase;
};

export const retentionParamDef = z.object({});

export async function handleApiRetention(
	deps: ApiRetentionDependencies,
	body: Record<string, unknown>,
): Promise<
	{
		createdAt: string;
		users: number;
		data: Record<string, number>;
	}[]
> {
	parseApiParams(retentionParamDef, body);
	const records = await listLatestRetentionAggregations(deps.db, 30);

	return records.map((record) => ({
		createdAt: record.createdAt.toISOString(),
		users: record.usersCount,
		data: record.data,
	}));
}
