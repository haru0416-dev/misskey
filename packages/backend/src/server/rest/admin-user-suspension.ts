/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import type * as Bull from 'bullmq';
import { createDeliverJob } from '@/core/DeliverQueue.js';
import { enqueueInlineDbJobInOutbox, runInlineDbOutboxJob } from '@/core/QueueOutboxStore.js';
import {
	deleteFollowRequestsByFolloweeIdFromDatabase,
	deleteFollowRequestsByFollowerIdFromDatabase,
} from '@/core/FollowRequestStore.js';
import {
	listFollowingsForUnfollowByFollowerIdFromDatabase,
	listSharedInboxesFromFollowingsInDatabase,
} from '@/core/FollowingStore.js';
import { logModerationEventWithIdInDatabase } from '@/core/ModerationLogLogic.js';
import type { DbQueue, DeliverQueue, RelationshipQueue } from '@/core/queues.js';
import { updateUserSuspendedStateInDatabase, fetchUserByIdFromDatabase } from '@/core/UserStore.js';
import type { IActivity, IDelete, IObject } from '@/core/activitypub/type.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { queueRetentionOptions } from '@/queue/const.js';
import type { DbUserSuspensionPostEffectsJobData } from '@/queue/types.js';
import { addActivityContext, genLocalUserUri, renderUndo } from './following.js';
import { isHonoApiModerator } from './role-policy.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAdminUserSuspensionDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	deliverQueue: DeliverQueue;
	dbQueue: DbQueue;
	relationshipQueue: RelationshipQueue;
	publishInternalEvent?: <K extends 'userChangeSuspendedState'>(
		type: K,
		value: { id: MiUser['id']; isSuspended: MiUser['isSuspended'] },
	) => void;
};

export const adminUserSuspensionParamDef = z.object({
	userId: misskeyId(),
});

function renderDelete(config: Config, object: IObject | string, user: { id: MiUser['id']; host: null }): IDelete {
	return {
		type: 'Delete',
		actor: genLocalUserUri(config, user.id),
		object,
		published: new Date().toISOString(),
	};
}

function suspensionDeliveryJobId(prefix: string, userId: MiUser['id'], transitionId: string, inbox: string): string {
	const inboxHash = createHash('sha256').update(inbox).digest('hex').slice(0, 24);
	return `${prefix}-${userId}-${transitionId}-${inboxHash}`;
}

async function enqueueSharedInboxDelete(
	deps: HonoApiAdminUserSuspensionDependencies,
	user: MiUser,
	transitionedAt: string,
	transitionId: string,
): Promise<void> {
	if (user.host !== null) return;

	const localUser = user as MiUser & { host: null };
	const content = addActivityContext(
		deps.config,
		renderDelete(deps.config, genLocalUserUri(deps.config, localUser.id), localUser),
	);
	const inboxes = await listSharedInboxesFromFollowingsInDatabase(deps.db);

	for (const inbox of inboxes) {
		const job = createDeliverJob(deps.config, localUser, content as IActivity, inbox, true);
		if (job == null) continue;
		await deps.deliverQueue.add(
			job.name,
			{
				...job.data,
				userStateGuard: { userId: user.id, isSuspended: true, transitionedAt, transitionId },
			},
			{ ...job.opts, jobId: suspensionDeliveryJobId('suspend', user.id, transitionId, inbox) },
		);
	}
}

async function enqueueSharedInboxUndoDelete(
	deps: HonoApiAdminUserSuspensionDependencies,
	user: MiUser,
	transitionedAt: string,
	transitionId: string,
): Promise<void> {
	if (user.host !== null) return;

	const localUser = user as MiUser & { host: null };
	const content = addActivityContext(
		deps.config,
		renderUndo(
			deps.config,
			renderDelete(deps.config, genLocalUserUri(deps.config, localUser.id), localUser),
			localUser,
		),
	);
	const inboxes = await listSharedInboxesFromFollowingsInDatabase(deps.db);

	for (const inbox of inboxes) {
		const job = createDeliverJob(deps.config, localUser, content as IActivity, inbox, true);
		if (job == null) continue;
		await deps.deliverQueue.add(
			job.name,
			{
				...job.data,
				userStateGuard: { userId: user.id, isSuspended: false, transitionedAt, transitionId },
			},
			{ ...job.opts, jobId: suspensionDeliveryJobId('unsuspend', user.id, transitionId, inbox) },
		);
	}
}

