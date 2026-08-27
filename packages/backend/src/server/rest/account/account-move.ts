/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';
import { z } from 'zod';
import { fetchOrCreateSystemAccountInDatabase } from '@/core/system-account/SystemAccountLogic.js';
import { assignRoleWithSideEffects, RoleAlreadyAssignedError } from '@/core/role/RoleLogic.js';
import { listRolesFromDatabase } from '@/core/role/RoleStore.js';
import { listRoleAssignmentsByUserIdFromDatabase } from '@/core/role/RoleAssignmentStore.js';
import { listBlockerIdsByBlockeeIdFromDatabase } from '@/core/user/BlockingStore.js';
import {
	createMutingsInDatabase,
	listActiveMutingsByMuteeIdFromDatabase,
	listPermanentMuterIdsByMuteeIdFromDatabase,
} from '@/core/user/MutingStore.js';
import {
	createUserListMembershipsInDatabase,
	listUserListMembershipsByUserIdFromDatabase,
} from '@/core/user/UserListMembershipStore.js';
import {
	decrementUsersFollowersCountInDatabase,
	decrementUsersFollowingCountInDatabase,
	fetchUserByIdOrFailFromDatabase,
	updateUserInDatabase,
} from '@/core/user/UserStore.js';
import {
	listAllFollowingsByFollowerIdFromDatabase,
	listLocalFollowerFollowingsByFolloweeIdFromDatabase,
} from '@/core/user/FollowingStore.js';
import type { RelationshipQueue } from '@/core/queue/queues.js';
import type { RelationshipJobData, ThinUser } from '@/queue/types.js';
import { queueRetentionOptions } from '@/queue/const.js';
import { genId } from '@/misc/id/gen-id.js';
import * as Acct from '@/misc/acct.js';
import Logger from '@/logger.js';
import type { Config } from '@/config.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { ApiError } from '../error.js';
import {
	addActivityContext,
	deliverNoteActivityForApi,
	deliverToRelaysForApi,
	renderUpdateForApi,
	type ApiNoteApDependencies,
	type ApiRelayDeliverDependencies,
} from '../activitypub/notes-ap.js';
import { onMoveAccountForApi } from '../antenna/antennas.js';
import { renderPersonForApi, type ApiAccountUpdateDependencies } from './account-update.js';
import { createRoleAssignedNotification, type ApiNotificationDependencies } from '../notification/notification.js';
import type { ApiRolePolicyDependencies } from '../role/role-policy.js';
import { packMeDetailedForApi, type MeDetailedApiResponse, type UserPackingDependencies } from '../user/user.js';
import { genLocalUserUri, type ApiFollowingDependencies } from '../user/following.js';
import { parseApiParams } from '../validation.js';
import { resolveUserForApi, type ApiApPersonDependencies } from '../activitypub/ap-person.js';

const accountMoveLogger = new Logger('account-move', 'yellow');

export type ApiAccountMoveDependencies = ApiRolePolicyDependencies &
	ApiFollowingDependencies &
	ApiNotificationDependencies &
	ApiNoteApDependencies &
	ApiRelayDeliverDependencies &
	ApiAccountUpdateDependencies &
	UserPackingDependencies & {
		relationshipQueue: RelationshipQueue;
	};

function iMoveDestinationAccountForbidsError(): ApiError {
	return new ApiError({
		status: 400,
		message: "Destination account doesn't have proper 'Known As' alias, or has already moved.",
		code: 'DESTINATION_ACCOUNT_FORBIDS',
		id: 'b5c90186-4ab0-49c8-9bba-a1f766282ba4',
	});
}
function iMoveRootForbiddenError(): ApiError {
	return new ApiError({
		status: 400,
		message: "The root can't migrate.",
		code: 'NOT_ROOT_FORBIDDEN',
		id: '4362e8dc-731f-4ad8-a694-be2a88922a24',
	});
}
function iMoveNoSuchUserError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such user.',
		code: 'NO_SUCH_USER',
		id: 'fcd2eef9-a9b2-4c4f-8624-038099e90aa5',
	});
}
function iMoveUriNullError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'User ActivityPup URI is null.',
		code: 'URI_NULL',
		id: 'bf326f31-d430-4f97-9933-5d61e4d48a23',
	});
}
function iMoveAlreadyMovedError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Account was already moved to another account.',
		code: 'ALREADY_MOVED',
		id: 'b234a14e-9ebe-4581-8000-074b3c215962',
	});
}

export const iMoveParamDef = z.object({
	moveToAccount: z.string(),
});

