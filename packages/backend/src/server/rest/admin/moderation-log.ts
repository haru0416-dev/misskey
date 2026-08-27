/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { listModerationLogsFromDatabase } from '@/core/moderation/ModerationLogStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseId } from '@/misc/id/parse-id.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { Config } from '@/config.js';
import { genId } from '@/misc/id/gen-id.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import { omitUndefined } from '@/misc/clone.js';
import type { MiModerationLog } from '@/models/ModerationLog.js';
import {
	packUserDetailedNotMeManyForApi,
	type UserDetailedNotMeApiResponse,
	type UserPackingDependencies,
} from '../user/user.js';
import { parseApiParams } from '../validation.js';

export type ApiModerationLogDependencies = UserPackingDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
};

type ApiModerationLogResponse = {
	id: string;
	createdAt: string;
	type: string;
	info: Record<string, unknown>;
	userId: string;
	user: UserDetailedNotMeApiResponse;
};

export const adminShowModerationLogsParamDef = z.object({
	limit: z.int().min(1).max(100).default(10),
	...paginationParams,
	type: z.string().nullable().optional(),
	userId: misskeyId().nullable().optional(),
	search: z.string().nullable().optional(),
});

async function packModerationLogsForApi(
	deps: ApiModerationLogDependencies,
	logs: MiModerationLog[],
): Promise<ApiModerationLogResponse[]> {
	const users = await packUserDetailedNotMeManyForApi(
		deps,
		logs.map((log) => log.user ?? log.userId),
	);

	return logs.map((log, index) => {
		const user = users[index];
		if (user == null) throw new Error(`Packed moderation log user is missing at index ${index}`);
		return {
			id: log.id,
			createdAt: parseId(log.id).date.toISOString(),
			type: log.type,
			info: log.info,
			userId: log.userId,
			user,
		};
	});
}

export async function handleApiAdminShowModerationLogs(
	deps: ApiModerationLogDependencies,
	body: Record<string, unknown>,
): Promise<ApiModerationLogResponse[]> {
	const params = parseApiParams(adminShowModerationLogsParamDef, body);
	const pagination = resolveDateIdPagination({ gen: (time) => genId(time) }, params);
	const logs = await listModerationLogsFromDatabase(
		deps.db,
		omitUndefined({
			limit: params.limit,
			order: pagination.order,
			sinceId: pagination.sinceId,
			untilId: pagination.untilId,
			type: params.type,
			userId: params.userId,
			search: params.search,
		}),
	);

	return await packModerationLogsForApi(deps, logs);
}
