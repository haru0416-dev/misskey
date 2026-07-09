/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';
import { z } from 'zod';
import { fetchOrCreateSystemAccountInDatabase } from '@/core/SystemAccountLogic.js';
import { assignRoleWithSideEffects, RoleAlreadyAssignedError } from '@/core/RoleLogic.js';
import { listRolesFromDatabase } from '@/core/RoleStore.js';
import { listRoleAssignmentsByUserIdFromDatabase } from '@/core/RoleAssignmentStore.js';
import { listBlockerIdsByBlockeeIdFromDatabase } from '@/core/BlockingStore.js';
import { createMutingsInDatabase, listActiveMutingsByMuteeIdFromDatabase, listPermanentMuterIdsByMuteeIdFromDatabase } from '@/core/MutingStore.js';
import { createUserListMembershipsInDatabase, listUserListMembershipsByUserIdFromDatabase } from '@/core/UserListMembershipStore.js';
import {
	decrementUsersFollowersCountInDatabase,
	decrementUsersFollowingCountInDatabase,
	fetchUserByIdOrFailFromDatabase,
	fetchUserByUsernameAndHostFromDatabase,
	updateUserInDatabase,
} from '@/core/UserStore.js';
import { listAllFollowingsByFollowerIdFromDatabase, listLocalFollowerFollowingsByFolloweeIdFromDatabase } from '@/core/FollowingStore.js';
import type { RelationshipQueue } from '@/core/queues.js';
import type { RelationshipJobData, ThinUser } from '@/queue/types.js';
import { genId } from '@/misc/id/gen-id.js';
import * as Acct from '@/misc/acct.js';
import type { Config } from '@/config.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { HonoApiError } from './error.js';
import { addActivityContext, deliverNoteActivityForHonoApi, deliverToRelaysForHonoApi, renderUpdateForHonoApi, type HonoApiNoteApDependencies, type HonoApiRelayDeliverDependencies } from './notes-ap.js';
import { onMoveAccountForHonoApi } from './antennas.js';
import { renderPersonForHonoApi, type HonoApiAccountUpdateDependencies } from './account-update.js';
import { createRoleAssignedNotification, type HonoApiNotificationDependencies } from './notification.js';
import type { HonoApiRolePolicyDependencies } from './role-policy.js';
import { packMeDetailedForHonoApi, type MeDetailedHonoApiResponse, type UserPackingDependencies } from './user.js';
import { genLocalUserUri, type HonoApiFollowingDependencies } from './following.js';
import { parseHonoApiParams } from './validation.js';
import { resolveUserForHonoApi, type HonoApiApPersonDependencies } from './ap-person.js';

export type HonoApiAccountMoveDependencies =
	HonoApiRolePolicyDependencies &
	HonoApiFollowingDependencies &
	HonoApiNotificationDependencies &
	HonoApiNoteApDependencies &
	HonoApiRelayDeliverDependencies &
	HonoApiAccountUpdateDependencies &
	UserPackingDependencies & {
		relationshipQueue: RelationshipQueue;
	};

function iMoveDestinationAccountForbidsError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Destination account doesn\'t have proper \'Known As\' alias, or has already moved.', code: 'DESTINATION_ACCOUNT_FORBIDS', id: 'b5c90186-4ab0-49c8-9bba-a1f766282ba4' });
}
function iMoveRootForbiddenError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'The root can\'t migrate.', code: 'NOT_ROOT_FORBIDDEN', id: '4362e8dc-731f-4ad8-a694-be2a88922a24' });
}
function iMoveNoSuchUserError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such user.', code: 'NO_SUCH_USER', id: 'fcd2eef9-a9b2-4c4f-8624-038099e90aa5' });
}
function iMoveUriNullError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'User ActivityPup URI is null.', code: 'URI_NULL', id: 'bf326f31-d430-4f97-9933-5d61e4d48a23' });
}
function iMoveAlreadyMovedError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Account was already moved to another account.', code: 'ALREADY_MOVED', id: 'b234a14e-9ebe-4581-8000-074b3c215962' });
}

export const iMoveParamDef = z.object({
	moveToAccount: z.string(),
});

