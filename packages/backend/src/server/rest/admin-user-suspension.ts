/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { enqueueDeliverJob } from '@/core/DeliverQueue.js';
import { deleteFollowRequestsByFolloweeIdFromDatabase, deleteFollowRequestsByFollowerIdFromDatabase } from '@/core/FollowRequestStore.js';
import { listFollowingsForUnfollowByFollowerIdFromDatabase, listSharedInboxesFromFollowingsInDatabase } from '@/core/FollowingStore.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import type { DeliverQueue, RelationshipQueue } from '@/core/QueueModule.js';
import { updateUserSuspendedStateInDatabase, fetchUserByIdFromDatabase } from '@/core/UserStore.js';
import { CONTEXT } from '@/core/activitypub/misc/contexts.js';
import type { IActivity, IDelete, IObject, IUndo } from '@/core/activitypub/type.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { SchemaType } from '@/misc/json-schema.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { RelationshipJobData } from '@/queue/types.js';
import { isHonoApiModerator } from './role-policy.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAdminUserSuspensionDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	deliverQueue: DeliverQueue;
	relationshipQueue: RelationshipQueue;
	publishInternalEvent?: <K extends 'userChangeSuspendedState'>(type: K, value: { id: MiUser['id']; isSuspended: MiUser['isSuspended'] }) => void;
};

const adminUserSuspensionParamDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;

type AdminUserSuspensionParams = SchemaType<typeof adminUserSuspensionParamDef>;

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

function renderUndo(config: Config, object: string | IObject, user: { id: MiUser['id'] }): IUndo {
	const id = typeof object !== 'string' && typeof object.id === 'string' && object.id.startsWith(config.url) ? `${object.id}/undo` : undefined;

	return {
		type: 'Undo',
		...(id ? { id } : {}),
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

async function enqueueSharedInboxDelete(
	deps: HonoApiAdminUserSuspensionDependencies,
	user: MiUser,
): Promise<void> {
	if (user.host !== null) return;

	const localUser = user as MiUser & { host: null };
	const content = addActivityContext(deps.config, renderDelete(deps.config, genLocalUserUri(deps.config, localUser.id), localUser));
	const inboxes = await listSharedInboxesFromFollowingsInDatabase(deps.db);

	for (const inbox of inboxes) {
		enqueueDeliverJob(deps.deliverQueue, deps.config, localUser, content as IActivity, inbox, true);
	}
}

async function enqueueSharedInboxUndoDelete(
	deps: HonoApiAdminUserSuspensionDependencies,
	user: MiUser,
): Promise<void> {
	if (user.host !== null) return;

	const localUser = user as MiUser & { host: null };
	const content = addActivityContext(deps.config, renderUndo(
		deps.config,
		renderDelete(deps.config, genLocalUserUri(deps.config, localUser.id), localUser),
		localUser,
	));
	const inboxes = await listSharedInboxesFromFollowingsInDatabase(deps.db);

	for (const inbox of inboxes) {
		enqueueDeliverJob(deps.deliverQueue, deps.config, localUser, content as IActivity, inbox, true);
	}
}

async function enqueueUnfollowAllJobs(
	deps: HonoApiAdminUserSuspensionDependencies,
	follower: MiUser,
): Promise<void> {
	const followings = await listFollowingsForUnfollowByFollowerIdFromDatabase(deps.db, follower.id);
	const jobs = followings.map<{
		name: 'unfollow';
		data: RelationshipJobData;
		opts: {
			removeOnComplete: { age: number; count: number };
			removeOnFail: { age: number; count: number };
		};
	}>(following => ({
		name: 'unfollow',
		data: {
			from: { id: following.followerId },
			to: { id: following.followeeId },
			silent: true,
		},
		opts: {
			removeOnComplete: {
				age: 3600 * 24 * 7,
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7,
				count: 100,
			},
		},
	}));

	if (jobs.length > 0) {
		await deps.relationshipQueue.addBulk(jobs);
	}
}

async function postSuspend(
	deps: HonoApiAdminUserSuspensionDependencies,
	user: MiUser,
): Promise<void> {
	deps.publishInternalEvent?.('userChangeSuspendedState', { id: user.id, isSuspended: true });

	void deleteFollowRequestsByFolloweeIdFromDatabase(deps.db, user.id);
	void deleteFollowRequestsByFollowerIdFromDatabase(deps.db, user.id);

	await enqueueSharedInboxDelete(deps, user);
}

async function postUnsuspend(
	deps: HonoApiAdminUserSuspensionDependencies,
	user: MiUser,
): Promise<void> {
	deps.publishInternalEvent?.('userChangeSuspendedState', { id: user.id, isSuspended: false });

	await enqueueSharedInboxUndoDelete(deps, user);
}

async function findSuspensionTarget(
	deps: HonoApiAdminUserSuspensionDependencies,
	body: Record<string, unknown>,
): Promise<MiUser> {
	const params = parseHonoApiParams(adminUserSuspensionParamDef, body) as AdminUserSuspensionParams;
	const user = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (user == null) {
		throw new Error('user not found');
	}

	return user;
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

	await updateUserSuspendedStateInDatabase(deps.db, user.id, true);

	void logModerationEventInDatabase(deps, me, 'suspend', {
		userId: user.id,
		userUsername: user.username,
		userHost: user.host,
	});

	void (async () => {
		await postSuspend(deps, user).catch(() => {});
		await enqueueUnfollowAllJobs(deps, user).catch(() => {});
	})();
}

export async function handleHonoApiAdminUnsuspendUser(
	deps: HonoApiAdminUserSuspensionDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const user = await findSuspensionTarget(deps, body);
	await updateUserSuspendedStateInDatabase(deps.db, user.id, false);

	void logModerationEventInDatabase(deps, me, 'unsuspend', {
		userId: user.id,
		userUsername: user.username,
		userHost: user.host,
	});

	void postUnsuspend(deps, user).catch(() => {});
}
