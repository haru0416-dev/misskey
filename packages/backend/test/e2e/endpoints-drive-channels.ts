/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash, randomUUID } from 'node:crypto';
import * as assert from 'assert';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import {
	announcementReadExistsInDatabase,
	channelFavoriteExistsInDatabase,
	channelFollowingExistsInDatabase,
	channelMutingExistsInDatabase,
	clipFavoriteExistsInDatabase,
	countAntennasByUserIdFromDatabase,
	createAbuseUserReportInDatabase,
	createAnnouncementInDatabase,
	createAnnouncementReadInDatabase,
	createAvatarDecorationInDatabase,
	createBlockingInDatabase,
	createChannelFavoriteInDatabase,
	createChannelFollowingInDatabase,
	createChannelInDatabase,
	createChannelMutingInDatabase,
	createClipInDatabase,
	createDriveFileInDatabase,
	createDriveFolderInDatabase,
	createFlashInDatabase,
	createFollowingInDatabase,
	createFollowRequestInDatabase,
	createInstanceInDatabase,
	createLocalSignupAccount,
	createModerationLogInDatabase,
	createNoteDraftInDatabase,
	createNoteInDatabase,
	createNoteReactionInDatabase,
	createPageInDatabase,
	createPasswordResetRequestInDatabase,
	createPollInDatabase,
	createRegistrationTicketInDatabase,
	createRelayInDatabase,
	createRetentionAggregationInDatabase,
	createRoleAssignmentInDatabase,
	createRoleInDatabase,
	createSigninInDatabase,
	createSwSubscriptionInDatabase,
	createUserInDatabase,
	createUserListInDatabase,
	createUserListMembershipInDatabase,
	createUserPendingInDatabase,
	createUserSecurityKeyInDatabase,
	createUserWithProfileAndPublickeyInDatabase,
	createWebhookInDatabase,
	DEFAULT_POLICIES,
	deleteBlockingByIdFromDatabase,
	deleteQueueOutboxesByIds,
	deleteUserListByIdInDatabase,
	dispatchQueueOutbox,
	fetchAbuseUserReportByIdOrFailFromDatabase,
	fetchBlockingByBlockerIdAndBlockeeIdFromDatabase,
	fetchDriveFileByIdFromDatabase,
	fetchDriveFileByUrlFromDatabase,
	fetchDriveFolderByIdFromDatabase,
	fetchEmojiByIdFromDatabase,
	fetchEmojiByIdOrFailFromDatabase,
	fetchFlashByIdFromDatabase,
	fetchFollowingByFollowerIdAndFolloweeIdFromDatabase,
	fetchFollowRequestFromDatabase,
	fetchGalleryPostByIdFromDatabase,
	fetchInstanceByHostFromDatabase,
	fetchLocalUserByUsernameFromDatabase,
	fetchMetaFromDatabase,
	fetchMutingByMuterIdAndMuteeIdFromDatabase,
	fetchNoteByIdFromDatabase,
	fetchNoteDraftByIdFromDatabase,
	fetchPollByNoteIdOrFailFromDatabase,
	fetchQueueOutboxByIdFromDatabase,
	fetchRelayByInboxFromDatabase,
	fetchRenoteMutingFromDatabase,
	fetchRoleAssignmentByUserIdAndRoleIdFromDatabase,
	fetchSystemWebhookByIdFromDatabase,
	fetchUserByIdOrFailFromDatabase,
	fetchUserListByIdAndUserIdFromDatabase,
	fetchUserListByNameAndUserIdFromDatabase,
	fetchUserProfileByUserIdOrFailFromDatabase,
	fetchWebhookByIdAndUserIdFromDatabase,
	fixtureConfig,
	flashLikeExistsInDatabase,
	genId,
	insertEmojiInDatabase,
	insertHashtags,
	insertQueueOutboxes,
	insertUserIps,
	isPromoNoteExists,
	isPromoReadExists,
	listModerationLogsFromDatabase,
	listPollVotesByNoteAndUserFromDatabase,
	listUserNotePiningsByUserIdFromDatabase,
	openTestDatabase,
	pageLikeExistsInDatabase,
	RootUserAlreadyAssignedError,
	type TestDatabase,
	updateChannelInDatabase,
	updateDriveFileInDatabase,
	updateUserInDatabase,
	updateUserProfileInDatabase,
	userListFavoriteExistsInDatabase,
	userListMembershipExistsInDatabase,
} from '../fixtures.js';
import {
	api,
	castAsError,
	createAppToken,
	origin,
	POLL,
	post,
	relativeFetch,
	role,
	signup,
	simpleGet,
	uploadFile,
} from '../utils.js';
import type * as misskey from 'misskey-js';
import { createEndpointsContext, type EndpointsContext, getAt } from '../endpoints-context.js';

/*
 * アサーションは vitest の expect に寄せているが、判別可能ユニオンの分岐を確定させる箇所だけ
 * node:assert を使う。expect の matcher は `asserts` 述語を持たないため、判別子を検査しても
 * 後続のプロパティアクセスが型エラーになる。
 */

