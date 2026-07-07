/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { enqueueDeliverJob } from '@/core/DeliverQueue.js';
import { listSharedInboxesFromFollowingsInDatabase } from '@/core/FollowingStore.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import type { DbQueue, DeliverQueue } from '@/core/queues.js';
import { fetchUserByIdOrFailFromDatabase, updateUserDeletedStateInDatabase } from '@/core/UserStore.js';
import { CONTEXT } from '@/core/activitypub/misc/contexts.js';
import type { IActivity, IDelete, IObject } from '@/core/activitypub/type.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta, MiUser } from '@/models/_.js';

export type DeleteAccountDependencies = {
	config: Config;
	meta: Pick<MiMeta, 'rootUserId'>;
	db: MiDrizzleDatabase;
	dbQueue: DbQueue;
	deliverQueue: DeliverQueue;
	publishInternalEvent?: <K extends 'userChangeDeletedState'>(type: K, value: { id: MiUser['id']; isDeleted: true }) => void;
};

type DeleteAccountTarget = {
	id: MiUser['id'];
	host: MiUser['host'];
};

function genLocalUserUri(config: Config, userId: MiUser['id']): string {
	return `${config.url}/users/${userId}`;
}

function renderDelete(config: Config, object: IObject | string, user: { id: MiUser['id']; host: null }): IDelete {
	return {
		type: 'Delete',
		actor: genLocalUserUri(config, user.id),
		object,
		published: new Date().toISOString(),
	};
}

function addActivityContext<T extends IObject>(config: Config, activity: T): T & { '@context': typeof CONTEXT; id: string } {
	if (activity.id == null) {
		activity.id = `${config.url}/${randomUUID()}`;
	}

	return Object.assign({ '@context': CONTEXT }, activity as T & { id: string });
}

function enqueueDeleteAccountJob(
	deps: Pick<DeleteAccountDependencies, 'dbQueue'>,
	user: DeleteAccountTarget,
	soft: boolean,
): void {
	void deps.dbQueue.add('deleteAccount', {
		user: { id: user.id },
		soft,
	}, {
		removeOnComplete: {
			age: 3600 * 24 * 7,
			count: 30,
		},
		removeOnFail: {
			age: 3600 * 24 * 7,
			count: 100,
		},
	});
}

export async function deleteAccountWithSideEffects(
	deps: DeleteAccountDependencies,
	user: DeleteAccountTarget,
	moderator?: Pick<MiUser, 'id'>,
): Promise<void> {
	if (deps.meta.rootUserId === user.id) throw new Error('cannot delete a root account');

	const fullUser = await fetchUserByIdOrFailFromDatabase(deps.db, user.id);

	if (user.host === null && fullUser.username.includes('.')) {
		throw new Error('cannot delete a system account');
	}

	if (moderator != null) {
		void logModerationEventInDatabase(deps, moderator, 'deleteAccount', {
			userId: user.id,
			userUsername: fullUser.username,
			userHost: user.host,
		});
	}

	if (user.host === null) {
		const localUser = { id: user.id, host: null } as const;
		const content = addActivityContext(deps.config, renderDelete(deps.config, genLocalUserUri(deps.config, localUser.id), localUser));
		const inboxes = await listSharedInboxesFromFollowingsInDatabase(deps.db);

		for (const inbox of inboxes) {
			enqueueDeliverJob(deps.deliverQueue, deps.config, localUser, content as IActivity, inbox, true);
		}

		enqueueDeleteAccountJob(deps, user, false);
	} else {
		enqueueDeleteAccountJob(deps, user, true);
	}

	await updateUserDeletedStateInDatabase(deps.db, user.id, true);

	deps.publishInternalEvent?.('userChangeDeletedState', { id: user.id, isDeleted: true });
}
