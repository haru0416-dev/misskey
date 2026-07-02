/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import { enqueueDeliverJob } from '@/core/DeliverQueue.js';
import { addRelayWithSideEffects, removeRelayWithSideEffects } from '@/core/RelayLogic.js';
import { listRelaysFromDatabase } from '@/core/RelayStore.js';
import { fetchOrCreateSystemAccountInDatabase } from '@/core/SystemAccountLogic.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { MiRelay } from '@/models/Relay.js';
import type { MiMeta } from '@/models/_.js';
import type { DeliverQueue } from '@/core/QueueModule.js';
import { HonoApiError } from './hono-api-error.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiAdminRelaysDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	deliverQueue: DeliverQueue;
};

const adminRelaysListParamDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

const adminRelaysWriteParamDef = {
	type: 'object',
	properties: {
		inbox: { type: 'string' },
	},
	required: ['inbox'],
} as const;

type AdminRelaysListResponse = {
	id: MiRelay['id'];
	inbox: MiRelay['inbox'];
	status: MiRelay['status'];
}[];

function invalidUrlError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Invalid URL',
		code: 'INVALID_URL',
		id: 'fb8c92d3-d4e5-44e7-b3d4-800d5cef8b2c',
	});
}

function assertHttpsUrl(url: string): void {
	try {
		if (new URL(url).protocol !== 'https:') {
			throw invalidUrlError();
		}
	} catch (err) {
		if (err instanceof HonoApiError) throw err;
		throw invalidUrlError();
	}
}

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

export async function handleHonoApiAdminRelaysAdd(
	deps: HonoApiAdminRelaysDependencies,
	body: Record<string, unknown>,
): Promise<MiRelay> {
	const ps = parseHonoApiParams(adminRelaysWriteParamDef, body);
	assertHttpsUrl(ps.inbox);

	return await addRelayWithSideEffects({
		config: deps.config,
		db: deps.db,
		genId: () => genId(deps.config),
		fetchRelayActor: () => fetchOrCreateSystemAccountInDatabase({
			db: deps.db,
			meta: deps.meta,
			genId: () => genId(deps.config),
		}, 'relay'),
		enqueueDeliver: (user, content, to, isSharedInbox) => enqueueDeliverJob(deps.deliverQueue, deps.config, user, content, to, isSharedInbox),
	}, ps.inbox);
}

export async function handleHonoApiAdminRelaysRemove(
	deps: HonoApiAdminRelaysDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const ps = parseHonoApiParams(adminRelaysWriteParamDef, body);

	await removeRelayWithSideEffects({
		config: deps.config,
		db: deps.db,
		genId: () => genId(deps.config),
		fetchRelayActor: () => fetchOrCreateSystemAccountInDatabase({
			db: deps.db,
			meta: deps.meta,
			genId: () => genId(deps.config),
		}, 'relay'),
		enqueueDeliver: (user, content, to, isSharedInbox) => enqueueDeliverJob(deps.deliverQueue, deps.config, user, content, to, isSharedInbox),
	}, ps.inbox);
}
