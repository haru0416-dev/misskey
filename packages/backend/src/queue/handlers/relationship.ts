/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Bull from 'bullmq';
import { fetchUserByIdOrFailFromDatabase } from '@/core/user/UserStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/user/UserProfileStore.js';
import {
	blockingExistsInDatabase,
	fetchBlockingByBlockerIdAndBlockeeIdFromDatabase,
} from '@/core/user/BlockingStore.js';
import { followingExistsInDatabase } from '@/core/user/FollowingStore.js';
import { deleteFollowRequestFromDatabase, followRequestExistsInDatabase } from '@/core/user/FollowRequestStore.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { omitUndefined } from '@/misc/clone.js';
import type { IActivity } from '@/core/activitypub/type.js';
import { enqueueDeliverJob } from '@/core/queue/DeliverQueue.js';
import type { MiLocalUser, MiRemoteUser, MiUser } from '@/models/User.js';
import type { RelationshipJobData } from '@/queue/types.js';
import {
	blockForHonoApi,
	unblockForHonoApi,
	unfollow,
	type HonoApiAccountBlockingDependencies,
} from '@/server/rest/account/account-blocking.js';
import {
	addActivityContext,
	createFollowRequestWithSideEffects,
	insertFollowingWithSideEffects,
	isLocalUser,
	isRemoteUser,
	renderAccept,
	renderFollow,
	renderReject,
	type HonoApiFollowingDependencies,
} from '@/server/rest/user/following.js';
import {
	validateAlsoKnownAsForHonoApi,
	type HonoApiApPersonDependencies,
} from '@/server/rest/activitypub/ap-person.js';

export type HonoQueueRelationshipDependencies = HonoApiAccountBlockingDependencies &
	HonoApiFollowingDependencies &
	HonoApiApPersonDependencies;

function isSilencedHost(silencedHosts: string[] | undefined, host: string | null): boolean {
	if (!silencedHosts || host == null) return false;
	return silencedHosts.some((x) => `.${host.toLowerCase()}`.endsWith(`.${x}`));
}

async function deliverAcceptFollowActivity(
	deps: HonoQueueRelationshipDependencies,
	follower: MiUser,
	followee: MiUser,
	requestId?: string,
): Promise<void> {
	if (!isRemoteUser(follower) || !isLocalUser(followee)) return;

	const content = addActivityContext(
		deps.config,
		renderAccept(deps.config, renderFollow(deps.config, follower, followee, requestId), followee),
	);
	enqueueDeliverJob(deps.deliverQueue, deps.config, followee, content as IActivity, follower.inbox, false);
}