type IMoveParams = {
	moveToAccount: string;
};

function getUserUriForHonoApi(config: Pick<Config, 'url'>, user: MiUser): string | null {
	return user.host != null ? user.uri : genLocalUserUri(config, user.id);
}

function toPunyForHonoApi(host: string): string {
	return domainToASCII(host.toLowerCase());
}

async function resolveMoveDestinationUserForHonoApi(deps: HonoApiAccountMoveDependencies, acct: string): Promise<MiUser> {
	const { username, host } = Acct.parse(acct);
	const normalizedHost = host == null || toPunyForHonoApi(host) === toPunyForHonoApi(deps.config.host) ? null : toPunyForHonoApi(host);
	// 原典は RemoteUserResolveService.resolveUser — 未知のリモートユーザーはWebFingerで解決する
	// deps の型に HonoApiApPersonDependencies を混ぜると型エイリアスが循環参照になるため、呼び出し時にキャストする
	// (shell の実 deps は両方を満たす)
	return await resolveUserForHonoApi(deps as unknown as HonoApiApPersonDependencies, username, normalizedHost).catch(() => {
		throw iMoveNoSuchUserError();
	});
}

function renderMoveForHonoApi(config: Pick<Config, 'url'>, src: { id: MiUser['id'] }, dst: MiUser): Record<string, unknown> {
	const srcUri = genLocalUserUri(config, src.id);
	return {
		id: `${config.url}/moves/${src.id}/${dst.id}`,
		actor: srcUri,
		type: 'Move',
		object: srcUri,
		target: getUserUriForHonoApi(config, dst),
	};
}

async function enqueueRelationshipJobForHonoApi(
	deps: HonoApiAccountMoveDependencies,
	name: 'follow' | 'unfollow' | 'block',
	rels: { from: ThinUser; to: ThinUser }[],
	opts: { delay?: number } = {},
): Promise<unknown> {
	if (rels.length === 0) return;

	const jobs = rels.map(rel => ({
		name,
		data: {
			from: { id: rel.from.id },
			to: { id: rel.to.id },
		} satisfies RelationshipJobData,
		opts: {
			delay: opts.delay,
			removeOnComplete: { age: 3600 * 24 * 7, count: 30 },
			removeOnFail: { age: 3600 * 24 * 7, count: 100 },
		},
	}));

	return await deps.relationshipQueue.addBulk(jobs);
}

async function copyBlockingForHonoApi(deps: HonoApiAccountMoveDependencies, src: ThinUser, dst: ThinUser): Promise<void> {
	const srcBlockerIds = await listBlockerIdsByBlockeeIdFromDatabase(deps.db, src.id);
	const dstBlockerIds = await listBlockerIdsByBlockeeIdFromDatabase(deps.db, dst.id);

	const blockJobs: { from: ThinUser; to: ThinUser }[] = [];
	for (const blockerId of srcBlockerIds) {
		if (dstBlockerIds.includes(blockerId)) continue;
		blockJobs.push({ from: { id: blockerId }, to: { id: dst.id } });
	}
	await enqueueRelationshipJobForHonoApi(deps, 'block', blockJobs);
}

async function copyMutingsForHonoApi(deps: HonoApiAccountMoveDependencies, src: ThinUser, dst: ThinUser): Promise<void> {
	const oldMutings = await listActiveMutingsByMuteeIdFromDatabase(deps.db, src.id, new Date());
	if (oldMutings.length === 0) return;

	const existingMutingsMuterUserIds = await listPermanentMuterIdsByMuteeIdFromDatabase(deps.db, dst.id);

	const newMutings = new Map<string, { muterId: string; muteeId: string; expiresAt: Date | null }>();
	const nextId = (): string => {
		let id: string;
		do {
			id = genId();
		} while (newMutings.has(id));
		return id;
	};
	for (const muting of oldMutings) {
		if (existingMutingsMuterUserIds.includes(muting.muterId)) continue;
		newMutings.set(nextId(), {
			muterId: muting.muterId,
			muteeId: dst.id,
			expiresAt: muting.expiresAt,
		});
	}

	await createMutingsInDatabase(deps.db, Array.from(newMutings.entries()).map(([id, value]) => ({ id, ...value })));
}

