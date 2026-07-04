/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Bull from 'bullmq';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { createBlockingInDatabase, deleteBlockingByIdFromDatabase, fetchBlockingByBlockerIdAndBlockeeIdFromDatabase } from '@/core/BlockingStore.js';
import { genId } from '@/misc/id/gen-id.js';
import type { MiBlocking } from '@/models/Blocking.js';
import type { MiUser } from '@/models/User.js';
import type { RelationshipJobData } from '@/queue/types.js';
import {
	cancelFollowRequest,
	deliverBlockActivity,
	deliverUndoBlockActivity,
	refreshUserBlockedCache,
	refreshUserBlockingCache,
	removeFromList,
	unfollow,
	type HonoApiAccountBlockingDependencies,
} from './hono-api-account-blocking.js';

export type HonoQueueRelationshipDependencies = HonoApiAccountBlockingDependencies;

/** UserFollowingService.unfollow 相当 (RelationshipProcessorService.processUnfollow から呼ばれる)。 */
export async function handleHonoQueueRelationshipUnfollow(
	deps: HonoQueueRelationshipDependencies,
	job: Bull.Job<RelationshipJobData>,
): Promise<string> {
	const [follower, followee] = await Promise.all([
		fetchUserByIdOrFailFromDatabase(deps.db, job.data.from.id),
		fetchUserByIdOrFailFromDatabase(deps.db, job.data.to.id),
	]);

	await unfollow(deps, follower, followee, job.data.silent);

	return 'ok';
}

/** UserBlockingService.block 相当。 */
export async function handleHonoQueueRelationshipBlock(
	deps: HonoQueueRelationshipDependencies,
	job: Bull.Job<RelationshipJobData>,
): Promise<string> {
	const [blocker, blockee] = await Promise.all([
		fetchUserByIdOrFailFromDatabase(deps.db, job.data.from.id),
		fetchUserByIdOrFailFromDatabase(deps.db, job.data.to.id),
	]);

	await Promise.all([
		cancelFollowRequest(deps, blocker, blockee, job.data.silent),
		cancelFollowRequest(deps, blockee, blocker, job.data.silent),
		unfollow(deps, blocker, blockee, job.data.silent),
		unfollow(deps, blockee, blocker, job.data.silent),
		removeFromList(deps, blockee, blocker),
	]);

	const blocking = await createBlockingInDatabase(deps.db, {
		id: genId(deps.config),
		blockerId: blocker.id,
		blockeeId: blockee.id,
	}) as MiBlocking & { blocker: MiUser; blockee: MiUser };
	blocking.blocker = blocker;
	blocking.blockee = blockee;

	await Promise.all([
		refreshUserBlockingCache(deps, blocker.id),
		refreshUserBlockedCache(deps, blockee.id),
	]);
	deps.publishInternalEvent?.('blockingCreated', { blockerId: blocker.id, blockeeId: blockee.id });
	await deliverBlockActivity(deps, blocking);

	return 'ok';
}

/** UserBlockingService.unblock 相当。 */
export async function handleHonoQueueRelationshipUnblock(
	deps: HonoQueueRelationshipDependencies,
	job: Bull.Job<RelationshipJobData>,
): Promise<string> {
	const [blocker, blockee] = await Promise.all([
		fetchUserByIdOrFailFromDatabase(deps.db, job.data.from.id),
		fetchUserByIdOrFailFromDatabase(deps.db, job.data.to.id),
	]);

	const blocking = await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, blocker.id, blockee.id);
	if (blocking == null) {
		// ブロック解除がリクエストされましたがブロックしていませんでした
		return 'skip: not blocking';
	}
	const blockingWithUsers = blocking as MiBlocking & { blocker: MiUser; blockee: MiUser };
	blockingWithUsers.blocker = blocker;
	blockingWithUsers.blockee = blockee;

	await deleteBlockingByIdFromDatabase(deps.db, blocking.id);
	await Promise.all([
		refreshUserBlockingCache(deps, blocker.id),
		refreshUserBlockedCache(deps, blockee.id),
	]);
	deps.publishInternalEvent?.('blockingDeleted', { blockerId: blocker.id, blockeeId: blockee.id });
	await deliverUndoBlockActivity(deps, blockingWithUsers);

	return 'ok';
}
