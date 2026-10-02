/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Params } from '../validation.js';
import { z } from 'zod';
import type { Config } from '@/config.js';
import { enqueueDeliverJob } from '@/core/queue/deliver-queue.js';
import { addRelayWithSideEffects, removeRelayWithSideEffects } from '@/core/relay/relay-logic.js';
import {
	listRelaysByStatusFromDatabaseCached,
	listRelaysFromDatabase,
	updateRelayStatusInDatabase,
} from '@/core/relay/relay-store.js';
import { fetchOrCreateSystemAccountInDatabase } from '@/core/system-account/system-account-logic.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { MiRelay } from '@/models/Relay.js';
import type { MiMeta } from '@/models/_.js';
import type { DeliverQueue } from '@/core/queue/queues.js';
import { ApiError } from '../error.js';
import { parseApiParams } from '../validation.js';

export type AdminRelaysDependencies = {
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

function invalidUrlError(): ApiError {
	return new ApiError({
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
		if (err instanceof ApiError) {
			throw err;
		}
		throw invalidUrlError();
	}
}

type RelaySender = { inbox: string | null; sharedInbox: string | null };

function senderInboxesOf(sender: RelaySender): string[] {
	return [sender.inbox, sender.sharedInbox].filter((inbox): inbox is string => inbox != null);
}

export async function relayAccepted(
	deps: Pick<AdminRelaysDependencies, 'db'>,
	id: string,
	sender: RelaySender,
): Promise<string> {
	const result = await updateRelayStatusInDatabase(deps.db, id, 'accepted', senderInboxesOf(sender));
	return JSON.stringify(result);
}

export async function relayRejected(
	deps: Pick<AdminRelaysDependencies, 'db'>,
	id: string,
	sender: RelaySender,
): Promise<string> {
	const result = await updateRelayStatusInDatabase(deps.db, id, 'rejected', senderInboxesOf(sender));
	return JSON.stringify(result);
}

/** accepted リレーの短命キャッシュを使い、actor がリレーか判定する。 */
export async function isRelayActor(
	deps: Pick<AdminRelaysDependencies, 'db'>,
	actor: { inbox: string | null; sharedInbox: string | null },
): Promise<boolean> {
	const relays = await listRelaysByStatusFromDatabaseCached(deps.db, 'accepted');
	return relays.some(
		(relay) =>
			(actor.inbox != null && relay.inbox === actor.inbox) ||
			(actor.sharedInbox != null && relay.inbox === actor.sharedInbox),
	);
}

export async function handleApiAdminRelaysList(deps: AdminRelaysDependencies): Promise<AdminRelaysListResponse> {
	const relays = await listRelaysFromDatabase(deps.db);

	return relays.map((relay) => ({
		id: relay.id,
		inbox: relay.inbox,
		status: relay.status,
	}));
}

export async function handleApiAdminRelaysAdd(
	deps: AdminRelaysDependencies,
	ps: Params<typeof adminRelaysWriteParamDef>,
): Promise<MiRelay> {
	assertHttpsUrl(ps.inbox);

	return await addRelayWithSideEffects(
		{
			config: deps.config,
			db: deps.db,
			genId,
			fetchRelayActor: () =>
				fetchOrCreateSystemAccountInDatabase(
					{
						db: deps.db,
						meta: deps.meta,
						genId,
					},
					'relay',
				),
			enqueueDeliver: (user, content, to, isSharedInbox) =>
				enqueueDeliverJob(deps.deliverQueue, deps.config, user, content, to, isSharedInbox),
		},
		ps.inbox,
	);
}

export async function handleApiAdminRelaysRemove(
	deps: AdminRelaysDependencies,
	ps: Params<typeof adminRelaysWriteParamDef>,
): Promise<void> {
	await removeRelayWithSideEffects(
		{
			config: deps.config,
			db: deps.db,
			genId,
			fetchRelayActor: () =>
				fetchOrCreateSystemAccountInDatabase(
					{
						db: deps.db,
						meta: deps.meta,
						genId,
					},
					'relay',
				),
			enqueueDeliver: (user, content, to, isSharedInbox) =>
				enqueueDeliverJob(deps.deliverQueue, deps.config, user, content, to, isSharedInbox),
		},
		ps.inbox,
	);
}
