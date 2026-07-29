/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { enqueueDeliverJob } from '@/core/DeliverQueue.js';
import { listSharedInboxesFromFollowingsInDatabase } from '@/core/FollowingStore.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import { addDbJob, type DbQueue, type DeliverQueue } from '@/core/queues.js';
import { fetchUserByIdOrFailFromDatabase, updateUserDeletedStateInDatabase } from '@/core/UserStore.js';
import { CONTEXT } from '@/core/activitypub/misc/contexts.js';
import { enqueueDbJobInOutbox } from '@/core/QueueOutboxStore.js';
import type { IActivity, IDelete, IObject } from '@/core/activitypub/type.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta, MiUser } from '@/models/_.js';
import { queueRetentionOptions } from '@/queue/const.js';

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
	return `${config.instance.url}/users/${userId}`;
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
		activity.id = `${config.instance.url}/${randomUUID()}`;
	}

	return Object.assign({ '@context': CONTEXT }, activity as T & { id: string });
}

async function enqueueDeleteAccountJob(
	db: MiDrizzleDatabase,
	config: Pick<Config, 'queues'>,
	user: DeleteAccountTarget,
	soft: boolean,
): Promise<string> {
	return await enqueueDbJobInOutbox(db, 'deleteAccount', {
		user: { id: user.id },
		soft,
	}, queueRetentionOptions(config));
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

	let delivery: {
		localUser: { id: MiUser['id']; host: null };
		content: IActivity;
		inboxes: string[];
	} | null = null;
	if (user.host === null) {
		const localUser = { id: user.id, host: null } as const;
		const content = addActivityContext(deps.config, renderDelete(deps.config, genLocalUserUri(deps.config, localUser.id), localUser));
		const inboxes = await listSharedInboxesFromFollowingsInDatabase(deps.db);
		delivery = { localUser, content: content as IActivity, inboxes };
	}

	const outboxId = await deps.db.transaction(async transaction => {
		const tx = transaction as MiDrizzleDatabase;
		const id = await enqueueDeleteAccountJob(tx, deps.config, user, user.host !== null);
		await updateUserDeletedStateInDatabase(tx, user.id, true);
		if (moderator != null) {
			await logModerationEventInDatabase({ db: tx }, moderator, 'deleteAccount', {
				userId: user.id,
				userUsername: fullUser.username,
				userHost: user.host,
			});
		}
		return id;
	});

	if (delivery != null) {
		for (const inbox of delivery.inboxes) {
			enqueueDeliverJob(deps.deliverQueue, deps.config, delivery.localUser, delivery.content, inbox, true);
		}
	}

	void addDbJob(deps.dbQueue, {
		name: 'deleteAccount',
		data: {
			user: { id: user.id },
			soft: user.host !== null,
		},
		opts: {
			...queueRetentionOptions(deps.config),
			jobId: `outbox-${outboxId}`,
		},
	}).catch(() => {
		// The outbox dispatcher retries when the low-latency enqueue path is unavailable.
	});

	deps.publishInternalEvent?.('userChangeDeletedState', { id: user.id, isDeleted: true });
}
