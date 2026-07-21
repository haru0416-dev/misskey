/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { listUserIpsFromDatabase } from '@/core/UserIpStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { misskeyId } from '@/misc/zod-params.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAdminUserIpsDependencies = {
	db: MiDrizzleDatabase;
};

export const adminGetUserIpsParamDef = z.object({
	userId: misskeyId(),
});


type AdminGetUserIpsResponse = {
	ip: string;
	createdAt: string;
}[];

export async function handleHonoApiAdminGetUserIps(
	deps: HonoApiAdminUserIpsDependencies,
	body: Record<string, unknown>,
): Promise<AdminGetUserIpsResponse> {
	const params = parseHonoApiParams(adminGetUserIpsParamDef, body);
	const ips = await listUserIpsFromDatabase(deps.db, params.userId, 30);

	return ips.map(row => ({
		ip: row.ip,
		createdAt: row.createdAt.toISOString(),
	}));
}