describe('Endpoints', () => {
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let db: TestDatabase;
	let context: EndpointsContext;

	beforeAll(async () => {
		context = await createEndpointsContext();
		({ alice, bob, db } = context);
	}, 1000 * 60 * 2);

	afterAll(async () => {
		await context.close();
	});

	describe('Hono channel read endpoints', () => {
		test('featured, owned, followed, and my-favorites preserve caller-scoped flags', async () => {
			const config = fixtureConfig;
			const stamp = Date.now().toString(36);
			const owned = await createChannelInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `hono-owned-${stamp}`,
				description: 'hono owned channel',
				lastNotedAt: new Date('2024-01-01T00:00:00.000Z'),
			});
			const followed = await createChannelInDatabase(db, {
				id: genId(),
				userId: bob.id,
				name: `hono-followed-${stamp}`,
				description: 'hono followed channel',
				lastNotedAt: new Date('2024-01-02T00:00:00.000Z'),
			});
			const archived = await createChannelInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `hono-archived-${stamp}`,
				description: 'hono archived channel',
				lastNotedAt: new Date('2024-01-03T00:00:00.000Z'),
				isArchived: true,
			});
			await createChannelFollowingInDatabase(db, {
				id: genId(),
				followerId: alice.id,
				followeeId: followed.id,
			});
			await createChannelFavoriteInDatabase(db, {
				id: genId(),
				userId: alice.id,
				channelId: followed.id,
			});
			await createChannelMutingInDatabase(db, {
				id: genId(),
				userId: alice.id,
				channelId: followed.id,
			});

			const featuredAnonymous = await api('channels/featured', {});
			expect(featuredAnonymous.status).toBe(200);
			const anonymousFeatured = (featuredAnonymous.body as any[]).find((channel) => channel.id === followed.id);
			assert.ok(anonymousFeatured);
			expect(Object.hasOwn(anonymousFeatured, 'isFollowing')).toBe(false);
			expect((featuredAnonymous.body as any[]).some((channel) => channel.id === archived.id)).toBe(false);

			const featured = await api('channels/featured', {}, alice);
			expect(featured.status).toBe(200);
			const featuredFollowed = (featured.body as any[]).find((channel) => channel.id === followed.id);
			assert.ok(featuredFollowed);
			expect(featuredFollowed.isFollowing).toBe(true);
			expect(featuredFollowed.isFavorited).toBe(true);
			expect(featuredFollowed.isMuting).toBe(true);

			const ownedList = await api('channels/owned', { limit: 20 }, alice);
			expect(ownedList.status).toBe(200);
			expect((ownedList.body as any[]).some((channel) => channel.id === owned.id)).toBe(true);
			expect((ownedList.body as any[]).some((channel) => channel.id === archived.id)).toBe(false);

			const followedList = await api('channels/followed', { limit: 20 }, alice);
			expect(followedList.status).toBe(200);
			expect(
				(followedList.body as any[])
					.filter((channel) => channel.id === followed.id)
					.map((channel) => channel.isFollowing),
			).toStrictEqual([true]);

			const favorites = await api('channels/my-favorites', {}, alice);
			expect(favorites.status).toBe(200);
			const favorite = (favorites.body as any[]).find((channel) => channel.id === followed.id);
			assert.ok(favorite);
			expect(favorite.isFavorited).toBe(true);
		});

		test('channel account read endpoints require read:channels app token permission', async () => {
			const readAccountToken = await createAppToken(alice, ['read:account']);

			for (const [endpoint, params] of [
				['channels/owned', {}],
				['channels/followed', {}],
				['channels/my-favorites', {}],
			] as const) {
				const denied = await api(endpoint, params, { token: readAccountToken });
				expect(denied.status, endpoint).toBe(403);
				expect(castAsError(denied.body as any).error.code, endpoint).toBe('PERMISSION_DENIED');
			}
		});
	});


	describe('Hono channel write endpoints', () => {
		const createOwnedDriveFile = async (userId: string, seed: string) => {
			const config = fixtureConfig;
			const md5 = createHash('md5').update(seed).digest('hex');
			return await createDriveFileInDatabase(db, {
				id: genId(),
				userId,
				userHost: null,
				md5,
				name: `${seed}.png`,
				type: 'image/png',
				size: 11,
				storedInternal: true,
				url: `${origin}/files/${md5}`,
			});
		};

		test('create and update return packed channels with caller-scoped flags', async () => {
			const owner = await signup({ username: `honochnowner${Date.now().toString(36)}` });
			const createdBanner = await createOwnedDriveFile(owner.id, `hono-channel-create-${Date.now()}`);
			const created = await api(
				'channels/create',
				{
					name: `hono-channel-create-${Date.now().toString(36)}`,
					description: 'hono channel create target',
					bannerId: createdBanner.id,
					color: '#123456',
					isSensitive: true,
					allowRenoteToExternal: false,
				},
				owner,
			);
			expect(created.status).toBe(200);
			expect(created.body.userId).toBe(owner.id);
			expect(created.body.description).toBe('hono channel create target');
			expect(created.body.bannerId).toBe(createdBanner.id);
			expect(created.body.color).toBe('#123456');
			expect(created.body.isSensitive).toBe(true);
			expect(created.body.allowRenoteToExternal).toBe(false);
			expect(created.body.isFollowing).toBe(false);
			expect(created.body.isFavorited).toBe(false);
			expect(created.body.isMuting).toBe(false);

			const updatedBanner = await createOwnedDriveFile(owner.id, `hono-channel-update-${Date.now()}`);
			const pinnedNoteId = '000000000000000000000001';
			const updated = await api(
				'channels/update',
				{
					channelId: created.body.id,
					name: 'hono channel updated',
					description: null,
					bannerId: updatedBanner.id,
					isArchived: true,
					pinnedNoteIds: [pinnedNoteId],
					color: '#654321',
					isSensitive: false,
					allowRenoteToExternal: true,
				},
				owner,
			);
			expect(updated.status).toBe(200);
			expect(updated.body.id).toBe(created.body.id);
			expect(updated.body.name).toBe('hono channel updated');
			expect(updated.body.description).toBe(null);
			expect(updated.body.bannerId).toBe(updatedBanner.id);
			expect(updated.body.isArchived).toBe(true);
			expect(updated.body.pinnedNoteIds).toStrictEqual([pinnedNoteId]);
			expect(updated.body.color).toBe('#654321');
			expect(updated.body.isSensitive).toBe(false);
			expect(updated.body.allowRenoteToExternal).toBe(true);
		});

		test('keeps legacy channel create validation, policy, and moved-account errors', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const deniedUser = await signup({ username: `honochdeny${now.toString(36)}` });
			const requester = await signup({ username: `honochreq${now.toString(36)}` });
			const fileOwner = await signup({ username: `honochfile${now.toString(36)}` });
			const denyRole = await createRoleInDatabase(db, {
				id: genId(now),
				updatedAt: new Date(now),
				lastUsedAt: new Date(now),
				name: `Hono channel create deny role ${now}`,
				description: 'Hono channel create deny role',
				color: null,
				iconUrl: null,
				target: 'manual',
				condFormula: {
					id: 'ebef1684-672d-49b6-ad82-1b3ec3784f85',
					type: 'isRemote',
				},
				isPublic: false,
				isAdministrator: false,
				isModerator: false,
				isExplorable: false,
				asBadge: false,
				preserveAssignmentOnMoveAccount: false,
				canEditMembersByModerator: false,
				displayOrder: 1,
				policies: {
					canCreateChannel: {
						useDefault: false,
						priority: 2,
						value: false,
					},
				},
			});
			await createRoleAssignmentInDatabase(db, {
				id: genId(now + 1),
				userId: deniedUser.id,
				roleId: denyRole.id,
				expiresAt: null,
			});

			const policyDenied = await api(
				'channels/create',
				{
					name: 'hono policy denied channel',
				},
				deniedUser,
			);
			expect(policyDenied.status).toBe(403);
			expect(castAsError(policyDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
			expect(castAsError(policyDenied.body as any).error.id).toBe('c3d38592-54c0-429d-be96-5636b0431a61');

			const otherFile = await createOwnedDriveFile(fileOwner.id, `hono-channel-other-file-${now}`);
			const missingFile = await api(
				'channels/create',
				{
					name: 'hono channel missing file',
					bannerId: otherFile.id,
				},
				requester,
			);
			expect(missingFile.status).toBe(400);
			expect(castAsError(missingFile.body as any).error.id).toBe('cd1e9f3e-5a12-4ab4-96f6-5d0a2cc32050');

			const readToken = await createAppToken(requester, ['read:channels']);
			const permissionDenied = await api(
				'channels/create',
				{
					name: 'hono channel app denied',
				},
				{ token: readToken },
			);
			expect(permissionDenied.status).toBe(403);
			expect(castAsError(permissionDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const movedUser = await signup({ username: `honochmoved${now.toString(36)}` });
			await updateUserInDatabase(db, movedUser.id, {
				movedToUri: `${origin}/users/${alice.id}`,
			});
			const movedDenied = await api(
				'channels/create',
				{
					name: 'hono moved denied channel',
				},
				movedUser,
			);
			expect(movedDenied.status).toBe(403);
			expect(castAsError(movedDenied.body as any).error.code).toBe('YOUR_ACCOUNT_MOVED');
		});

		test('keeps legacy channel update authorization and file errors', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const owner = await signup({ username: `hcupown${now.toString(36)}` });
			const intruder = await signup({ username: `honochupintr${now.toString(36)}` });
			const target = await createChannelInDatabase(db, {
				id: genId(),
				userId: owner.id,
				name: `hono-update-target-${now.toString(36)}`,
				description: 'hono update target',
			});

			const missing = await api(
				'channels/update',
				{
					channelId: '000000000000000000000000',
					name: 'missing',
				},
				intruder,
			);
			expect(missing.status).toBe(400);
			expect(castAsError(missing.body as any).error.id).toBe('f9c5467f-d492-4c3c-9a8d-a70dacc86512');

			const denied = await api(
				'channels/update',
				{
					channelId: target.id,
					name: 'denied',
				},
				intruder,
			);
			expect(denied.status).toBe(400);
			expect(castAsError(denied.body as any).error.id).toBe('1fb7cb09-d46a-4fdf-b8df-057788cce513');

			const intruderFile = await createOwnedDriveFile(intruder.id, `hono-channel-intruder-file-${now}`);
			const missingFile = await api(
				'channels/update',
				{
					channelId: target.id,
					bannerId: intruderFile.id,
				},
				owner,
			);
			expect(missingFile.status).toBe(400);
			expect(castAsError(missingFile.body as any).error.id).toBe('e86c14a4-0da2-4032-8df3-e737a04c7f3b');

			const readToken = await createAppToken(owner, ['read:channels']);
			const permissionDenied = await api(
				'channels/update',
				{
					channelId: target.id,
					name: 'denied by app scope',
				},
				{ token: readToken },
			);
			expect(permissionDenied.status).toBe(403);
			expect(castAsError(permissionDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const moderator = await signup({ username: `honomod${now.toString(36)}` });
			const moderatorRole = await createRoleInDatabase(db, {
				id: genId(now + 2),
				updatedAt: new Date(now),
				lastUsedAt: new Date(now),
				name: `Hono channel moderator role ${now}`,
				description: 'Hono channel moderator role',
				color: null,
				iconUrl: null,
				target: 'manual',
				condFormula: {
					id: 'ebef1684-672d-49b6-ad82-1b3ec3784f85',
					type: 'isRemote',
				},
				isPublic: false,
				isAdministrator: false,
				isModerator: true,
				isExplorable: false,
				asBadge: false,
				preserveAssignmentOnMoveAccount: false,
				canEditMembersByModerator: false,
				displayOrder: 1,
				policies: {},
			});
			await createRoleAssignmentInDatabase(db, {
				id: genId(now + 3),
				userId: moderator.id,
				roleId: moderatorRole.id,
				expiresAt: null,
			});

			const moderatorUpdate = await api(
				'channels/update',
				{
					channelId: target.id,
					name: 'moderator updated channel',
				},
				moderator,
			);
			expect(moderatorUpdate.status).toBe(200);
			expect(moderatorUpdate.body.id).toBe(target.id);
			expect(moderatorUpdate.body.name).toBe('moderator updated channel');
		});
	});


	describe('Hono channel follow endpoints', () => {
		test('follow and unfollow update the channel following row', async () => {
			const config = fixtureConfig;
			const target = await createChannelInDatabase(db, {
				id: genId(),
				userId: bob.id,
				name: `hono-follow-${Date.now().toString(36)}`,
				description: 'hono follow target',
			});

			const followed = await api(
				'channels/follow',
				{
					channelId: target.id,
				},
				alice,
			);
			expect(followed.status).toBe(204);
			expect(await channelFollowingExistsInDatabase(db, alice.id, target.id)).toBe(true);

			// (followerId, followeeId) は unique なので、二重フォローは 500 ではなく明示的なエラーになる
			const followedAgain = await api(
				'channels/follow',
				{
					channelId: target.id,
				},
				alice,
			);
			expect(followedAgain.status).toBe(400);
			expect(castAsError(followedAgain.body as any).error.code).toBe('ALREADY_FOLLOWING');

			const unfollowed = await api(
				'channels/unfollow',
				{
					channelId: target.id,
				},
				alice,
			);
			expect(unfollowed.status).toBe(204);
			expect(await channelFollowingExistsInDatabase(db, alice.id, target.id)).toBe(false);

			const unfollowedAgain = await api(
				'channels/unfollow',
				{
					channelId: target.id,
				},
				alice,
			);
			expect(unfollowedAgain.status).toBe(204);
		});

		test('keeps legacy validation, permission, and moved-account errors', async () => {
			const config = fixtureConfig;
			const target = await createChannelInDatabase(db, {
				id: genId(),
				userId: bob.id,
				name: `hono-follow-validation-${Date.now().toString(36)}`,
				description: 'hono follow validation target',
			});

			const missingFollow = await api(
				'channels/follow',
				{
					channelId: '000000000000000000000000',
				},
				alice,
			);
			expect(missingFollow.status).toBe(400);
			expect(castAsError(missingFollow.body as any).error.id).toBe('c0031718-d573-4e85-928e-10039f1fbb68');

			const missingUnfollow = await api(
				'channels/unfollow',
				{
					channelId: '000000000000000000000000',
				},
				alice,
			);
			expect(missingUnfollow.status).toBe(400);
			expect(castAsError(missingUnfollow.body as any).error.id).toBe('19959ee9-0153-4c51-bbd9-a98c49dc59d6');

			const readToken = await createAppToken(alice, ['read:channels']);
			for (const endpoint of ['channels/follow', 'channels/unfollow'] as const) {
				const denied = await api(endpoint, { channelId: target.id }, { token: readToken });
				expect(denied.status, endpoint).toBe(403);
				expect(castAsError(denied.body as any).error.code, endpoint).toBe('PERMISSION_DENIED');
			}

			const movedUser = await signup({ username: `honofollow${Date.now().toString(36)}` });
			await updateUserInDatabase(db, movedUser.id, {
				movedToUri: `${origin}/users/${alice.id}`,
			});
			const movedDenied = await api(
				'channels/follow',
				{
					channelId: target.id,
				},
				movedUser,
			);
			expect(movedDenied.status).toBe(403);
			expect(castAsError(movedDenied.body as any).error.code).toBe('YOUR_ACCOUNT_MOVED');
			expect(await channelFollowingExistsInDatabase(db, movedUser.id, target.id)).toBe(false);
		});
	});


	describe('Hono channel mute endpoints', () => {
		test('create, list, and delete preserve channel mute behavior', async () => {
			const config = fixtureConfig;
			const stamp = Date.now().toString(36);
			const target = await createChannelInDatabase(db, {
				id: genId(),
				userId: bob.id,
				name: `hono-mute-${stamp}`,
				description: 'hono mute target',
				lastNotedAt: new Date('2024-01-04T00:00:00.000Z'),
			});
			const expiredTarget = await createChannelInDatabase(db, {
				id: genId(),
				userId: bob.id,
				name: `hono-expired-mute-${stamp}`,
				description: 'hono expired mute target',
				lastNotedAt: new Date('2024-01-05T00:00:00.000Z'),
			});
			await createChannelMutingInDatabase(db, {
				id: genId(),
				userId: alice.id,
				channelId: expiredTarget.id,
				expiresAt: new Date(Date.now() - 60_000),
			});

			const created = await api(
				'channels/mute/create',
				{
					channelId: target.id,
					expiresAt: Date.now() + 60_000,
				},
				alice,
			);
			expect(created.status).toBe(204);
			expect(await channelMutingExistsInDatabase(db, alice.id, target.id)).toBe(true);

			const duplicate = await api(
				'channels/mute/create',
				{
					channelId: target.id,
				},
				alice,
			);
			expect(duplicate.status).toBe(400);
			expect(castAsError(duplicate.body as any).error.id).toBe('5a251978-769a-da44-3e89-3931e43bb592');

			const expiredDuplicate = await api(
				'channels/mute/create',
				{
					channelId: expiredTarget.id,
				},
				alice,
			);
			expect(expiredDuplicate.status).toBe(400);
			expect(castAsError(expiredDuplicate.body as any).error.id).toBe('5a251978-769a-da44-3e89-3931e43bb592');

			const list = await api('channels/mute/list', {}, alice);
			expect(list.status).toBe(200);
			const mutedChannels = list.body as any[];
			const muted = mutedChannels.find((channel) => channel.id === target.id);
			assert.ok(muted);
			expect(muted.isMuting).toBe(true);
			expect(mutedChannels.some((channel) => channel.id === expiredTarget.id)).toBe(false);

			const deleted = await api(
				'channels/mute/delete',
				{
					channelId: target.id,
				},
				alice,
			);
			expect(deleted.status).toBe(204);
			expect(await channelMutingExistsInDatabase(db, alice.id, target.id)).toBe(false);

			const missingDelete = await api(
				'channels/mute/delete',
				{
					channelId: target.id,
				},
				alice,
			);
			expect(missingDelete.status).toBe(400);
			expect(castAsError(missingDelete.body as any).error.id).toBe('14d55962-6ea8-d990-1333-d6bef78dc2ab');
		});

		test('keeps legacy validation, permission, and moved-account errors', async () => {
			const config = fixtureConfig;
			const target = await createChannelInDatabase(db, {
				id: genId(),
				userId: bob.id,
				name: `hono-mute-validation-${Date.now().toString(36)}`,
				description: 'hono mute validation target',
			});

			const missingCreate = await api(
				'channels/mute/create',
				{
					channelId: '000000000000000000000000',
				},
				alice,
			);
			expect(missingCreate.status).toBe(400);
			expect(castAsError(missingCreate.body as any).error.id).toBe('7174361e-d58f-31d6-2e7c-6fb830786a3f');

			const missingDelete = await api(
				'channels/mute/delete',
				{
					channelId: '000000000000000000000000',
				},
				alice,
			);
			expect(missingDelete.status).toBe(400);
			expect(castAsError(missingDelete.body as any).error.id).toBe('e7998769-6e94-d9c2-6b8f-94a527314aba');

			const pastExpiration = await api(
				'channels/mute/create',
				{
					channelId: target.id,
					expiresAt: Date.now() - 60_000,
				},
				alice,
			);
			expect(pastExpiration.status).toBe(400);
			expect(castAsError(pastExpiration.body as any).error.id).toBe('42b32236-df2c-a45f-fdbf-def67268f749');

			const readToken = await createAppToken(alice, ['read:channels']);
			const writeToken = await createAppToken(alice, ['write:channels']);
			for (const endpoint of ['channels/mute/create', 'channels/mute/delete'] as const) {
				const denied = await api(endpoint, { channelId: target.id }, { token: readToken });
				expect(denied.status, endpoint).toBe(403);
				expect(castAsError(denied.body as any).error.code, endpoint).toBe('PERMISSION_DENIED');
			}

			const listDenied = await api('channels/mute/list', {}, { token: writeToken });
			expect(listDenied.status).toBe(403);
			expect(castAsError(listDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const movedUser = await signup({ username: `honomute${Date.now().toString(36)}` });
			await updateUserInDatabase(db, movedUser.id, {
				movedToUri: `${origin}/users/${alice.id}`,
			});
			const movedDenied = await api(
				'channels/mute/create',
				{
					channelId: target.id,
				},
				movedUser,
			);
			expect(movedDenied.status).toBe(403);
			expect(castAsError(movedDenied.body as any).error.code).toBe('YOUR_ACCOUNT_MOVED');
			expect(await channelMutingExistsInDatabase(db, movedUser.id, target.id)).toBe(false);
		});
	});


	describe('channels/search', () => {
		let channelSearchFixture: {
			prefix: string;
			aaa: { id: string; name: string; description: string };
			ccc1: { id: string; name: string; description: string };
			ccc2: { id: string; name: string; description: string };
		} | null = null;

		async function ensureChannelSearchFixture() {
			if (channelSearchFixture != null) return channelSearchFixture;

			const config = fixtureConfig;
			const prefix = `hono-search-${Date.now().toString(36)}`;
			const aaa = await createChannelInDatabase(db, {
				id: genId(),
				userId: bob.id,
				name: `${prefix}-aaa`,
				description: `${prefix}-bbb`,
			});
			const ccc1 = await createChannelInDatabase(db, {
				id: genId(),
				userId: bob.id,
				name: `${prefix}-ccc1`,
				description: `${prefix}-ddd1`,
			});
			const ccc2 = await createChannelInDatabase(db, {
				id: genId(),
				userId: bob.id,
				name: `${prefix}-ccc2`,
				description: `${prefix}-ddd2`,
			});

			const fixture = {
				prefix,
				aaa: { id: aaa.id, name: aaa.name, description: aaa.description! },
				ccc1: { id: ccc1.id, name: ccc1.name, description: ccc1.description! },
				ccc2: { id: ccc2.id, name: ccc2.name, description: ccc2.description! },
			};
			channelSearchFixture = fixture;
			return fixture;
		}

		test('空白検索で一覧を取得できる', async () => {
			const fixture = await ensureChannelSearchFixture();

			const res = await api(
				'channels/search',
				{
					query: '',
				},
				bob,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && Array.isArray(res.body)).toBe(true);
			const ids = (res.body as any[]).map((channel) => channel.id);
			expect(ids.includes(fixture.aaa.id)).toBe(true);
			expect(ids.includes(fixture.ccc1.id)).toBe(true);
			expect(ids.includes(fixture.ccc2.id)).toBe(true);
		});
		test('名前のみの検索で名前を検索できる', async () => {
			const fixture = await ensureChannelSearchFixture();
			const res = await api(
				'channels/search',
				{
					query: fixture.aaa.name,
					type: 'nameOnly',
				},
				bob,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(1);
			expect(getAt(res.body, 0).id).toBe(fixture.aaa.id);
		});
		test('名前のみの検索で名前を複数検索できる', async () => {
			const fixture = await ensureChannelSearchFixture();
			const res = await api(
				'channels/search',
				{
					query: `${fixture.prefix}-ccc`,
					type: 'nameOnly',
				},
				bob,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(2);
		});
		test('名前のみの検索で説明は検索できない', async () => {
			const fixture = await ensureChannelSearchFixture();
			const res = await api(
				'channels/search',
				{
					query: fixture.aaa.description,
					type: 'nameOnly',
				},
				bob,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(0);
		});
		test('名前と説明の検索で名前を検索できる', async () => {
			const fixture = await ensureChannelSearchFixture();
			const res = await api(
				'channels/search',
				{
					query: fixture.ccc1.name,
				},
				bob,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(1);
			expect(getAt(res.body, 0).id).toBe(fixture.ccc1.id);
		});
		test('名前と説明での検索で説明を検索できる', async () => {
			const fixture = await ensureChannelSearchFixture();
			const res = await api(
				'channels/search',
				{
					query: fixture.ccc1.description,
				},
				bob,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(1);
			expect(getAt(res.body, 0).id).toBe(fixture.ccc1.id);
		});
		test('名前と説明の検索で名前を複数検索できる', async () => {
			const fixture = await ensureChannelSearchFixture();
			const res = await api(
				'channels/search',
				{
					query: `${fixture.prefix}-ccc`,
				},
				bob,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(2);
		});
		test('名前と説明での検索で説明を複数検索できる', async () => {
			const fixture = await ensureChannelSearchFixture();
			const res = await api(
				'channels/search',
				{
					query: `${fixture.prefix}-ddd`,
				},
				bob,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(2);
		});
	});


	describe('channels/show and channels/timeline', () => {
		test('channels/show はpinnedNotesを含み、channels/timelineはNO_SUCH_CHANNELと投稿一覧を維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `hcs${suffix}` });
			const channel = await createChannelInDatabase(db, {
				id: genId(),
				userId: owner.id,
				name: `hono-channel-show-${suffix}`,
				description: 'hono channel show test',
			});
			const pinnedNoteId = genId();
			await createNoteInDatabase(db, {
				id: pinnedNoteId,
				text: 'channel pinned note',
				userId: owner.id,
				userHost: null,
				visibility: 'public',
				channelId: channel.id,
			});
			await updateChannelInDatabase(db, channel.id, { pinnedNoteIds: [pinnedNoteId] });

			const shown = await api('channels/show', { channelId: channel.id });
			expect(shown.status).toBe(200);
			expect(shown.body.id).toBe(channel.id);
			expect(shown.body.pinnedNoteIds?.[0]).toBe(pinnedNoteId);
			expect(shown.body.pinnedNotes?.[0]?.id).toBe(pinnedNoteId);

			const missingChannel = await api('channels/show', { channelId: genId() });
			expect(missingChannel.status).toBe(400);
			expect(castAsError(missingChannel.body as any).error.code).toBe('NO_SUCH_CHANNEL');

			const timeline = await api('channels/timeline', { channelId: channel.id });
			expect(timeline.status).toBe(200);
			expect(timeline.body.length).toBe(1);
			expect(getAt(timeline.body, 0).id).toBe(pinnedNoteId);
			expect(getAt(timeline.body, 0).channelId).toBe(channel.id);

			const missingTimeline = await api('channels/timeline', { channelId: genId() });
			expect(missingTimeline.status).toBe(400);
			expect(castAsError(missingTimeline.body as any).error.code).toBe('NO_SUCH_CHANNEL');
		});
	});


	describe('drive', () => {
		test('ドライブ情報を取得できる', async () => {
			const res = await api('drive', {}, alice);
			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
			// alice は他のテストでも共有されアップロードが行われるため、0固定ではなく非負の数値であることのみ検証する
			expect(typeof res.body.usage).toBe('number');
			assert.ok(res.body.usage >= 0);
		});

		test('アップロード後にusageが増加し、capacityはrole policyのdriveCapacityMbと一致する', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hdrv${suffix}` });

			const before = await api('drive', {}, user);
			expect(before.status).toBe(200);
			expect(before.body.usage).toBe(0);
			expect(before.body.capacity).toBe(1024 * 1024 * DEFAULT_POLICIES.driveCapacityMb);

			const uploaded = await uploadFile(user);
			expect(uploaded.status).toBe(200);

			const after = await api('drive', {}, user);
			expect(after.status).toBe(200);
			expect(after.body.usage).toBe(uploaded.body!.size);
		});
	});


	describe('drive/files/create', () => {
		const assignRole = async (userId: string, policies: Record<string, unknown>) => {
			const createdRole = await role(alice, {}, policies);

			const assign = await api(
				'admin/roles/assign',
				{
					userId,
					roleId: createdRole.id,
				},
				alice,
			);

			expect(assign.status).toBe(204);

			return createdRole;
		};

		const cleanupRole = async (userId: string, roleId: string) => {
			await api(
				'admin/roles/unassign',
				{
					userId,
					roleId,
				},
				alice,
			);

			await api(
				'admin/roles/delete',
				{
					roleId,
				},
				alice,
			);
		};

		test('ファイルを作成できる', async () => {
			const res = await uploadFile(alice);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
			expect(res.body!.name).toBe('192.jpg');
		});

		test('ファイルに名前を付けられる', async () => {
			const res = await uploadFile(alice, { name: 'Belmond.jpg' });

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
			expect(res.body!.name).toBe('Belmond.jpg');
		});

		test('ファイルに名前を付けられるが、拡張子は正しいものになる', async () => {
			const res = await uploadFile(alice, { name: 'Belmond.png' });

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
			expect(res.body!.name).toBe('Belmond.png.jpg');
		});

		test('ファイル無しで怒られる', async () => {
			// @ts-expect-error params must not be empty
			const res = await api('drive/files/create', {}, alice);

			expect(res.status).toBe(400);
			assert.ok(res.body);
			expect(castAsError(res.body).error.code).toBe('INVALID_PARAM');
			expect(castAsError(res.body).error.kind).toBe('client');
		});

		test('存在しないフォルダーにはファイルを作成できない', async () => {
			const res = await uploadFile(alice, { folderId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz' });

			expect(res.status).toBe(400);
			assert.ok(res.body);
			expect(castAsError(res.body as unknown as Record<string, unknown>).error.code).toBe('NO_SUCH_FOLDER');
			expect(castAsError(res.body as unknown as Record<string, unknown>).error.id).toBe(
				'12e7caa8-224f-471d-978a-653a81cf4c90',
			);
		});

		test('SVGファイルを作成できる', async () => {
			const res = await uploadFile(alice, { path: 'image.svg' });

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
			expect(res.body!.name).toBe('image.svg');
			expect(res.body!.type).toBe('image/svg+xml');
		});

		for (const type of ['webp', 'avif']) {
			const mediaType = `image/${type}`;

			const getWebpublicType = async (user: misskey.entities.SignupResponse, fileId: string): Promise<string> => {
				// drive/files/create のレスポンスに webpublicType がないため、投稿経由で確認する。
				const res = await post(user, {
					text: mediaType,
					fileIds: [fileId],
				});
				const apRes = await simpleGet(`notes/${res.id}`, 'application/activity+json');
				expect(apRes.status).toBe(200);
				assert.ok(Array.isArray(apRes.body.attachment));
				return apRes.body.attachment[0].mediaType;
			};

			test(`透明な${type}ファイルを作成できる`, async () => {
				const path = `with-alpha.${type}`;
				const res = await uploadFile(alice, { path });

				expect(res.status).toBe(200);
				expect(res.body!.name).toBe(path);
				expect(res.body!.type).toBe(mediaType);

				const webpublicType = await getWebpublicType(alice, res.body!.id);
				expect(webpublicType).toBe('image/webp');
			});

			test(`透明じゃない${type}ファイルを作成できる`, async () => {
				const path = `without-alpha.${type}`;
				const res = await uploadFile(alice, { path });
				expect(res.status).toBe(200);
				expect(res.body!.name).toBe(path);
				expect(res.body!.type).toBe(mediaType);

				const webpublicType = await getWebpublicType(alice, res.body!.id);
				expect(webpublicType).toBe('image/webp');
			});
		}

		test('uploadableFileTypes が */* なら任意のファイルをアップロードできる', async () => {
			const createdRole = await assignRole(bob.id, {
				uploadableFileTypes: {
					useDefault: false,
					priority: 1,
					value: ['*/*'],
				},
			});

			try {
				const res = await uploadFile(bob, {
					blob: new Blob([new Uint8Array(10)]),
				});

				expect(res.status).toBe(200);
			} finally {
				await cleanupRole(bob.id, createdRole.id);
			}
		});

		test('uploadableFileTypes に含まれない MIME type は拒否される', async () => {
			const createdRole = await assignRole(bob.id, {
				uploadableFileTypes: {
					useDefault: false,
					priority: 1,
					value: ['image/png'],
				},
			});

			try {
				const res = await uploadFile(bob, { path: '192.jpg' });

				expect(res.status).toBe(400);
				assert.ok(res.body);
				expect(castAsError(res.body).error.code).toBe('UNALLOWED_FILE_TYPE');
			} finally {
				await cleanupRole(bob.id, createdRole.id);
			}
		});

		test('maxFileSizeMb 制限付きロールでも制限内ならアップロードできる', async () => {
			const allowAllTypesRole = await assignRole(bob.id, {
				uploadableFileTypes: {
					useDefault: false,
					priority: 1,
					value: ['*/*'],
				},
			});
			const tinyAttachmentRole = await assignRole(bob.id, {
				maxFileSizeMb: {
					useDefault: false,
					priority: 1,
					value: 10 / 1024 / 1024, // 10バイト
				},
			});

			try {
				const res = await uploadFile(bob, {
					blob: new Blob([new Uint8Array(10)]),
				});

				expect(res.status).toBe(200);
			} finally {
				await cleanupRole(bob.id, tinyAttachmentRole.id);
				await cleanupRole(bob.id, allowAllTypesRole.id);
			}
		});

		test('maxFileSizeMb 制限を超えると 413 になる', async () => {
			const allowAllTypesRole = await assignRole(bob.id, {
				uploadableFileTypes: {
					useDefault: false,
					priority: 1,
					value: ['*/*'],
				},
			});
			const tinyAttachmentRole = await assignRole(bob.id, {
				maxFileSizeMb: {
					useDefault: false,
					priority: 1,
					value: 10 / 1024 / 1024, // 10バイト
				},
			});

			try {
				const res = await uploadFile(bob, {
					blob: new Blob([new Uint8Array(11)]),
				});

				expect(res.status).toBe(413);
				assert.ok(res.body);
				expect(castAsError(res.body).error.code).toBe('MAX_FILE_SIZE_EXCEEDED');
			} finally {
				await cleanupRole(bob.id, tinyAttachmentRole.id);
				await cleanupRole(bob.id, allowAllTypesRole.id);
			}
		});
	});


	describe('drive/files/update', () => {
		test('名前を更新できる', async () => {
			const file = (await uploadFile(alice)).body;
			const newName = 'いちごパスタ.png';

			const res = await api(
				'drive/files/update',
				{
					fileId: file!.id,
					name: newName,
				},
				alice,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
			expect(res.body.name).toBe(newName);
		});

		test('他人のファイルは更新できない', async () => {
			const file = (await uploadFile(alice)).body;

			const res = await api(
				'drive/files/update',
				{
					fileId: file!.id,
					name: 'いちごパスタ.png',
				},
				bob,
			);

			expect(res.status).toBe(400);
		});

		test('親フォルダを更新できる', async () => {
			const file = (await uploadFile(alice)).body;
			const folder = (
				await api(
					'drive/folders/create',
					{
						name: 'test',
					},
					alice,
				)
			).body;

			const res = await api(
				'drive/files/update',
				{
					fileId: file!.id,
					folderId: folder.id,
				},
				alice,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
			expect(res.body.folderId).toBe(folder.id);
		});

		test('親フォルダを無しにできる', async () => {
			const file = (await uploadFile(alice)).body;

			const folder = (
				await api(
					'drive/folders/create',
					{
						name: 'test',
					},
					alice,
				)
			).body;

			await api(
				'drive/files/update',
				{
					fileId: file!.id,
					folderId: folder.id,
				},
				alice,
			);

			const res = await api(
				'drive/files/update',
				{
					fileId: file!.id,
					folderId: null,
				},
				alice,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
			expect(res.body.folderId).toBe(null);
		});

		test('他人のフォルダには入れられない', async () => {
			const file = (await uploadFile(alice)).body;
			const folder = (
				await api(
					'drive/folders/create',
					{
						name: 'test',
					},
					bob,
				)
			).body;

			const res = await api(
				'drive/files/update',
				{
					fileId: file!.id,
					folderId: folder.id,
				},
				alice,
			);

			expect(res.status).toBe(400);
		});

		test('存在しないフォルダで怒られる', async () => {
			const file = (await uploadFile(alice)).body;

			const res = await api(
				'drive/files/update',
				{
					fileId: file!.id,
					folderId: '000000000000000000000000',
				},
				alice,
			);

			expect(res.status).toBe(400);
		});

		test('不正なフォルダIDで怒られる', async () => {
			const file = (await uploadFile(alice)).body;

			const res = await api(
				'drive/files/update',
				{
					fileId: file!.id,
					folderId: 'foo',
				},
				alice,
			);

			expect(res.status).toBe(400);
		});

		test('ファイルが存在しなかったら怒る', async () => {
			const res = await api(
				'drive/files/update',
				{
					fileId: '000000000000000000000000',
					name: 'いちごパスタ.png',
				},
				alice,
			);

			expect(res.status).toBe(400);
		});

		test('不正なファイル名で怒られる', async () => {
			const file = (await uploadFile(alice)).body;
			const newName = '';

			const res = await api(
				'drive/files/update',
				{
					fileId: file!.id,
					name: newName,
				},
				alice,
			);

			expect(res.status).toBe(400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api(
				'drive/files/update',
				{
					fileId: 'kyoppie',
					name: 'いちごパスタ.png',
				},
				alice,
			);

			expect(res.status).toBe(400);
		});
	});


	describe('drive/folders/create', () => {
		test('フォルダを作成できる', async () => {
			const res = await api(
				'drive/folders/create',
				{
					name: 'test',
				},
				alice,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
			expect(res.body.name).toBe('test');
		});
	});


	describe('drive/folders/delete', () => {
		test('空フォルダを削除できる', async () => {
			const config = fixtureConfig;
			const folder = await createDriveFolderInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `delete-folder-${Date.now()}`,
				parentId: null,
			});

			const res = await api(
				'drive/folders/delete',
				{
					folderId: folder.id,
				},
				alice,
			);

			expect(res.status).toBe(204);
			expect(await fetchDriveFolderByIdFromDatabase(db, folder.id)).toBe(null);
		});

		test('他人のフォルダを削除できない', async () => {
			const config = fixtureConfig;
			const folder = await createDriveFolderInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `delete-other-user-folder-${Date.now()}`,
				parentId: null,
			});

			const res = await api(
				'drive/folders/delete',
				{
					folderId: folder.id,
				},
				bob,
			);

			expect(res.status).toBe(400);
			expect(castAsError(res.body as any).error.id).toBe('1069098f-c281-440f-b085-f9932edbe091');
			expect(await fetchDriveFolderByIdFromDatabase(db, folder.id)).not.toBe(null);
		});

		test('子フォルダがあるフォルダを削除できない', async () => {
			const config = fixtureConfig;
			const parent = await createDriveFolderInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `delete-parent-folder-${Date.now()}`,
				parentId: null,
			});
			await createDriveFolderInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `delete-child-folder-${Date.now()}`,
				parentId: parent.id,
			});

			const res = await api(
				'drive/folders/delete',
				{
					folderId: parent.id,
				},
				alice,
			);

			expect(res.status).toBe(400);
			expect(castAsError(res.body as any).error.id).toBe('b0fc8a17-963c-405d-bfbc-859a487295e1');
			expect(await fetchDriveFolderByIdFromDatabase(db, parent.id)).not.toBe(null);
		});

		test('子ファイルがあるフォルダを削除できない', async () => {
			const config = fixtureConfig;
			const parent = await createDriveFolderInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `delete-file-parent-folder-${Date.now()}`,
				parentId: null,
			});
			await createDriveFileInDatabase(db, {
				id: genId(),
				userId: alice.id,
				userHost: null,
				md5: createHash('md5').update(`delete-folder-file-${Date.now()}`).digest('hex'),
				name: 'delete-folder-file.txt',
				type: 'text/plain',
				size: 11,
				storedInternal: true,
				url: `${origin}/files/delete-folder-file-${parent.id}`,
				folderId: parent.id,
			});

			const res = await api(
				'drive/folders/delete',
				{
					folderId: parent.id,
				},
				alice,
			);

			expect(res.status).toBe(400);
			expect(castAsError(res.body as any).error.id).toBe('b0fc8a17-963c-405d-bfbc-859a487295e1');
			expect(await fetchDriveFolderByIdFromDatabase(db, parent.id)).not.toBe(null);
		});
	});


	describe('drive/folders/update', () => {
		test('名前を更新できる', async () => {
			const folder = (
				await api(
					'drive/folders/create',
					{
						name: 'test',
					},
					alice,
				)
			).body;

			const res = await api(
				'drive/folders/update',
				{
					folderId: folder.id,
					name: 'new name',
				},
				alice,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
			expect(res.body.name).toBe('new name');
		});

		test('他人のフォルダを更新できない', async () => {
			const folder = (
				await api(
					'drive/folders/create',
					{
						name: 'test',
					},
					bob,
				)
			).body;

			const res = await api(
				'drive/folders/update',
				{
					folderId: folder.id,
					name: 'new name',
				},
				alice,
			);

			expect(res.status).toBe(400);
		});

		test('親フォルダを更新できる', async () => {
			const folder = (
				await api(
					'drive/folders/create',
					{
						name: 'test',
					},
					alice,
				)
			).body;
			const parentFolder = (
				await api(
					'drive/folders/create',
					{
						name: 'parent',
					},
					alice,
				)
			).body;

			const res = await api(
				'drive/folders/update',
				{
					folderId: folder.id,
					parentId: parentFolder.id,
				},
				alice,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
			expect(res.body.parentId).toBe(parentFolder.id);
		});

		test('親フォルダを無しに更新できる', async () => {
			const folder = (
				await api(
					'drive/folders/create',
					{
						name: 'test',
					},
					alice,
				)
			).body;
			const parentFolder = (
				await api(
					'drive/folders/create',
					{
						name: 'parent',
					},
					alice,
				)
			).body;
			await api(
				'drive/folders/update',
				{
					folderId: folder.id,
					parentId: parentFolder.id,
				},
				alice,
			);

			const res = await api(
				'drive/folders/update',
				{
					folderId: folder.id,
					parentId: null,
				},
				alice,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
			expect(res.body.parentId).toBe(null);
		});

		test('他人のフォルダを親フォルダに設定できない', async () => {
			const folder = (
				await api(
					'drive/folders/create',
					{
						name: 'test',
					},
					alice,
				)
			).body;
			const parentFolder = (
				await api(
					'drive/folders/create',
					{
						name: 'parent',
					},
					bob,
				)
			).body;

			const res = await api(
				'drive/folders/update',
				{
					folderId: folder.id,
					parentId: parentFolder.id,
				},
				alice,
			);

			expect(res.status).toBe(400);
		});

		test('フォルダが循環するような構造にできない', async () => {
			const folder = (
				await api(
					'drive/folders/create',
					{
						name: 'test',
					},
					alice,
				)
			).body;
			const parentFolder = (
				await api(
					'drive/folders/create',
					{
						name: 'parent',
					},
					alice,
				)
			).body;
			await api(
				'drive/folders/update',
				{
					folderId: parentFolder.id,
					parentId: folder.id,
				},
				alice,
			);

			const res = await api(
				'drive/folders/update',
				{
					folderId: folder.id,
					parentId: parentFolder.id,
				},
				alice,
			);

			expect(res.status).toBe(400);
		});

		test('フォルダが循環するような構造にできない(再帰的)', async () => {
			const folderA = (
				await api(
					'drive/folders/create',
					{
						name: 'test',
					},
					alice,
				)
			).body;
			const folderB = (
				await api(
					'drive/folders/create',
					{
						name: 'test',
					},
					alice,
				)
			).body;
			const folderC = (
				await api(
					'drive/folders/create',
					{
						name: 'test',
					},
					alice,
				)
			).body;
			await api(
				'drive/folders/update',
				{
					folderId: folderB.id,
					parentId: folderA.id,
				},
				alice,
			);
			await api(
				'drive/folders/update',
				{
					folderId: folderC.id,
					parentId: folderB.id,
				},
				alice,
			);

			const res = await api(
				'drive/folders/update',
				{
					folderId: folderA.id,
					parentId: folderC.id,
				},
				alice,
			);

			expect(res.status).toBe(400);
		});

		test('フォルダが循環するような構造にできない(自身)', async () => {
			const folderA = (
				await api(
					'drive/folders/create',
					{
						name: 'test',
					},
					alice,
				)
			).body;

			const res = await api(
				'drive/folders/update',
				{
					folderId: folderA.id,
					parentId: folderA.id,
				},
				alice,
			);

			expect(res.status).toBe(400);
		});

		test('存在しない親フォルダを設定できない', async () => {
			const folder = (
				await api(
					'drive/folders/create',
					{
						name: 'test',
					},
					alice,
				)
			).body;

			const res = await api(
				'drive/folders/update',
				{
					folderId: folder.id,
					parentId: '000000000000000000000000',
				},
				alice,
			);

			expect(res.status).toBe(400);
		});

		test('不正な親フォルダIDで怒られる', async () => {
			const folder = (
				await api(
					'drive/folders/create',
					{
						name: 'test',
					},
					alice,
				)
			).body;

			const res = await api(
				'drive/folders/update',
				{
					folderId: folder.id,
					parentId: 'foo',
				},
				alice,
			);

			expect(res.status).toBe(400);
		});

		test('存在しないフォルダを更新できない', async () => {
			const res = await api(
				'drive/folders/update',
				{
					folderId: '000000000000000000000000',
				},
				alice,
			);

			expect(res.status).toBe(400);
		});

		test('不正なフォルダIDで怒られる', async () => {
			const res = await api(
				'drive/folders/update',
				{
					folderId: 'foo',
				},
				alice,
			);

			expect(res.status).toBe(400);
		});
	});

});