function getUserUriForApi(config: Pick<Config, 'instance'>, user: MiUser): string | null {
	return user.host != null ? user.uri : genLocalUserUri(config, user.id);
}

function toPunyForApi(host: string): string {
	return domainToASCII(host.toLowerCase());
}

async function resolveMoveDestinationUserForApi(deps: ApiAccountMoveDependencies, acct: string): Promise<MiUser> {
	const { username, host } = Acct.parse(acct);
	const normalizedHost =
		host == null || toPunyForApi(host) === toPunyForApi(deps.config.runtime.host) ? null : toPunyForApi(host);
	// 未知のリモートユーザーは WebFinger で解決する。
	// deps の型に ApiApPersonDependencies を混ぜると型エイリアスが循環参照になるため、呼び出し時にキャストする
	// (shell の実 deps は両方を満たす)
	return await resolveUserForApi(deps as unknown as ApiApPersonDependencies, username, normalizedHost).catch(() => {
		throw iMoveNoSuchUserError();
	});
}

function renderMoveForApi(
	config: Pick<Config, 'instance'>,
	src: { id: MiUser['id'] },
	dst: MiUser,
): Record<string, unknown> {
	const srcUri = genLocalUserUri(config, src.id);
	return {
		id: `${config.instance.url}/moves/${src.id}/${dst.id}`,
		actor: srcUri,
		type: 'Move',
		object: srcUri,
		target: getUserUriForApi(config, dst),
	};
}

async function enqueueRelationshipJobForApi(
	deps: ApiAccountMoveDependencies,
	name: 'follow' | 'unfollow' | 'block',
	rels: { from: ThinUser; to: ThinUser }[],
	opts: { delay?: number } = {},
): Promise<unknown> {
	if (rels.length === 0) return;

	const jobs = rels.map((rel) => ({
		name,
		data: {
			from: { id: rel.from.id },
			to: { id: rel.to.id },
		} satisfies RelationshipJobData,
		opts: {
			...(opts.delay === undefined ? {} : { delay: opts.delay }),
			...queueRetentionOptions(deps.config),
		},
	}));

	return await deps.relationshipQueue.addBulk(jobs);
}

async function copyBlockingForApi(deps: ApiAccountMoveDependencies, src: ThinUser, dst: ThinUser): Promise<void> {
	const [srcBlockerIds, dstBlockerIds] = await Promise.all([
		listBlockerIdsByBlockeeIdFromDatabase(deps.db, src.id),
		listBlockerIdsByBlockeeIdFromDatabase(deps.db, dst.id),
	]);
	const dstBlockerIdSet = new Set(dstBlockerIds);

	const blockJobs: { from: ThinUser; to: ThinUser }[] = [];
	for (const blockerId of srcBlockerIds) {
		if (dstBlockerIdSet.has(blockerId)) continue;
		blockJobs.push({ from: { id: blockerId }, to: { id: dst.id } });
	}
	await enqueueRelationshipJobForApi(deps, 'block', blockJobs);
}

async function copyMutingsForApi(deps: ApiAccountMoveDependencies, src: ThinUser, dst: ThinUser): Promise<void> {
	const oldMutings = await listActiveMutingsByMuteeIdFromDatabase(deps.db, src.id, new Date());
	if (oldMutings.length === 0) return;

	const existingMutingsMuterUserIds = await listPermanentMuterIdsByMuteeIdFromDatabase(deps.db, dst.id);
	const existingMutingsMuterUserIdSet = new Set(existingMutingsMuterUserIds);

	const newMutings = new Map<string, { muterId: string; muteeId: string; expiresAt: Date | null }>();
	const nextId = (): string => {
		let id: string;
		do {
			id = genId();
		} while (newMutings.has(id));
		return id;
	};
	for (const muting of oldMutings) {
		if (existingMutingsMuterUserIdSet.has(muting.muterId)) continue;
		newMutings.set(nextId(), {
			muterId: muting.muterId,
			muteeId: dst.id,
			expiresAt: muting.expiresAt,
		});
	}

	await createMutingsInDatabase(
		deps.db,
		Array.from(newMutings.entries()).map(([id, value]) => ({ id, ...value })),
	);
	for (const { muterId, muteeId } of newMutings.values()) {
		deps.publishInternalEvent?.('mute', { muterId, muteeId });
	}
}

