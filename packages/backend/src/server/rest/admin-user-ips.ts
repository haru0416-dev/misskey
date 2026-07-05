/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { listUserIpsFromDatabase } from '@/core/UserIpStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { SchemaType } from '@/misc/json-schema.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAdminUserIpsDependencies = {
	db: MiDrizzleDatabase;
};

const adminGetUserIpsParamDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;

type AdminGetUserIpsParams = SchemaType<typeof adminGetUserIpsParamDef>;

type AdminGetUserIpsResponse = {
	ip: string;
	createdAt: string;
}[];

export async function handleHonoApiAdminGetUserIps(
	deps: HonoApiAdminUserIpsDependencies,
	body: Record<string, unknown>,
): Promise<AdminGetUserIpsResponse> {
	const params = parseHonoApiParams(adminGetUserIpsParamDef, body) as AdminGetUserIpsParams;
	const ips = await listUserIpsFromDatabase(deps.db, params.userId, 30);

	return ips.map(row => ({
		ip: row.ip,
		createdAt: row.createdAt.toISOString(),
	}));
}
