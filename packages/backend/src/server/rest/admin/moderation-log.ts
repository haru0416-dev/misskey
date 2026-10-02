/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Params } from '../validation.js';
import { z } from 'zod';
import { listModerationLogsFromDatabase } from '@/core/moderation/moderation-log-store.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { parseId } from '@/misc/id/parse-id.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { Config } from '@/config.js';
import { genId } from '@/misc/id/gen-id.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import { omitUndefined } from '@/misc/clone.js';
import type { MiModerationLog } from '@/models/ModerationLog.js';
import { packUserDetailedNotMeMany } from '../user/user.js';
import type { UserPackingDependencies } from '../../../core/user/user-packing.js';
import type { UserDetailedNotMeApiResponse } from '../user/user.js';
import { parseApiParams } from '../validation.js';

export type ModerationLogDependencies = UserPackingDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
};

type ModerationLogResponse = {
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

async function packModerationLogs(
	deps: ModerationLogDependencies,
	logs: MiModerationLog[],
): Promise<ModerationLogResponse[]> {
	const users = await packUserDetailedNotMeMany(
		deps,
		logs.map((log) => log.user ?? log.userId),
	);

	// 一覧のクエリの後で実行者の削除が確定したログは返さない (ログも同じ削除の cascade で消えている)。
	return logs.flatMap((log, index) => {
		const user = users[index];
		if (user == null) {
			return [];
		}
		return [
			{
				id: log.id,
				createdAt: parseId(log.id).date.toISOString(),
				type: log.type,
				info: log.info,
				userId: log.userId,
				user,
			},
		];
	});
}

export async function handleApiAdminShowModerationLogs(
	deps: ModerationLogDependencies,
	params: Params<typeof adminShowModerationLogsParamDef>,
): Promise<ModerationLogResponse[]> {
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

	return await packModerationLogs(deps, logs);
}