async function copyRolesForHonoApi(deps: HonoApiAccountMoveDependencies, src: ThinUser, dst: MiUser): Promise<void> {
	const [oldRoleAssignments, roles] = await Promise.all([
		listRoleAssignmentsByUserIdFromDatabase(deps.db, src.id),
		listRolesFromDatabase(deps.db),
	]);
	if (oldRoleAssignments.length === 0) return;

	const now = Date.now();
	for (const oldRoleAssignment of oldRoleAssignments.filter(a => a.expiresAt == null || a.expiresAt.getTime() > now)) {
		const role = roles.find(r => r.id === oldRoleAssignment.roleId);
		if (role == null) continue;
		if (!role.preserveAssignmentOnMoveAccount) continue;

		try {
			await assignRoleWithSideEffects({
				db: deps.db,
				genId,
				publishInternalEvent: deps.publishInternalEvent,
				notifyRoleAssigned: (userId, _roleId, assignedRole) => createRoleAssignedNotification(deps, userId, assignedRole),
			}, {
				userId: dst.id,
				roleId: role.id,
				expiresAt: oldRoleAssignment.expiresAt,
			});
		} catch (e) {
			if (e instanceof RoleAlreadyAssignedError) continue;
			throw e;
		}
	}
}

async function updateListsForHonoApi(deps: HonoApiAccountMoveDependencies, src: ThinUser, dst: MiUser): Promise<void> {
	const oldMemberships = await listUserListMembershipsByUserIdFromDatabase(deps.db, src.id);
	if (oldMemberships.length === 0) return;

	const existingUserListIds = (await listUserListMembershipsByUserIdFromDatabase(deps.db, dst.id)).map(m => m.userListId);

	const newMemberships = new Map<string, { userId: string; userListId: string; userListUserId: string }>();
	const nextId = (): string => {
		let id: string;
		do {
			id = genId();
		} while (newMemberships.has(id));
		return id;
	};
	for (const membership of oldMemberships) {
		if (existingUserListIds.includes(membership.userListId)) continue;
		newMemberships.set(nextId(), {
			userId: dst.id,
			userListId: membership.userListId,
			userListUserId: membership.userListUserId,
		});
	}

	await createUserListMembershipsInDatabase(deps.db, Array.from(newMemberships.entries()).map(([id, value]) => ({ id, ...value })));

	if (dst.host != null) {
		const proxy = await fetchOrCreateSystemAccountInDatabase({ db: deps.db, meta: deps.meta, genId }, 'proxy');
		await enqueueRelationshipJobForHonoApi(deps, 'follow', [{ from: { id: proxy.id }, to: { id: dst.id } }]);
	}
}

async function adjustFollowingCountsForHonoApi(deps: HonoApiAccountMoveDependencies, localFollowerIds: string[], oldAccount: MiUser): Promise<void> {
	if (localFollowerIds.length === 0) return;

	await updateUserInDatabase(deps.db, oldAccount.id, { followersCount: 0, followingCount: 0 });
	await decrementUsersFollowingCountInDatabase(deps.db, localFollowerIds, 1);

	const oldFollowings = await listAllFollowingsByFollowerIdFromDatabase(deps.db, oldAccount.id);
	if (oldFollowings.length > 0) {
		await decrementUsersFollowersCountInDatabase(deps.db, oldFollowings.map(f => f.followeeId), 1);
	}

	// リモートインスタンスの統計更新 (enableStatsForFederatedInstances 有効時) とチャート更新
	// (PerUserFollowingChart) は hono 側にチャートライターが未移植のため見送り。
	// フォロー/フォロワーカウントの実データ更新は上記で完了しており、チャートは補助的な集計のみ。
}

