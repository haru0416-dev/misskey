/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Params } from '../validation.js';
import { z } from 'zod';
import { listUserIpsFromDatabase } from '@/core/user/user-ip-store.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { misskeyId } from '@/misc/zod-params.js';
import { parseApiParams } from '../validation.js';

export type AdminUserIpsDependencies = {
	db: MiDrizzleDatabase;
};

export const adminGetUserIpsParamDef = z.object({
	userId: misskeyId(),
});

type AdminGetUserIpsResponse = {
	ip: string;
	createdAt: string;
}[];

export async function handleApiAdminGetUserIps(
	deps: AdminUserIpsDependencies,
	params: Params<typeof adminGetUserIpsParamDef>,
): Promise<AdminGetUserIpsResponse> {
	const ips = await listUserIpsFromDatabase(deps.db, params.userId, 30);

	return ips.map((row) => ({
		ip: row.ip,
		createdAt: row.createdAt.toISOString(),
	}));
}
