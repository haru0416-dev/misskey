/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { listModerationLogsFromDatabase } from '@/core/ModerationLogStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseId } from '@/misc/id/parse-id.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { Config } from '@/config.js';
import type { MiModerationLog } from '@/models/ModerationLog.js';
import { resolveHonoApiIdPagination } from './following.js';
import { packUserDetailedNotMeManyForHonoApi, type UserDetailedNotMeHonoApiResponse, type UserPackingDependencies } from './user.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiModerationLogDependencies = UserPackingDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
};

type HonoApiModerationLogResponse = {
	id: string;
	createdAt: string;
	type: string;
	info: Record<string, unknown>;
	userId: string;
	user: UserDetailedNotMeHonoApiResponse;
};

export const adminShowModerationLogsParamDef = z.object({
	limit: z.number().int().min(1).max(100).default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	type: z.string().nullable().optional(),
	userId: misskeyId().nullable().optional(),
	search: z.string().nullable().optional(),
});


async function packModerationLogsForHonoApi(
	deps: HonoApiModerationLogDependencies,
	logs: MiModerationLog[],
): Promise<HonoApiModerationLogResponse[]> {
	const users = await packUserDetailedNotMeManyForHonoApi(deps, logs.map(log => log.user ?? log.userId));

	return logs.map((log, index) => ({
		id: log.id,
		createdAt: parseId(log.id).date.toISOString(),
		type: log.type,
		info: log.info,
		userId: log.userId,
		user: users[index],
	}));
}

export async function handleHonoApiAdminShowModerationLogs(
	deps: HonoApiModerationLogDependencies,
	body: Record<string, unknown>,
): Promise<HonoApiModerationLogResponse[]> {
	const params = parseHonoApiParams(adminShowModerationLogsParamDef, body);
	const pagination = resolveHonoApiIdPagination(params);
	const logs = await listModerationLogsFromDatabase(deps.db, {
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
		type: params.type,
		userId: params.userId,
		search: params.search,
	});

	return await packModerationLogsForHonoApi(deps, logs);
}
