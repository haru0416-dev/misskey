/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { createDeliverJob } from '@/core/DeliverQueue.js';
import { listSharedInboxesFromFollowingsInDatabase } from '@/core/FollowingStore.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import { addDbJob, type DbQueue, type DeliverQueue } from '@/core/queues.js';
import { fetchUserByIdOrFailFromDatabase, updateUserDeletedStateInDatabase } from '@/core/UserStore.js';
import { CONTEXT } from '@/core/activitypub/misc/contexts.js';
import { enqueueAccountDeleteCoordinatorInOutbox, enqueueDbJobInOutbox, enqueueDeliverJobsInOutbox, ensureAccountDeleteCoordinatorInOutbox } from '@/core/QueueOutboxStore.js';
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

function addActivityContext<T extends IObject>(config: Config, activity: T, id?: string): T & { '@context': typeof CONTEXT; id: string } {
	if (activity.id == null) {
		activity.id = id ?? `${config.instance.url}/${randomUUID()}`;
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
	coordinatorId?: string,
): Promise<void> {
	if (deps.meta.rootUserId === user.id) throw new Error('cannot delete a root account');

	const fullUser = await fetchUserByIdOrFailFromDatabase(deps.db, user.id);

	if (user.host === null && fullUser.username.includes('.')) {
		throw new Error('cannot delete a system account');
	}

	let deliveryJobs = [] as NonNullable<ReturnType<typeof createDeliverJob>>[];
	if (user.host === null) {
		const localUser = { id: user.id, host: null } as const;
		const content = addActivityContext(
			deps.config,
			renderDelete(deps.config, genLocalUserUri(deps.config, localUser.id), localUser),
			coordinatorId == null ? undefined : `${deps.config.instance.url}/activities/delete/${coordinatorId}`,
		);
		const inboxes = await listSharedInboxesFromFollowingsInDatabase(deps.db);
		deliveryJobs = inboxes.flatMap(inbox => {
			const job = createDeliverJob(deps.config, localUser, content as IActivity, inbox, true);
			return job == null ? [] : [job];
		});
	}

	const outbox = await deps.db.transaction(async transaction => {
		const tx = transaction as MiDrizzleDatabase;
		let dbJobId: string;
		if (user.host !== null) {
			dbJobId = await enqueueDeleteAccountJob(tx, deps.config, user, user.host !== null);
		} else {
			const data = { user: { id: user.id }, soft: false } as const;
			if (coordinatorId == null) {
				dbJobId = await enqueueAccountDeleteCoordinatorInOutbox(tx, data, queueRetentionOptions(deps.config));
				await enqueueDeliverJobsInOutbox(tx, deliveryJobs, dbJobId);
			} else {
				dbJobId = coordinatorId;
				if (await ensureAccountDeleteCoordinatorInOutbox(tx, dbJobId, data, queueRetentionOptions(deps.config))) {
					await enqueueDeliverJobsInOutbox(tx, deliveryJobs, dbJobId);
				}
			}
		}
		await updateUserDeletedStateInDatabase(tx, user.id, true);
		if (moderator != null) {
			await logModerationEventInDatabase({ db: tx }, moderator, 'deleteAccount', {
				userId: user.id,
				userUsername: fullUser.username,
				userHost: user.host,
			});
		}
		return { dbJobId, hasCoordinator: user.host === null };
	});

	if (!outbox.hasCoordinator) {
		void addDbJob(deps.dbQueue, {
			name: 'deleteAccount',
			data: {
				user: { id: user.id },
				soft: user.host !== null,
			},
			opts: {
				...queueRetentionOptions(deps.config),
				jobId: `outbox-${outbox.dbJobId}`,
			},
		}).catch(() => {
			// The outbox dispatcher retries when the low-latency enqueue path is unavailable.
		});
	}

	deps.publishInternalEvent?.('userChangeDeletedState', { id: user.id, isDeleted: true });
}
