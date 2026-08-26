/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { domainToASCII } from 'node:url';
import type { Config } from '@/config.js';
import { CONTEXT } from '@/core/activitypub/misc/contexts.js';
import type { IActivity, IFollow, IObject, IUndo } from '@/core/activitypub/type.js';
import {
	createRelayInDatabase,
	deleteRelayFromDatabase,
	fetchRelayByInboxFromDatabase,
} from '@/core/relay/RelayStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiRelay } from '@/models/Relay.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';

type RelayActivityConfig = Pick<Config, 'runtime' | 'instance'>;

export type RelaySideEffectDependencies = {
	config: RelayActivityConfig;
	db: MiDrizzleDatabase;
	genId: () => MiRelay['id'];
	fetchRelayActor: () => Promise<MiLocalUser>;
	enqueueDeliver: (
		user: { id: MiUser['id'] },
		content: IActivity | null,
		to: string | null,
		isSharedInbox: boolean,
	) => unknown;
};

function genLocalUserUri(config: Pick<Config, 'instance'>, userId: MiUser['id']): string {
	return `${config.instance.url}/users/${userId}`;
}

function isUriLocal(config: Pick<Config, 'runtime'>, uri: string): boolean {
	try {
		return domainToASCII(new URL(uri).host) === domainToASCII(config.runtime.host);
	} catch {
		return false;
	}
}

function renderFollowRelay(config: Pick<Config, 'instance'>, relay: MiRelay, relayActor: MiLocalUser): IFollow {
	return {
		id: `${config.instance.url}/activities/follow-relay/${relay.id}`,
		type: 'Follow',
		actor: genLocalUserUri(config, relayActor.id),
		object: 'https://www.w3.org/ns/activitystreams#Public',
	};
}

function renderUndo(config: RelayActivityConfig, object: string | IObject, user: { id: MiUser['id'] }): IUndo {
	const id =
		typeof object !== 'string' && typeof object.id === 'string' && isUriLocal(config, object.id)
			? `${object.id}/undo`
			: undefined;

	return {
		type: 'Undo',
		...(id ? { id } : {}),
		actor: genLocalUserUri(config, user.id),
		object,
		published: new Date().toISOString(),
	};
}

function addContext<T extends IObject>(config: Pick<Config, 'instance'>, x: T): T & { '@context': any; id: string } {
	if (typeof x === 'object' && x.id == null) {
		x.id = `${config.instance.url}/${randomUUID()}`;
	}

	return Object.assign({ '@context': CONTEXT }, x as T & { id: string });
}

export async function addRelayWithSideEffects(deps: RelaySideEffectDependencies, inbox: string): Promise<MiRelay> {
	const relay = await createRelayInDatabase(deps.db, {
		id: deps.genId(),
		inbox,
		status: 'requesting',
	});

	const relayActor = await deps.fetchRelayActor();
	const follow = renderFollowRelay(deps.config, relay, relayActor);
	const activity = addContext(deps.config, follow);
	deps.enqueueDeliver(relayActor, activity, relay.inbox, false);

	return relay;
}

export async function removeRelayWithSideEffects(deps: RelaySideEffectDependencies, inbox: string): Promise<void> {
	const relay = await fetchRelayByInboxFromDatabase(deps.db, inbox);

	if (relay == null) {
		throw new Error('relay not found');
	}

	const relayActor = await deps.fetchRelayActor();
	const follow = renderFollowRelay(deps.config, relay, relayActor);
	const undo = renderUndo(deps.config, follow, relayActor);
	const activity = addContext(deps.config, undo);
	deps.enqueueDeliver(relayActor, activity, relay.inbox, false);

	await deleteRelayFromDatabase(deps.db, relay.id);
}
