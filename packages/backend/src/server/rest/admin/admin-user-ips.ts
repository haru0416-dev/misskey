/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { listUserIpsFromDatabase } from '@/core/user/UserIpStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { misskeyId } from '@/misc/zod-params.js';
import { parseApiParams } from '../validation.js';

export type ApiAdminUserIpsDependencies = {
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
	deps: ApiAdminUserIpsDependencies,
	body: Record<string, unknown>,
): Promise<AdminGetUserIpsResponse> {
	const params = parseApiParams(adminGetUserIpsParamDef, body);
	const ips = await listUserIpsFromDatabase(deps.db, params.userId, 30);

	return ips.map((row) => ({
		ip: row.ip,
		createdAt: row.createdAt.toISOString(),
	}));
}
