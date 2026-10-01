/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fetchUserByIdOrFailFromDatabase } from '@/core/user/UserStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/user/UserProfileStore.js';
import {
	blockingExistsInDatabase,
	fetchBlockingByBlockerIdAndBlockeeIdFromDatabase,
} from '@/core/user/BlockingStore.js';
import { followingExistsInDatabase } from '@/core/user/FollowingStore.js';
import { deleteFollowRequestFromDatabase, followRequestExistsInDatabase } from '@/core/user/FollowRequestStore.js';
import { hasAcceptedFollowInDatabase } from '@/core/user/FollowAcceptanceStore.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { omitUndefined } from '@/misc/clone.js';
import type { IActivity } from '@/core/activitypub/type.js';
import { enqueueDeliverJob } from '@/core/queue/DeliverQueue.js';
import type { MiLocalUser, MiRemoteUser, MiUser } from '@/models/User.js';
import type { RelationshipJobData } from '@/queue/types.js';
import { blockForApi, unblockForApi, unfollow } from '@/server/rest/account/account-blocking.js';
import type { ApiAccountBlockingDependencies } from '@/server/rest/account/account-blocking.js';
import {
	addActivityContext,
	createFollowRequestWithSideEffects,
	deliverAcceptForFollow,
	insertFollowingWithSideEffects,
	isLocalUser,
	isRemoteUser,
	renderFollow,
	renderReject,
} from '@/server/rest/user/following.js';
import type { ApiFollowingDependencies } from '@/server/rest/user/following.js';
import { validateAlsoKnownAsForApi } from '@/server/rest/activitypub/ap-person.js';
import type { ApiApPersonDependencies } from '@/server/rest/activitypub/ap-person.js';

export type QueueRelationshipDependencies = ApiAccountBlockingDependencies &
	ApiFollowingDependencies &
	ApiApPersonDependencies;

function isSilencedHost(silencedHosts: string[] | undefined, host: string | null): boolean {
	if (!silencedHosts || host == null) {
		return false;
	}
	const normalizedHost = `.${host.toLowerCase()}`;
	return silencedHosts.some((x) => normalizedHost.endsWith(`.${x}`));
}

export async function followWithSideEffectsForApi(
	deps: QueueRelationshipDependencies,
	follower: MiLocalUser | MiRemoteUser,
	followee: MiLocalUser | MiRemoteUser,
	options: { requestId?: string; silent?: boolean; withReplies?: boolean } = {},
): Promise<string> {
	const { requestId, silent = false, withReplies } = options;

	if (isRemoteUser(follower) && isRemoteUser(followee)) {
		throw new Error('Remote user cannot follow remote user.');
	}

	const [blocking, blocked] = await Promise.all([
		blockingExistsInDatabase(deps.db, follower.id, followee.id),
		blockingExistsInDatabase(deps.db, followee.id, follower.id),
	]);

	if (
		isRemoteUser(follower) &&
		isLocalUser(followee) &&
		!blocked &&
		!followee.isSuspended &&
		(await hasAcceptedFollowInDatabase(deps.db, {
			actorUri: follower.uri,
			followeeId: followee.id,
			...(requestId == null ? {} : { requestId }),
		}))
	)
		return 'ok: follow activity already accepted';
	if (isRemoteUser(follower) && isLocalUser(followee) && (blocked || followee.isSuspended)) {
		// リモート側にアクターが残っていても、凍結中・ブロック中のフォロー要求は承認しない。
		const content = addActivityContext(
			deps.config,
			renderReject(deps.config, renderFollow(deps.config, follower, followee, requestId), followee),
		);
		enqueueDeliverJob(deps.deliverQueue, deps.config, followee, content as IActivity, follower.inbox, false);
		return followee.isSuspended ? 'rejected: suspended' : 'rejected: blocked';
	} else if (isRemoteUser(follower) && isLocalUser(followee) && blocking) {
		// リモート側のフォロー要求を解除の意思とみなし、このサーバーに残る相手からのブロック行を削除する。
		await unblockForApi(deps, follower, followee);
	} else {
		if (blocking) {
			throw new IdentifiableError('710e8fb0-b8c3-4922-be49-d5d93d8e6a6e', 'blocking');
		}
		if (blocked) {
			throw new IdentifiableError('3338392a-f764-498d-8855-db939dcf8c48', 'blocked');
		}
	}

	if (await followingExistsInDatabase(deps.db, follower.id, followee.id)) {
		if (isRemoteUser(follower) && isLocalUser(followee)) {
			// 既存の関係に対する別 ID の要求も、承認と配送登録を一度だけ確定する。
			await deliverAcceptForFollow(deps, follower, followee, requestId);
			return 'ok: already following';
		}
		if (isLocalUser(follower)) {
			throw new IdentifiableError('ec3f65c0-a9d1-47d9-8791-b2e7b9dcdced', 'already following');
		}
	}

	const followeeProfile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, followee.id);

	// 承認条件を確認する必要がある組み合わせでは、フォロー要求として保留する。
	if (
		followee.isLocked ||
		(followeeProfile.carefulBot && follower.isBot) ||
		(isLocalUser(follower) &&
			isRemoteUser(followee) &&
			process.env['FORCE_FOLLOW_REMOTE_USER_FOR_TESTING'] !== 'true') ||
		(isLocalUser(followee) && isRemoteUser(follower) && isSilencedHost(deps.meta.silencedHosts, follower.host))
	) {
		let autoAccept = false;

		// 鍵アカウントでも既存のフォロー関係があれば自動承認する。
		if (await followingExistsInDatabase(deps.db, follower.id, followee.id)) {
			autoAccept = true;
		}

		// autoAcceptFollowed はフォロー中の相手だけを自動承認する。
		if (!autoAccept && isLocalUser(followee) && followeeProfile.autoAcceptFollowed) {
			autoAccept = await followingExistsInDatabase(deps.db, followee.id, follower.id);
		}

		// 移行元からこの鍵アカウントへのフォロー関係があり、移行元・移行先の参照が一致する場合は自動承認する。
		if (!autoAccept && followee.isLocked) {
			autoAccept = !!(await validateAlsoKnownAsForApi(
				deps,
				follower,
				(_oldSrc, newSrc) => followingExistsInDatabase(deps.db, newSrc.id, followee.id),
				true,
			));
		}

		if (!autoAccept) {
			await createFollowRequestWithSideEffects(deps, follower, followee, withReplies, requestId);
			return 'ok: follow request created';
		}
	}

	try {
		await insertFollowingWithSideEffects(
			deps,
			follower,
			followee,
			omitUndefined({ withReplies, followeeProfile, silent, requestId }),
		);
	} catch (err) {
		if (isDuplicateKeyValueError(err) && isRemoteUser(follower) && isLocalUser(followee)) {
			await deliverAcceptForFollow(deps, follower, followee, requestId);
			if (await followRequestExistsInDatabase(deps.db, follower.id, followee.id)) {
				await deleteFollowRequestFromDatabase(deps.db, follower.id, followee.id);
			}
		} else {
			throw err;
		}
	}

	return 'ok';
}

