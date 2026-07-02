/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { listRelaysFromDatabase } from '@/core/RelayStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiRelay } from '@/models/Relay.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiAdminRelaysDependencies = {
	db: MiDrizzleDatabase;
};

const adminRelaysListParamDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

type AdminRelaysListResponse = {
	id: MiRelay['id'];
	inbox: MiRelay['inbox'];
	status: MiRelay['status'];
}[];

export async function handleHonoApiAdminRelaysList(
	deps: HonoApiAdminRelaysDependencies,
	body: Record<string, unknown>,
): Promise<AdminRelaysListResponse> {
	parseHonoApiParams(adminRelaysListParamDef, body);

	const relays = await listRelaysFromDatabase(deps.db);

	return relays.map(relay => ({
		id: relay.id,
		inbox: relay.inbox,
		status: relay.status,
	}));
}