async function copyRolesForApi(deps: ApiAccountMoveDependencies, src: ThinUser, dst: MiUser): Promise<void> {
	const oldRoleAssignments = await listRoleAssignmentsByUserIdFromDatabase(deps.db, src.id);
	if (oldRoleAssignments.length === 0) return;

	const now = Date.now();
	const activeOldRoleAssignments = oldRoleAssignments.filter((a) => a.expiresAt == null || a.expiresAt.getTime() > now);
	if (activeOldRoleAssignments.length === 0) return;

	const roles = await listRolesFromDatabase(deps.db);
	const roleById = new Map(roles.map((role) => [role.id, role]));
	for (const oldRoleAssignment of activeOldRoleAssignments) {
		const role = roleById.get(oldRoleAssignment.roleId);
		if (role == null) continue;
		if (!role.preserveAssignmentOnMoveAccount) continue;

		try {
			await assignRoleWithSideEffects(
				{
					db: deps.db,
					genId,
					publishInternalEvent: deps.publishInternalEvent,
					notifyRoleAssigned: (userId, _roleId, assignedRole) =>
						createRoleAssignedNotification(deps, userId, assignedRole),
				},
				{
					userId: dst.id,
					roleId: role.id,
					expiresAt: oldRoleAssignment.expiresAt,
				},
			);
		} catch (e) {
			if (e instanceof RoleAlreadyAssignedError) continue;
			throw e;
		}
	}
}

async function updateListsForApi(deps: ApiAccountMoveDependencies, src: ThinUser, dst: MiUser): Promise<void> {
	const oldMemberships = await listUserListMembershipsByUserIdFromDatabase(deps.db, src.id);
	if (oldMemberships.length === 0) return;

	const existingUserListIds = (await listUserListMembershipsByUserIdFromDatabase(deps.db, dst.id)).map(
		(m) => m.userListId,
	);
	const existingUserListIdSet = new Set(existingUserListIds);

	const newMemberships = new Map<string, { userId: string; userListId: string; userListUserId: string }>();
	const nextId = (): string => {
		let id: string;
		do {
			id = genId();
		} while (newMemberships.has(id));
		return id;
	};
	for (const membership of oldMemberships) {
		if (existingUserListIdSet.has(membership.userListId)) continue;
		newMemberships.set(nextId(), {
			userId: dst.id,
			userListId: membership.userListId,
			userListUserId: membership.userListUserId,
		});
	}

	await createUserListMembershipsInDatabase(
		deps.db,
		Array.from(newMemberships.entries()).map(([id, value]) => ({ id, ...value })),
	);

	if (dst.host != null) {
		const proxy = await fetchOrCreateSystemAccountInDatabase({ db: deps.db, meta: deps.meta, genId }, 'proxy');
		await enqueueRelationshipJobForApi(deps, 'follow', [{ from: { id: proxy.id }, to: { id: dst.id } }]);
	}
}

async function adjustFollowingCountsForApi(
	deps: ApiAccountMoveDependencies,
	localFollowerIds: string[],
	oldAccount: MiUser,
): Promise<void> {
	if (localFollowerIds.length === 0) return;

	await updateUserInDatabase(deps.db, oldAccount.id, { followersCount: 0, followingCount: 0 });
	await decrementUsersFollowingCountInDatabase(deps.db, localFollowerIds, 1);

	const oldFollowings = await listAllFollowingsByFollowerIdFromDatabase(deps.db, oldAccount.id);
	if (oldFollowings.length > 0) {
		await decrementUsersFollowersCountInDatabase(
			deps.db,
			oldFollowings.map((f) => f.followeeId),
			1,
		);
	}

	// この経路はリモートインスタンス統計と PerUserFollowingChart を更新しない。
	// フォロー・フォロワーカウントの実データ更新は上記で完了する。
}

