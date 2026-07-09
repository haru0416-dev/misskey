/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import type { Config } from '@/config.js';
import { enqueueDeliverJob } from '@/core/DeliverQueue.js';
import { addRelayWithSideEffects, removeRelayWithSideEffects } from '@/core/RelayLogic.js';
import { listRelaysByStatusFromDatabaseCached, listRelaysFromDatabase, updateRelayStatusInDatabase } from '@/core/RelayStore.js';
import { fetchOrCreateSystemAccountInDatabase } from '@/core/SystemAccountLogic.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { MiRelay } from '@/models/Relay.js';
import type { MiMeta } from '@/models/_.js';
import type { DeliverQueue } from '@/core/queues.js';
import { HonoApiError } from './error.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAdminRelaysDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	deliverQueue: DeliverQueue;
};

export const adminRelaysListParamDef = z.object({});

export const adminRelaysWriteParamDef = z.object({
	inbox: z.string(),
});

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

/** RelayService.relayAccepted 相当。 */
export async function relayAcceptedForHonoApi(deps: Pick<HonoApiAdminRelaysDependencies, 'db'>, id: string): Promise<string> {
	const result = await updateRelayStatusInDatabase(deps.db, id, 'accepted');
	return JSON.stringify(result);
}

/** RelayService.relayRejected 相当。 */
export async function relayRejectedForHonoApi(deps: Pick<HonoApiAdminRelaysDependencies, 'db'>, id: string): Promise<string> {
	const result = await updateRelayStatusInDatabase(deps.db, id, 'rejected');
	return JSON.stringify(result);
}

/**
 * RelayService.isRelayActor 相当。原典の10分キャッシュに対応する RelayStore 側の
 * 同期無効化付き短命キャッシュ (listRelaysByStatusFromDatabaseCached) を使う。
 */
export async function isRelayActorForHonoApi(deps: Pick<HonoApiAdminRelaysDependencies, 'db'>, actor: { inbox: string | null; sharedInbox: string | null }): Promise<boolean> {
	const relays = await listRelaysByStatusFromDatabaseCached(deps.db, 'accepted');
	return relays.some(relay =>
		(actor.inbox != null && relay.inbox === actor.inbox)
		|| (actor.sharedInbox != null && relay.inbox === actor.sharedInbox),
	);
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
		genId,
		fetchRelayActor: () => fetchOrCreateSystemAccountInDatabase({
			db: deps.db,
			meta: deps.meta,
			genId,
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
		genId,
		fetchRelayActor: () => fetchOrCreateSystemAccountInDatabase({
			db: deps.db,
			meta: deps.meta,
			genId,
		}, 'relay'),
		enqueueDeliver: (user, content, to, isSharedInbox) => enqueueDeliverJob(deps.deliverQueue, deps.config, user, content, to, isSharedInbox),
	}, ps.inbox);
}
