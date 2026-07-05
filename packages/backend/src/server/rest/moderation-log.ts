/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { listModerationLogsFromDatabase, type ModerationLogOrder } from '@/core/ModerationLogStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { SchemaType } from '@/misc/json-schema.js';
import type { Config } from '@/config.js';
import type { MiModerationLog } from '@/models/ModerationLog.js';
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

type AdminShowModerationLogsParams = SchemaType<typeof adminShowModerationLogsParamDef>;

function resolveModerationLogPagination(
	config: Config,
	params: AdminShowModerationLogsParams,
): {
	sinceId: string | null;
	untilId: string | null;
	order: ModerationLogOrder;
} {
	if (params.sinceId && params.untilId) {
		return { sinceId: params.sinceId, untilId: params.untilId, order: 'desc' };
	} else if (params.sinceId) {
		return { sinceId: params.sinceId, untilId: null, order: 'asc' };
	} else if (params.untilId) {
		return { sinceId: null, untilId: params.untilId, order: 'desc' };
	} else if (params.sinceDate && params.untilDate) {
		return { sinceId: genId(config, params.sinceDate), untilId: genId(config, params.untilDate), order: 'desc' };
	} else if (params.sinceDate) {
		return { sinceId: genId(config, params.sinceDate), untilId: null, order: 'asc' };
	} else if (params.untilDate) {
		return { sinceId: null, untilId: genId(config, params.untilDate), order: 'desc' };
	}

	return { sinceId: null, untilId: null, order: 'desc' };
}

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
	const params = parseHonoApiParams(adminShowModerationLogsParamDef, body) as AdminShowModerationLogsParams;
	const pagination = resolveModerationLogPagination(deps.config, params);
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