async function enqueueUnfollowAllJobs(
	deps: HonoApiAdminUserSuspensionDependencies,
	follower: MiUser,
	transitionedAt: string,
	transitionId: string,
): Promise<void> {
	const followings = await listFollowingsForUnfollowByFollowerIdFromDatabase(deps.db, follower.id);
	const jobs = followings.map((following) => ({
		name: 'unfollow',
		data: {
			from: { id: following.followerId },
			to: { id: following.followeeId },
			silent: true,
			userStateGuard: { userId: follower.id, isSuspended: true, transitionedAt, transitionId },
		},
		opts: {
			...queueRetentionOptions(deps.config),
			jobId: `suspend-unfollow-${follower.id}-${transitionId}-${following.followeeId}`,
		},
	}));

	if (jobs.length > 0) {
		await deps.relationshipQueue.addBulk(jobs);
	}
}

async function postSuspend(
	deps: HonoApiAdminUserSuspensionDependencies,
	user: MiUser,
	transitionedAt: string,
	transitionId: string,
): Promise<void> {
	deps.publishInternalEvent?.('userChangeSuspendedState', { id: user.id, isSuspended: true });

	await enqueueSharedInboxDelete(deps, user, transitionedAt, transitionId);
}

async function postUnsuspend(
	deps: HonoApiAdminUserSuspensionDependencies,
	user: MiUser,
	transitionedAt: string,
	transitionId: string,
): Promise<void> {
	deps.publishInternalEvent?.('userChangeSuspendedState', { id: user.id, isSuspended: false });

	await enqueueSharedInboxUndoDelete(deps, user, transitionedAt, transitionId);
}

async function findSuspensionTarget(
	deps: HonoApiAdminUserSuspensionDependencies,
	body: Record<string, unknown>,
): Promise<MiUser> {
	const params = parseHonoApiParams(adminUserSuspensionParamDef, body);
	const user = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (user == null) {
		throw new Error('user not found');
	}

	return user;
}

export async function handleHonoQueueUserSuspensionPostEffects(
	deps: HonoApiAdminUserSuspensionDependencies,
	job: Bull.Job<DbUserSuspensionPostEffectsJobData>,
): Promise<void> {
	const user = await fetchUserByIdFromDatabase(deps.db, job.data.userId);
	if (
		user == null ||
		user.isSuspended !== job.data.isSuspended ||
		user.suspensionTransitionId !== job.data.transitionId
	) {
		return;
	}

	if (job.data.isSuspended) {
		await postSuspend(deps, user, job.data.transitionedAt, job.data.transitionId);
		await enqueueUnfollowAllJobs(deps, user, job.data.transitionedAt, job.data.transitionId);
	} else {
		await postUnsuspend(deps, user, job.data.transitionedAt, job.data.transitionId);
	}
}

async function changeSuspensionState(
	deps: HonoApiAdminUserSuspensionDependencies,
	me: MiLocalUser,
	user: MiUser,
	isSuspended: boolean,
): Promise<void> {
	const result = await deps.db.transaction(async (transaction) => {
		const tx = transaction as MiDrizzleDatabase;
		const { transitionedAt, transitionId } = await updateUserSuspendedStateInDatabase(tx, user.id, isSuspended);
		if (isSuspended) {
			await deleteFollowRequestsByFolloweeIdFromDatabase(tx, user.id);
			await deleteFollowRequestsByFollowerIdFromDatabase(tx, user.id);
		}
		await logModerationEventWithIdInDatabase(
			{ db: tx },
			me,
			isSuspended ? 'suspend' : 'unsuspend',
			{
				userId: user.id,
				userUsername: user.username,
				userHost: user.host,
			},
			transitionId,
		);
		const data = { userId: user.id, isSuspended, transitionedAt: transitionedAt.toISOString(), transitionId };
		const opts = {
			attempts: 12,
			backoff: { type: 'exponential', delay: 1000 },
			removeOnComplete: true,
			removeOnFail: false,
		} as const;
		const outboxJob = await enqueueInlineDbJobInOutbox(tx, 'userSuspensionPostEffects', data, opts);
		return { data, ...outboxJob };
	});

	try {
		await runInlineDbOutboxJob(deps.db, result, async (db) => {
			await handleHonoQueueUserSuspensionPostEffects({ ...deps, db }, {
				data: result.data,
			} as Bull.Job<DbUserSuspensionPostEffectsJobData>);
		});
	} catch {
		// The released row is picked up by the dispatcher on its next poll.
	}
}

export async function handleHonoApiAdminSuspendUser(
	deps: HonoApiAdminUserSuspensionDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const user = await findSuspensionTarget(deps, body);
	if (await isHonoApiModerator(deps, user)) {
		throw new Error('cannot suspend moderator account');
	}

	await changeSuspensionState(deps, me, user, true);
}

export async function handleHonoApiAdminUnsuspendUser(
	deps: HonoApiAdminUserSuspensionDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const user = await findSuspensionTarget(deps, body);
	await changeSuspensionState(deps, me, user, false);
}
