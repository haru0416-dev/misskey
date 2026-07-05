/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { listModerationLogsFromDatabase } from '@/core/ModerationLogStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { SchemaType } from '@/misc/json-schema.js';
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
	info: Record<string, any>;
	userId: string;
	user: UserDetailedNotMeHonoApiResponse;
};

const adminShowModerationLogsParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		type: { type: 'string', nullable: true },
		userId: { type: 'string', format: 'misskey:id', nullable: true },
		search: { type: 'string', nullable: true },
	},
	required: [],
} as const;


async function packModerationLogsForHonoApi(
	deps: HonoApiModerationLogDependencies,
	logs: MiModerationLog[],
): Promise<HonoApiModerationLogResponse[]> {
	const users = await packUserDetailedNotMeManyForHonoApi(deps, logs.map(log => log.user ?? log.userId));

	return logs.map((log, index) => ({
		id: log.id,
		createdAt: parseId(deps.config, log.id).date.toISOString(),
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
	const pagination = resolveHonoApiIdPagination(deps.config, params);
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