export async function handleQueueRelationshipFollow(
	deps: QueueRelationshipDependencies,
	data: RelationshipJobData,
): Promise<string> {
	const [follower, followee] = (await Promise.all([
		fetchUserByIdOrFailFromDatabase(deps.db, data.from.id),
		fetchUserByIdOrFailFromDatabase(deps.db, data.to.id),
	])) as [MiLocalUser | MiRemoteUser, MiLocalUser | MiRemoteUser];

	return followWithSideEffectsForApi(
		deps,
		follower,
		followee,
		omitUndefined({
			requestId: data.requestId,
			silent: data.silent,
			withReplies: data.withReplies,
		}),
	);
}

export async function handleQueueRelationshipUnfollow(
	deps: QueueRelationshipDependencies,
	data: RelationshipJobData,
): Promise<string> {
	if (data.userStateGuard != null) {
		const guard = data.userStateGuard;
		const guardedUser = await fetchUserByIdOrFailFromDatabase(deps.db, guard.userId);
		if (guardedUser.isSuspended !== guard.isSuspended || guardedUser.suspensionTransitionId !== guard.transitionId) {
			return 'skip (stale user state)';
		}
	}
	const [follower, followee] = await Promise.all([
		fetchUserByIdOrFailFromDatabase(deps.db, data.from.id),
		fetchUserByIdOrFailFromDatabase(deps.db, data.to.id),
	]);

	await unfollow(deps, follower, followee, data.silent);

	return 'ok';
}

export async function handleQueueRelationshipBlock(
	deps: QueueRelationshipDependencies,
	data: RelationshipJobData,
): Promise<string> {
	const [blocker, blockee] = await Promise.all([
		fetchUserByIdOrFailFromDatabase(deps.db, data.from.id),
		fetchUserByIdOrFailFromDatabase(deps.db, data.to.id),
	]);

	await blockForApi(deps, blocker, blockee, data.silent);

	return 'ok';
}

export async function handleQueueRelationshipUnblock(
	deps: QueueRelationshipDependencies,
	data: RelationshipJobData,
): Promise<string> {
	const [blocker, blockee] = await Promise.all([
		fetchUserByIdOrFailFromDatabase(deps.db, data.from.id),
		fetchUserByIdOrFailFromDatabase(deps.db, data.to.id),
	]);

	const blocking = await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(deps.db, blocker.id, blockee.id);
	if (blocking == null) {
		return 'skip: not blocking';
	}

	await unblockForApi(deps, blocker, blockee);

	return 'ok';
}