export async function followWithSideEffectsForHonoApi(
	deps: HonoQueueRelationshipDependencies,
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

	if (isRemoteUser(follower) && isLocalUser(followee) && blocked) {
		// リモートフォローを受けてブロックしていた場合は、エラーにするのではなくRejectを送り返しておしまい。
		const content = addActivityContext(
			deps.config,
			renderReject(deps.config, renderFollow(deps.config, follower, followee, requestId), followee),
		);
		enqueueDeliverJob(deps.deliverQueue, deps.config, followee, content as IActivity, follower.inbox, false);
		return 'rejected: blocked';
	} else if (isRemoteUser(follower) && isLocalUser(followee) && blocking) {
		// リモートフォローを受けてブロックされているはずの場合だったら、ブロック解除しておく。
		await unblockForHonoApi(deps, followee, follower);
	} else {
		if (blocking) throw new IdentifiableError('710e8fb0-b8c3-4922-be49-d5d93d8e6a6e', 'blocking');
		if (blocked) throw new IdentifiableError('3338392a-f764-498d-8855-db939dcf8c48', 'blocked');
	}

	if (await followingExistsInDatabase(deps.db, follower.id, followee.id)) {
		// すでにフォロー関係が存在している場合
		if (isRemoteUser(follower) && isLocalUser(followee)) {
			// リモート → ローカル: acceptを送り返しておしまい
			await deliverAcceptFollowActivity(deps, follower, followee, requestId);
			return 'ok: already following';
		}
		if (isLocalUser(follower)) {
			// ローカル → リモート/ローカル: 例外
			throw new IdentifiableError('ec3f65c0-a9d1-47d9-8791-b2e7b9dcdced', 'already following');
		}
	}

	const followeeProfile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, followee.id);

	// フォロー対象が鍵アカウントである or
	// フォロワーがBotであり、フォロー対象がBotからのフォローに慎重である or
	// フォロワーがローカルユーザーであり、フォロー対象がリモートユーザーである or
	// フォロワーがローカルユーザーであり、フォロー対象がサイレンスされているサーバーである
	// 上記のいずれかに当てはまる場合はすぐフォローせずにフォローリクエストを発行しておく
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

		// フォローしているユーザーは自動承認オプション
		if (!autoAccept && isLocalUser(followee) && followeeProfile.autoAcceptFollowed) {
			autoAccept = await followingExistsInDatabase(deps.db, followee.id, follower.id);
		}

		// フォロワーが移行済みアカウントで、非公開のフォロー先が旧アカウントを承認済みなら自動承認する。
		if (!autoAccept && followee.isLocked) {
			autoAccept = !!(await validateAlsoKnownAsForHonoApi(
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
			omitUndefined({ withReplies, followeeProfile, silent }),
		);
	} catch (err) {
		if (isDuplicateKeyValueError(err) && isRemoteUser(follower) && isLocalUser(followee)) {
			if (await followRequestExistsInDatabase(deps.db, follower.id, followee.id)) {
				await deleteFollowRequestFromDatabase(deps.db, follower.id, followee.id);
			}
		} else {
			throw err;
		}
	}

	if (isRemoteUser(follower) && isLocalUser(followee)) {
		await deliverAcceptFollowActivity(deps, follower, followee, requestId);
	}

	return 'ok';
}

export async function handleHonoQueueRelationshipFollow(
	deps: HonoQueueRelationshipDependencies,
	job: Bull.Job<RelationshipJobData>,
): Promise<string> {
	const [follower, followee] = (await Promise.all([
		fetchUserByIdOrFailFromDatabase(deps.db, job.data.from.id),
		fetchUserByIdOrFailFromDatabase(deps.db, job.data.to.id),
	])) as [MiLocalUser | MiRemoteUser, MiLocalUser | MiRemoteUser];

	return followWithSideEffectsForHonoApi(
		deps,
		follower,
		followee,
		omitUndefined({
			requestId: job.data.requestId,
			silent: job.data.silent,
			withReplies: job.data.withReplies,
		}),
	);
}

export async function handleHonoQueueRelationshipUnfollow(
	deps: HonoQueueRelationshipDependencies,
	job: Bull.Job<RelationshipJobData>,
): Promise<string> {
	if (job.data.userStateGuard != null) {
		const guard = job.data.userStateGuard;
		const guardedUser = await fetchUserByIdOrFailFromDatabase(deps.db, guard.userId);
		if (guardedUser.isSuspended !== guard.isSuspended || guardedUser.suspensionTransitionId !== guard.transitionId) {
			return 'skip (stale user state)';
		}
	}
	const [follower, followee] = await Promise.all([
		fetchUserByIdOrFailFromDatabase(deps.db, job.data.from.id),
		fetchUserByIdOrFailFromDatabase(deps.db, job.data.to.id),
	]);

	await unfollow(deps, follower, followee, job.data.silent);

	return 'ok';
}

export async function handleHonoQueueRelationshipBlock(
	deps: HonoQueueRelationshipDependencies,
	job: Bull.Job<RelationshipJobData>,
): Promise<string> {
	const [blocker, blockee] = await Promise.all([
		fetchUserByIdOrFailFromDatabase(deps.db, job.data.from.id),
		fetchUserByIdOrFailFromDatabase(deps.db, job.data.to.id),
	]);

	await blockForHonoApi(deps, blocker, blockee, job.data.silent);

	return 'ok';
}

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

	await unblockForHonoApi(deps, blocker, blockee);

	return 'ok';
}