async function moveFromLocalForHonoApi(deps: HonoApiAccountMoveDependencies, src: MiLocalUser, dst: MiUser): Promise<MeDetailedHonoApiResponse> {
	const dstUri = getUserUriForHonoApi(deps.config, dst);
	if (dstUri == null) throw iMoveUriNullError();

	const alsoKnownAs = src.alsoKnownAs?.includes(dstUri) ? src.alsoKnownAs : (src.alsoKnownAs?.concat([dstUri]) ?? [dstUri]);
	const movedAt = new Date();
	await updateUserInDatabase(deps.db, src.id, {
		alsoKnownAs: alsoKnownAs.join(','),
		movedToUri: dstUri,
		movedAt,
	});
	const updatedSrc: MiLocalUser = { ...src, alsoKnownAs, movedToUri: dstUri, movedAt };

	deps.publishInternalEvent?.('localUserUpdated', updatedSrc);

	const srcPerson = await renderPersonForHonoApi(deps, updatedSrc);
	const updateAct = addActivityContext(deps.config, renderUpdateForHonoApi(deps.config, srcPerson, updatedSrc));
	await deliverNoteActivityForHonoApi(deps, updatedSrc, updateAct, { directRecipients: [], deliverToFollowers: true });
	// 原典 AccountMoveService#moveFromLocal 同様、リレー配信は await しない。
	void deliverToRelaysForHonoApi(deps, { id: updatedSrc.id, host: null }, updateAct).catch(() => {});

	const moveAct = addActivityContext(deps.config, renderMoveForHonoApi(deps.config, updatedSrc, dst));
	await deliverNoteActivityForHonoApi(deps, updatedSrc, moveAct, { directRecipients: [], deliverToFollowers: true });

	const iObj = await packMeDetailedForHonoApi(deps, updatedSrc, { includeSecrets: true });
	deps.publishMainStream?.(updatedSrc.id, 'meUpdated', iObj);

	const followings = await listAllFollowingsByFollowerIdFromDatabase(deps.db, updatedSrc.id);
	void enqueueRelationshipJobForHonoApi(deps, 'unfollow', followings.map(f => ({
		from: { id: updatedSrc.id },
		to: { id: f.followeeId },
	})), { delay: process.env.NODE_ENV === 'test' ? 10000 : 1000 * 60 * 60 * 24 }).catch(() => {});

	await postMoveProcessForHonoApi(deps, updatedSrc, dst);

	return iObj;
}

/** AccountMoveService#postMoveProcess 相当。ローカルからの引っ越し (i/move) と、リモートアクターの
 * movedToUri 検知 (updatePersonForHonoApi 経由) の両方から呼ばれる共通の移行カスケード。 */
export async function postMoveProcessForHonoApi(deps: HonoApiAccountMoveDependencies, src: MiUser, dst: MiUser): Promise<void> {
	try {
		await Promise.all([
			copyBlockingForHonoApi(deps, src, dst),
			copyMutingsForHonoApi(deps, src, dst),
			copyRolesForHonoApi(deps, src, dst),
			updateListsForHonoApi(deps, src, dst),
			onMoveAccountForHonoApi(deps, src, dst),
		]);
	} catch {
		// skip if any error happens
	}

	const proxy = await fetchOrCreateSystemAccountInDatabase({ db: deps.db, meta: deps.meta, genId }, 'proxy');
	const followings = await listLocalFollowerFollowingsByFolloweeIdFromDatabase(deps.db, src.id, { excludeFollowerIds: [proxy.id] });
	const followJobs = followings.map(f => ({ from: { id: f.followerId }, to: { id: dst.id } }));

	try {
		await adjustFollowingCountsForHonoApi(deps, followJobs.map(job => job.from.id), src);
	} catch {
		// skip if any error happens
	}

	await enqueueRelationshipJobForHonoApi(deps, 'follow', followJobs);
}

export async function handleHonoApiIMove(
	deps: HonoApiAccountMoveDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<MeDetailedHonoApiResponse> {
	const ps = parseHonoApiParams(iMoveParamDef, body);

	if (!ps.moveToAccount) throw iMoveNoSuchUserError();
	if (deps.meta.rootUserId === me.id) throw iMoveRootForbiddenError();
	if (me.movedToUri) throw iMoveAlreadyMovedError();

	let moveTo = await resolveMoveDestinationUserForHonoApi(deps, ps.moveToAccount);
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

	return await moveFromLocalForHonoApi(deps, me, moveTo);
}