async function moveFromLocalForApi(
	deps: ApiAccountMoveDependencies,
	src: MiLocalUser,
	dst: MiUser,
): Promise<MeDetailedApiResponse> {
	const dstUri = getUserUriForApi(deps.config, dst);
	if (dstUri == null) throw iMoveUriNullError();

	const alsoKnownAs = src.alsoKnownAs?.includes(dstUri)
		? src.alsoKnownAs
		: (src.alsoKnownAs?.concat([dstUri]) ?? [dstUri]);
	const movedAt = new Date();
	await updateUserInDatabase(deps.db, src.id, {
		alsoKnownAs: alsoKnownAs.join(','),
		movedToUri: dstUri,
		movedAt,
	});
	const updatedSrc: MiLocalUser = { ...src, alsoKnownAs, movedToUri: dstUri, movedAt };

	deps.publishInternalEvent?.('localUserUpdated', updatedSrc);

	const srcPerson = await renderPersonForApi(deps, updatedSrc);
	const updateAct = addActivityContext(deps.config, renderUpdateForApi(deps.config, srcPerson, updatedSrc));
	await deliverNoteActivityForApi(deps, updatedSrc, updateAct, { directRecipients: [], deliverToFollowers: true });
	// リレー配信は fire-and-forget とし、アカウント移行の完了を待たせない。
	void deliverToRelaysForApi(deps, { id: updatedSrc.id, host: null }, updateAct).catch(() => {});

	const moveAct = addActivityContext(deps.config, renderMoveForApi(deps.config, updatedSrc, dst));
	await deliverNoteActivityForApi(deps, updatedSrc, moveAct, { directRecipients: [], deliverToFollowers: true });

	const iObj = await packMeDetailedForApi(deps, updatedSrc, { includeSecrets: true });
	deps.publishMainStream?.(updatedSrc.id, 'meUpdated', iObj);

	const followings = await listAllFollowingsByFollowerIdFromDatabase(deps.db, updatedSrc.id);
	void enqueueRelationshipJobForApi(
		deps,
		'unfollow',
		followings.map((f) => ({
			from: { id: updatedSrc.id },
			to: { id: f.followeeId },
		})),
		{ delay: process.env['NODE_ENV'] === 'test' ? 10000 : 1000 * 60 * 60 * 24 },
	).catch(() => {});

	await postMoveProcessForApi(deps, updatedSrc, dst);

	return iObj;
}

/** ローカルからの引っ越しとリモートアクターの movedToUri 検知の両方から呼ぶ。 */
export async function postMoveProcessForApi(deps: ApiAccountMoveDependencies, src: MiUser, dst: MiUser): Promise<void> {
	// 個々のカスケードは独立しているので、1つ失敗しても残りは完走させる (Promise.all だと先頭の失敗で
	// 残りの結果が捨てられ、その rejection が unhandledRejection にしか残らない)。
	const cascades = [
		['copyBlocking', copyBlockingForApi(deps, src, dst)],
		['copyMutings', copyMutingsForApi(deps, src, dst)],
		['copyRoles', copyRolesForApi(deps, src, dst)],
		['updateLists', updateListsForApi(deps, src, dst)],
		['onMoveAccount', onMoveAccountForApi(deps, src, dst)],
	] as const;
	const results = await Promise.allSettled(cascades.map(([, promise]) => promise));
	for (const [index, result] of results.entries()) {
		if (result.status === 'rejected') {
			accountMoveLogger.error(`postMoveProcess: ${cascades[index]![0]} failed for ${src.id} -> ${dst.id}`, {
				error: result.reason,
			});
		}
	}

	const proxy = await fetchOrCreateSystemAccountInDatabase({ db: deps.db, meta: deps.meta, genId }, 'proxy');
	const followings = await listLocalFollowerFollowingsByFolloweeIdFromDatabase(deps.db, src.id, {
		excludeFollowerIds: [proxy.id],
	});
	const followJobs = followings.map((f) => ({ from: { id: f.followerId }, to: { id: dst.id } }));

	try {
		await adjustFollowingCountsForApi(
			deps,
			followJobs.map((job) => job.from.id),
			src,
		);
	} catch (error) {
		accountMoveLogger.error(`postMoveProcess: adjustFollowingCounts failed for ${src.id} -> ${dst.id}`, { error });
	}

	await enqueueRelationshipJobForApi(deps, 'follow', followJobs);
}

export async function handleApiIMove(
	deps: ApiAccountMoveDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<MeDetailedApiResponse> {
	const ps = parseApiParams(iMoveParamDef, body);

	if (!ps.moveToAccount) throw iMoveNoSuchUserError();
	if (deps.meta.rootUserId === me.id) throw iMoveRootForbiddenError();
	if (me.movedToUri) throw iMoveAlreadyMovedError();

	let moveTo = await resolveMoveDestinationUserForApi(deps, ps.moveToAccount);
	const destination = await fetchUserByIdOrFailFromDatabase(deps.db, moveTo.id);
	moveTo = destination;

	const fromUrl = genLocalUserUri(deps.config, me.id);
	let allowed = false;
	if (moveTo.alsoKnownAs) {
		for (const knownAs of moveTo.alsoKnownAs) {
			if (knownAs.includes(fromUrl)) {
				allowed = true;
				break;
			}
		}
	}

	if (!allowed || moveTo.movedToUri) throw iMoveDestinationAccountForbidsError();

	return await moveFromLocalForApi(deps, me, moveTo);
}
