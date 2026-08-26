/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as assert from 'assert';
import * as Bull from 'bullmq';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { toXListId } from '@/server/rest/notification/notification.js';
import type {
	DbJobData,
	DeliverJobData,
	InboxJobData,
	ObjectStorageJobData,
	PostScheduledNoteJobData,
	RelationshipJobData,
	SystemWebhookDeliverJobData,
} from '@/queue/types.js';
import { closeRedisConnection, createRedisClient } from '@/runtime-dependencies.js';
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
import { createEndpointsContext, type EndpointsContext, getAt, getDefined } from '../endpoints-context.js';

/*
 * アサーションは vitest の expect に寄せているが、判別可能ユニオンの分岐を確定させる箇所だけ
 * node:assert を使う。expect の matcher は `asserts` 述語を持たないため、判別子を検査しても
 * 後続のプロパティアクセスが型エラーになる。
 */

describe('Endpoints', () => {
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let carol: misskey.entities.SignupResponse;
	let db: TestDatabase;
	let dbQueue: Bull.Queue<DbJobData<'importCustomEmojis' | 'deleteAccount'>> | undefined;
	let context: EndpointsContext;

	beforeAll(async () => {
		context = await createEndpointsContext();
		({ alice, bob, carol, db, dbQueue } = context);
	}, 1000 * 60 * 2);

	afterAll(async () => {
		await context.close();
	});

	describe('api metadata', () => {
		test('endpoints returns known endpoint names', async () => {
			const res = await api('endpoints', {});

			expect(res.status).toBe(200);
			assert.ok(Array.isArray(res.body));
			assert.ok(res.body.includes('endpoint'));
			assert.ok(res.body.includes('endpoints'));
			assert.ok(res.body.includes('i'));
		});

		test('endpoint returns parameter metadata and null for missing endpoint', async () => {
			const res = await api('endpoint', {
				endpoint: 'i/update',
			});

			expect(res.status).toBe(200);
			if (res.body == null) expect.unreachable('endpoint metadata is missing');
			assert.ok(Array.isArray(res.body.params));
			assert.ok(res.body.params.some((param) => param.name === 'name' && param.type === 'String'));

			const missing = await api('endpoint', {
				endpoint: 'missing/endpoint',
			});

			expect(missing.status).toBe(200);
			expect(missing.body).toBe(null);
		});
	});


	describe('basic meta endpoints', () => {
		test('meta returns lite and detailed metadata', async () => {
			const lite = await api('meta', {
				detail: false,
			});

			expect(lite.status).toBe(200);
			expect(lite.body.uri).toBe(origin);
			expect(typeof lite.body.version).toBe('string');
			expect((lite.body as Record<string, unknown>)['features']).toBe(undefined);

			const detailed = await api('meta', {});
			const detailedBody = detailed.body as {
				uri: string;
				features?: { miauth?: boolean };
				proxyAccountName?: unknown;
			};

			expect(detailed.status).toBe(200);
			expect(detailedBody.uri).toBe(origin);
			if (detailedBody.features == null) expect.unreachable('detailed meta features are missing');
			expect(detailedBody.features.miauth).toBe(true);
			expect(typeof detailedBody.proxyAccountName).toBe('string');
		});

		test('ping returns current timestamp', async () => {
			const before = Date.now();
			const res = await api('ping', {});
			const after = Date.now();

			expect(res.status).toBe(200);
			expect(typeof res.body.pong).toBe('number');
			assert.ok(res.body.pong >= before);
			assert.ok(res.body.pong <= after);
		});

		test('server-info supports GET and cache header', async () => {
			const res = await relativeFetch('api/server-info');

			expect(res.status).toBe(200);
			expect(res.headers.get('cache-control')).toBe('public, max-age=60');

			const body = (await res.json()) as {
				machine: unknown;
				cpu?: { model?: unknown; cores?: unknown };
				mem?: { total?: unknown };
				fs?: { total?: unknown; used?: unknown };
			};
			expect(typeof body.machine).toBe('string');
			expect(typeof body.cpu?.model).toBe('string');
			expect(typeof body.cpu?.cores).toBe('number');
			expect(typeof body.mem?.total).toBe('number');
			expect(typeof body.fs?.total).toBe('number');
			expect(typeof body.fs?.used).toBe('number');
		});

		test('test endpoint validates params and applies defaults', async () => {
			const res = await api('test', {
				required: true,
			});

			expect(res.status).toBe(200);
			expect(res.body.required).toBe(true);
			expect(res.body.default).toBe('hello');
			expect(res.body.nullableDefault).toBe('hello');

			const invalid = await relativeFetch('api/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ required: 'yes' }),
			});

			expect(invalid.status).toBe(400);
			expect(castAsError((await invalid.json()) as Record<string, unknown>).error.code).toBe('INVALID_PARAM');
		});
	});


	describe('account blocking endpoints', () => {
		test('blocking はDB、follow cleanup、list membership cleanup、list、delete、scope、エラーを維持する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const blocker = await signup({ username: `hblock${suffix}` });
			const blockee = await signup({ username: `hblockee${suffix}` });

			await createFollowingInDatabase(db, {
				id: genId(now),
				followerId: blocker.id,
				followeeId: blockee.id,
			});
			await createFollowingInDatabase(db, {
				id: genId(now + 1),
				followerId: blockee.id,
				followeeId: blocker.id,
			});
			await updateUserInDatabase(db, blocker.id, {
				followingCount: 1,
				followersCount: 1,
			});
			await updateUserInDatabase(db, blockee.id, {
				followingCount: 1,
				followersCount: 1,
			});

			await createFollowRequestInDatabase(db, {
				id: genId(now + 2),
				followerId: blocker.id,
				followeeId: blockee.id,
			});
			await createFollowRequestInDatabase(db, {
				id: genId(now + 3),
				followerId: blockee.id,
				followeeId: blocker.id,
			});

			const userList = await createUserListInDatabase(db, {
				id: genId(now + 4),
				userId: blockee.id,
				name: `hblock-list-${suffix}`,
			});
			await createUserListMembershipInDatabase(db, {
				id: genId(now + 5),
				userId: blocker.id,
				userListId: userList.id,
				userListUserId: blockee.id,
			});

			const wrongWriteToken = await createAppToken(blocker, ['read:blocks']);
			const createScopeDenied = await api('blocking/create', { userId: blockee.id }, { token: wrongWriteToken });
			expect(createScopeDenied.status).toBe(403);
			expect(castAsError(createScopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const selfBlock = await api('blocking/create', { userId: blocker.id }, blocker);
			expect(selfBlock.status).toBe(400);
			expect(castAsError(selfBlock.body as any).error.code).toBe('BLOCKEE_IS_YOURSELF');
			expect(castAsError(selfBlock.body as any).error.id).toBe('88b19138-f28d-42c0-8499-6a31bbd0fdc6');

			const noSuch = await api('blocking/create', { userId: genId(now - 1000) }, blocker);
			expect(noSuch.status).toBe(400);
			expect(castAsError(noSuch.body as any).error.code).toBe('NO_SUCH_USER');
			expect(castAsError(noSuch.body as any).error.id).toBe('7cc4f851-e2f1-4621-9633-ec9e1d00c01e');

			const created = await api('blocking/create', { userId: blockee.id }, blocker);
			expect(created.status).toBe(200);
			expect(created.body.id).toBe(blockee.id);

			const blocking = await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(db, blocker.id, blockee.id);
			assert.ok(blocking);
			expect(blocking.blockerId).toBe(blocker.id);
			expect(blocking.blockeeId).toBe(blockee.id);
			expect(await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(db, blocker.id, blockee.id)).toBe(null);
			expect(await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(db, blockee.id, blocker.id)).toBe(null);
			expect(await fetchFollowRequestFromDatabase(db, blocker.id, blockee.id)).toBe(null);
			expect(await fetchFollowRequestFromDatabase(db, blockee.id, blocker.id)).toBe(null);
			expect(await userListMembershipExistsInDatabase(db, blocker.id, userList.id)).toBe(false);

			const refreshedBlocker = await fetchUserByIdOrFailFromDatabase(db, blocker.id);
			const refreshedBlockee = await fetchUserByIdOrFailFromDatabase(db, blockee.id);
			expect(refreshedBlocker.followingCount).toBe(0);
			expect(refreshedBlocker.followersCount).toBe(0);
			expect(refreshedBlockee.followingCount).toBe(0);
			expect(refreshedBlockee.followersCount).toBe(0);

			const duplicate = await api('blocking/create', { userId: blockee.id }, blocker);
			expect(duplicate.status).toBe(400);
			expect(castAsError(duplicate.body as any).error.code).toBe('ALREADY_BLOCKING');
			expect(castAsError(duplicate.body as any).error.id).toBe('787fed64-acb9-464a-82eb-afbd745b9614');

			const readToken = await createAppToken(blocker, ['read:blocks']);
			const list = await api('blocking/list', { limit: 10 }, { token: readToken });
			expect(list.status).toBe(200);
			const listed = (list.body as any[]).find((item) => item.blockeeId === blockee.id);
			assert.ok(listed);
			expect(listed.id).toBe(blocking.id);
			expect(listed.blockee.id).toBe(blockee.id);

			const wrongReadToken = await createAppToken(blocker, ['write:blocks']);
			const listScopeDenied = await api('blocking/list', {}, { token: wrongReadToken });
			expect(listScopeDenied.status).toBe(403);
			expect(castAsError(listScopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const deleted = await api('blocking/delete', { userId: blockee.id }, blocker);
			expect(deleted.status).toBe(200);
			expect(deleted.body.id).toBe(blockee.id);
			expect(await fetchBlockingByBlockerIdAndBlockeeIdFromDatabase(db, blocker.id, blockee.id)).toBe(null);

			const notBlocking = await api('blocking/delete', { userId: blockee.id }, blocker);
			expect(notBlocking.status).toBe(400);
			expect(castAsError(notBlocking.body as any).error.code).toBe('NOT_BLOCKING');
			expect(castAsError(notBlocking.body as any).error.id).toBe('291b2efa-60c6-45c0-9f6a-045c8f9b02cd');
		});
	});


	describe('account mute endpoints', () => {
		test('mute と renote-mute はDB、list、delete、scope、エラーを維持する', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const muter = await signup({ username: `hmute${suffix}` });
			const mutee = await signup({ username: `hmutee${suffix}` });
			const renoteMutee = await signup({ username: `hrmutee${suffix}` });
			const expiresAt = Date.now() + 1000 * 60 * 60;

			const wrongWriteToken = await createAppToken(muter, ['read:mutes']);
			const muteScopeDenied = await api('mute/create', { userId: mutee.id }, { token: wrongWriteToken });
			expect(muteScopeDenied.status).toBe(403);
			expect(castAsError(muteScopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const created = await api('mute/create', { userId: mutee.id, expiresAt }, muter);
			expect(created.status).toBe(204);
			const muting = await fetchMutingByMuterIdAndMuteeIdFromDatabase(db, muter.id, mutee.id);
			assert.ok(muting);
			expect(muting.muterId).toBe(muter.id);
			expect(muting.muteeId).toBe(mutee.id);
			expect(muting.expiresAt?.getTime()).toBe(expiresAt);

			const duplicate = await api('mute/create', { userId: mutee.id }, muter);
			expect(duplicate.status).toBe(400);
			expect(castAsError(duplicate.body as any).error.code).toBe('ALREADY_MUTING');

			const selfMute = await api('mute/create', { userId: muter.id }, muter);
			expect(selfMute.status).toBe(400);
			expect(castAsError(selfMute.body as any).error.code).toBe('MUTEE_IS_YOURSELF');

			const pastMuteTarget = await signup({ username: `hpmute${suffix}` });
			const pastMute = await api('mute/create', { userId: pastMuteTarget.id, expiresAt: Date.now() - 1000 }, muter);
			expect(pastMute.status).toBe(204);
			expect(await fetchMutingByMuterIdAndMuteeIdFromDatabase(db, muter.id, pastMuteTarget.id)).toBe(null);

			const readToken = await createAppToken(muter, ['read:mutes']);
			const list = await api('mute/list', { limit: 10 }, { token: readToken });
			expect(list.status).toBe(200);
			const listed = (list.body as any[]).find((item) => item.muteeId === mutee.id);
			assert.ok(listed);
			expect(listed.id).toBe(muting.id);
			expect(listed.mutee.id).toBe(mutee.id);
			expect(listed.expiresAt).toBe(new Date(expiresAt).toISOString());

			const wrongReadToken = await createAppToken(muter, ['write:mutes']);
			const listScopeDenied = await api('mute/list', {}, { token: wrongReadToken });
			expect(listScopeDenied.status).toBe(403);
			expect(castAsError(listScopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const deleted = await api('mute/delete', { userId: mutee.id }, muter);
			expect(deleted.status).toBe(204);
			expect(await fetchMutingByMuterIdAndMuteeIdFromDatabase(db, muter.id, mutee.id)).toBe(null);

			const notMuting = await api('mute/delete', { userId: mutee.id }, muter);
			expect(notMuting.status).toBe(400);
			expect(castAsError(notMuting.body as any).error.code).toBe('NOT_MUTING');

			const renoteScopeDenied = await api('renote-mute/create', { userId: renoteMutee.id }, { token: wrongWriteToken });
			expect(renoteScopeDenied.status).toBe(403);
			expect(castAsError(renoteScopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const renoteCreated = await api('renote-mute/create', { userId: renoteMutee.id }, muter);
			expect(renoteCreated.status).toBe(204);
			const renoteMuting = await fetchRenoteMutingFromDatabase(db, muter.id, renoteMutee.id);
			assert.ok(renoteMuting);
			expect(renoteMuting.muterId).toBe(muter.id);
			expect(renoteMuting.muteeId).toBe(renoteMutee.id);

			const renoteDuplicate = await api('renote-mute/create', { userId: renoteMutee.id }, muter);
			expect(renoteDuplicate.status).toBe(400);
			expect(castAsError(renoteDuplicate.body as any).error.code).toBe('ALREADY_MUTING');

			const renoteList = await api('renote-mute/list', { limit: 10 }, { token: readToken });
			expect(renoteList.status).toBe(200);
			const renoteListed = (renoteList.body as any[]).find((item) => item.muteeId === renoteMutee.id);
			assert.ok(renoteListed);
			expect(renoteListed.id).toBe(renoteMuting.id);
			expect(renoteListed.mutee.id).toBe(renoteMutee.id);

			const renoteDeleted = await api('renote-mute/delete', { userId: renoteMutee.id }, muter);
			expect(renoteDeleted.status).toBe(204);
			expect(await fetchRenoteMutingFromDatabase(db, muter.id, renoteMutee.id)).toBe(null);

			const renoteNotMuting = await api('renote-mute/delete', { userId: renoteMutee.id }, muter);
			expect(renoteNotMuting.status).toBe(400);
			expect(castAsError(renoteNotMuting.body as any).error.code).toBe('NOT_MUTING');
		});
	});


	describe('availability endpoints', () => {
		test('username availability reflects existing local users', async () => {
			const available = await api('username/available', {
				username: 'availableuser',
			});
			expect(available.status).toBe(200);
			expect(available.body.available).toBe(true);

			const taken = await api('username/available', {
				username: alice.username,
			});
			expect(taken.status).toBe(200);
			expect(taken.body.available).toBe(false);

			const invalid = await api('username/available', {
				username: 'invalid.user',
			});
			expect(invalid.status).toBe(400);
		});

		test('email address availability validates format', async () => {
			const available = await api('email-address/available', {
				emailAddress: 'available@example.com',
			});
			expect(available.status).toBe(200);
			expect(available.body.available).toBe(true);
			expect(available.body.reason).toBe(null);

			const invalid = await api('email-address/available', {
				emailAddress: 'invalid-email',
			});
			expect(invalid.status).toBe(200);
			expect(invalid.body.available).toBe(false);
			expect(invalid.body.reason).toBe('format');
		});

		test('online users count supports GET and cache header', async () => {
			const res = await relativeFetch('api/get-online-users-count');

			expect(res.status).toBe(200);
			expect(res.headers.get('cache-control')).toBe('public, max-age=60');

			const body = (await res.json()) as { count?: unknown };
			expect(typeof body.count).toBe('number');
		});
	});


	describe('retention endpoint', () => {
		test('retention supports GET and returns latest aggregation data', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			await createRetentionAggregationInDatabase(db, {
				id: genId(now),
				createdAt: new Date(now),
				updatedAt: new Date(now),
				dateKey: `hono-retention-${now}`,
				userIds: [alice.id],
				usersCount: 1,
				data: { '1': 1 },
			});
			const latest = {
				id: genId(now + 1),
				createdAt: new Date(now + 1),
				updatedAt: new Date(now + 1),
				dateKey: `hono-retention-${now + 1}`,
				userIds: [alice.id, bob.id],
				usersCount: 2,
				data: { '1': 2, '2': 1 },
			};
			await createRetentionAggregationInDatabase(db, latest);

			const res = await relativeFetch('api/retention');
			expect(res.status).toBe(200);
			expect(res.headers.get('cache-control')).toBe('public, max-age=3600');

			const body = (await res.json()) as { createdAt?: unknown; users?: unknown; data?: Record<string, unknown> }[];
			const record = body.find((item) => item.createdAt === latest.createdAt.toISOString());
			assert.ok(record);
			expect(record.users).toBe(latest.usersCount);
			expect(record.data).toStrictEqual(latest.data);
		});
	});


	describe('announcement endpoints', () => {
		test('announcements list and show respect user-specific visibility', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const globalAnnouncement = await createAnnouncementInDatabase(db, {
				id: genId(now),
				updatedAt: null,
				title: 'Global announcement',
				text: 'Visible to everyone',
				imageUrl: null,
				icon: 'info',
				display: 'normal',
				needConfirmationToRead: false,
				isActive: true,
				forExistingUsers: false,
				silence: false,
				userId: null,
			});
			const userAnnouncement = await createAnnouncementInDatabase(db, {
				id: genId(now + 1),
				updatedAt: null,
				title: 'User announcement',
				text: 'Visible to Alice only',
				imageUrl: null,
				icon: 'success',
				display: 'banner',
				needConfirmationToRead: true,
				isActive: true,
				forExistingUsers: false,
				silence: false,
				userId: alice.id,
			});
			await createAnnouncementReadInDatabase(db, {
				id: genId(now + 2),
				announcementId: globalAnnouncement.id,
				userId: alice.id,
			});

			const anonymousList = await api('announcements', { limit: 10 });
			expect(anonymousList.status).toBe(200);
			assert.ok(anonymousList.body.some((announcement) => announcement.id === globalAnnouncement.id));
			assert.ok(!anonymousList.body.some((announcement) => announcement.id === userAnnouncement.id));

			const aliceList = await api('announcements', { limit: 10 }, alice);
			expect(aliceList.status).toBe(200);
			const listedGlobal = aliceList.body.find((announcement) => announcement.id === globalAnnouncement.id);
			const listedUser = aliceList.body.find((announcement) => announcement.id === userAnnouncement.id);
			expect(listedGlobal?.isRead).toBe(true);
			expect(listedUser?.forYou).toBe(true);
			expect(listedUser?.isRead).toBe(false);

			const shownGlobal = await api('announcements/show', {
				announcementId: globalAnnouncement.id,
			});
			expect(shownGlobal.status).toBe(200);
			expect(shownGlobal.body.title).toBe(globalAnnouncement.title);

			const hiddenUser = await api('announcements/show', {
				announcementId: userAnnouncement.id,
			});
			expect(hiddenUser.status).toBe(404);
			expect(castAsError(hiddenUser.body as any).error.code).toBe('NO_SUCH_ANNOUNCEMENT');

			const shownUser = await api(
				'announcements/show',
				{
					announcementId: userAnnouncement.id,
				},
				alice,
			);
			expect(shownUser.status).toBe(200);
			expect(shownUser.body.forYou).toBe(true);
			expect(shownUser.body.needConfirmationToRead).toBe(true);
		});

		test('i/read-announcement は既読化し全既読ならreadAllAnnouncementsを発行する', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const reader = await signup({ username: `hra${suffix}` });
			const announcement = await createAnnouncementInDatabase(db, {
				id: genId(now),
				updatedAt: null,
				title: 'Read test announcement',
				text: 'text',
				imageUrl: null,
				icon: 'info',
				display: 'normal',
				needConfirmationToRead: false,
				isActive: true,
				forExistingUsers: false,
				silence: false,
				userId: reader.id,
			});

			const res = await api('i/read-announcement', { announcementId: announcement.id }, reader);
			expect(res.status).toBe(204);

			const read = await announcementReadExistsInDatabase(db, reader.id, announcement.id);
			expect(read).toBe(true);

			const stillUnread = await api('i/read-announcement', { announcementId: announcement.id }, reader);
			expect(stillUnread.status).toBe(204);
		});
	});


	describe('fetch-rss endpoint', () => {
		let rssServer: Server | undefined;

		afterAll(async () => {
			await new Promise<void>((resolve, reject) => {
				if (rssServer == null || !rssServer.listening) {
					resolve();
					return;
				}

				rssServer.close((error) => (error ? reject(error) : resolve()));
			});
		});

		test('fetch-rss parses RSS over POST and GET', async () => {
			const rssXml = [
				'<?xml version="1.0" encoding="UTF-8" ?>',
				'<rss version="2.0">',
				'<channel>',
				'<title>Hono RSS Feed</title>',
				'<link>https://example.com/</link>',
				'<description>RSS fixture</description>',
				'<item>',
				'<title>First entry</title>',
				'<link>https://example.com/entry</link>',
				'<guid>entry-1</guid>',
				'<pubDate>Tue, 01 Jul 2025 00:00:00 GMT</pubDate>',
				'</item>',
				'</channel>',
				'</rss>',
			].join('');

			rssServer = createServer((req, res) => {
				res.writeHead(200, {
					'Content-Type': 'application/rss+xml; charset=utf-8',
				});
				res.end(rssXml);
			});
			await new Promise<void>((resolve, reject) => {
				rssServer!.once('error', reject);
				rssServer!.listen(0, '127.0.0.1', () => {
					rssServer!.off('error', reject);
					resolve();
				});
			});
			const address = rssServer.address() as AddressInfo;
			const url = `http://127.0.0.1:${address.port}/feed.xml`;

			const post = await api('fetch-rss', { url });
			expect(post.status).toBe(200);
			expect(post.body.title).toBe('Hono RSS Feed');
			expect(getAt(post.body.items, 0).title).toBe('First entry');
			expect(getAt(post.body.items, 0).guid).toBe('entry-1');

			const get = await relativeFetch(`api/fetch-rss?url=${encodeURIComponent(url)}`);
			expect(get.status).toBe(200);
			expect(get.headers.get('cache-control')).toBe('public, max-age=180');
			const getBody = (await get.json()) as { title?: string; items?: { title?: string }[] };
			expect(getBody.title).toBe('Hono RSS Feed');
			expect(getAt(getDefined(getBody.items), 0).title).toBe('First entry');
		});
	});


	describe('promo/read endpoint', () => {
		test('admin/promo/create はpromo note作成、重複、権限を維持する', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const noteId = genId();
			await createNoteInDatabase(db, {
				id: noteId,
				text: 'admin promo create target',
				userId: alice.id,
				userHost: null,
				visibility: 'public',
			});

			const created = await api('admin/promo/create', { noteId, expiresAt: now + 60_000 }, alice);
			expect(created.status).toBe(204);
			expect(await isPromoNoteExists(db, noteId)).toBe(true);

			const duplicate = await api('admin/promo/create', { noteId, expiresAt: now + 120_000 }, alice);
			expect(duplicate.status).toBe(400);
			expect(castAsError(duplicate.body as any).error.code).toBe('ALREADY_PROMOTED');
			expect(castAsError(duplicate.body as any).error.id).toBe('ae427aa2-7a41-484f-a18c-2c1104051604');

			const missing = await api('admin/promo/create', { noteId: genId(), expiresAt: now + 60_000 }, alice);
			expect(missing.status).toBe(400);
			expect(castAsError(missing.body as any).error.code).toBe('NO_SUCH_NOTE');
			expect(castAsError(missing.body as any).error.id).toBe('ee449fbe-af2a-453b-9cae-cf2fe7c895fc');

			const writeToken = await createAppToken(alice, ['write:admin:promo']);
			const tokenNoteId = genId();
			await createNoteInDatabase(db, {
				id: tokenNoteId,
				text: 'admin promo create token target',
				userId: alice.id,
				userHost: null,
				visibility: 'public',
			});
			const createdWithToken = await api(
				'admin/promo/create',
				{ noteId: tokenNoteId, expiresAt: now + 60_000 },
				{ token: writeToken },
			);
			expect(createdWithToken.status).toBe(204);

			const deniedToken = await createAppToken(alice, ['read:admin:queue']);
			const scopeDenied = await api(
				'admin/promo/create',
				{ noteId: genId(), expiresAt: now + 60_000 },
				{ token: deniedToken },
			);
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `honopromo${now.toString(36)}` });
			const roleDenied = await api('admin/promo/create', { noteId: genId(), expiresAt: now + 60_000 }, normalUser);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
		});

		test('promo/read records a promoted note as read idempotently', async () => {
			const config = fixtureConfig;
			const noteId = genId();
			await createNoteInDatabase(db, {
				id: noteId,
				text: 'promo read target',
				userId: alice.id,
				userHost: null,
				visibility: 'public',
			});

			const read = await api('promo/read', { noteId }, bob);
			expect(read.status).toBe(204);
			expect(read.body).toBe(null);
			expect(await isPromoReadExists(db, bob.id, noteId)).toBe(true);

			const duplicate = await api('promo/read', { noteId }, bob);
			expect(duplicate.status).toBe(204);

			const missing = await api('promo/read', { noteId: genId() }, bob);
			expect(missing.status).toBe(400);
			expect(castAsError(missing.body as any).error.code).toBe('NO_SUCH_NOTE');
		});

		test('promo/read requires write account permission for app tokens', async () => {
			const config = fixtureConfig;
			const noteId = genId();
			await createNoteInDatabase(db, {
				id: noteId,
				text: 'promo read app token target',
				userId: alice.id,
				userHost: null,
				visibility: 'public',
			});
			const appToken = await createAppToken(bob, ['read:account']);

			const denied = await api('promo/read', { noteId }, { token: appToken });
			expect(denied.status).toBe(403);
			expect(castAsError(denied.body as any).error.code).toBe('PERMISSION_DENIED');
		});
	});


	describe('favorite and like endpoints', () => {
		async function createFavoriteFixtures(prefix: string) {
			const config = fixtureConfig;
			const userList = await createUserListInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `${prefix}-list`,
				isPublic: true,
			});
			const clip = await createClipInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `${prefix}-clip`,
				isPublic: true,
			});
			const channel = await createChannelInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `${prefix}-channel`,
			});
			const page = await createPageInDatabase(db, {
				id: genId(),
				updatedAt: new Date(),
				title: `${prefix} page`,
				name: `${prefix}-page`,
				summary: null,
				alignCenter: false,
				hideTitleWhenPinned: false,
				font: 'sans-serif',
				userId: alice.id,
				eyeCatchingImageId: null,
				content: [],
				variables: [],
				script: '',
				visibility: 'public',
			});
			const flash = await createFlashInDatabase(db, {
				id: genId(),
				updatedAt: new Date(),
				title: `${prefix} flash`,
				summary: '',
				userId: alice.id,
				script: '',
				permissions: [],
				visibility: 'public',
			});

			return { userList, clip, channel, page, flash };
		}

		test('users/lists favorite endpoints create, reject duplicates, and delete favorites', async () => {
			const { userList } = await createFavoriteFixtures(`hono-favorite-list-${Date.now()}`);

			const favorite = await api('users/lists/favorite', { listId: userList.id }, bob);
			expect(favorite.status).toBe(204);
			expect(await userListFavoriteExistsInDatabase(db, bob.id, userList.id)).toBe(true);

			const duplicate = await api('users/lists/favorite', { listId: userList.id }, bob);
			expect(duplicate.status).toBe(400);
			expect(castAsError(duplicate.body as any).error.code).toBe('ALREADY_FAVORITED');
			expect(castAsError(duplicate.body as any).error.id).toBe('6425bba0-985b-461e-af1b-518070e72081');

			const unfavorite = await api('users/lists/unfavorite', { listId: userList.id }, bob);
			expect(unfavorite.status).toBe(204);
			expect(await userListFavoriteExistsInDatabase(db, bob.id, userList.id)).toBe(false);

			const missingFavorite = await api('users/lists/unfavorite', { listId: userList.id }, bob);
			expect(missingFavorite.status).toBe(400);
			expect(castAsError(missingFavorite.body as any).error.id).toBe('835c4b27-463d-4cfa-969b-a9058678d465');
		});

		test('clip, channel, page, and flash endpoints keep lifecycle semantics', async () => {
			const { clip, channel, page, flash } = await createFavoriteFixtures(`hono-favorite-${Date.now()}`);

			const clipFavorite = await api('clips/favorite', { clipId: clip.id }, bob);
			expect(clipFavorite.status).toBe(204);
			expect(await clipFavoriteExistsInDatabase(db, bob.id, clip.id)).toBe(true);

			const duplicateClipFavorite = await api('clips/favorite', { clipId: clip.id }, bob);
			expect(duplicateClipFavorite.status).toBe(400);
			expect(castAsError(duplicateClipFavorite.body as any).error.id).toBe('92658936-c625-4273-8326-2d790129256e');

			const clipUnfavorite = await api('clips/unfavorite', { clipId: clip.id }, bob);
			expect(clipUnfavorite.status).toBe(204);
			expect(await clipFavoriteExistsInDatabase(db, bob.id, clip.id)).toBe(false);

			const channelFavorite = await api('channels/favorite', { channelId: channel.id }, bob);
			expect(channelFavorite.status).toBe(204);
			expect(await channelFavoriteExistsInDatabase(db, bob.id, channel.id)).toBe(true);

			const channelUnfavorite = await api('channels/unfavorite', { channelId: channel.id }, bob);
			expect(channelUnfavorite.status).toBe(204);
			expect(await channelFavoriteExistsInDatabase(db, bob.id, channel.id)).toBe(false);

			const pageLike = await api('pages/like', { pageId: page.id }, bob);
			expect(pageLike.status).toBe(204);
			expect(await pageLikeExistsInDatabase(db, bob.id, page.id)).toBe(true);

			const ownPageLike = await api('pages/like', { pageId: page.id }, alice);
			expect(ownPageLike.status).toBe(400);
			expect(castAsError(ownPageLike.body as any).error.id).toBe('28800466-e6db-40f2-8fae-bf9e82aa92b8');

			const pageUnlike = await api('pages/unlike', { pageId: page.id }, bob);
			expect(pageUnlike.status).toBe(204);
			expect(await pageLikeExistsInDatabase(db, bob.id, page.id)).toBe(false);

			const flashLike = await api('flash/like', { flashId: flash.id }, bob);
			expect(flashLike.status).toBe(204);
			expect(await flashLikeExistsInDatabase(db, bob.id, flash.id)).toBe(true);

			const ownFlashLike = await api('flash/like', { flashId: flash.id }, alice);
			expect(ownFlashLike.status).toBe(400);
			expect(castAsError(ownFlashLike.body as any).error.id).toBe('3fd8a0e7-5955-4ba9-85bb-bf3e0c30e13b');

			const flashUnlike = await api('flash/unlike', { flashId: flash.id }, bob);
			expect(flashUnlike.status).toBe(204);
			expect(await flashLikeExistsInDatabase(db, bob.id, flash.id)).toBe(false);
		});

		test('favorite and like endpoints require matching app token permissions', async () => {
			const { userList, clip, channel, page, flash } = await createFavoriteFixtures(
				`hono-favorite-permission-${Date.now()}`,
			);
			const appToken = await createAppToken(bob, ['read:account']);

			for (const [endpoint, params] of [
				['users/lists/favorite', { listId: userList.id }],
				['clips/favorite', { clipId: clip.id }],
				['channels/favorite', { channelId: channel.id }],
				['pages/like', { pageId: page.id }],
				['flash/like', { flashId: flash.id }],
			] as const) {
				const denied = await api(endpoint, params as any, { token: appToken });
				expect(denied.status, endpoint).toBe(403);
				expect(castAsError(denied.body as any).error.code, endpoint).toBe('PERMISSION_DENIED');
			}
		});

		test('prohibitMoved endpoints reject moved users before side effects', async () => {
			const { page } = await createFavoriteFixtures(`hono-favorite-moved-${Date.now()}`);
			const movedUser = await signup({ username: `mvfav${Date.now().toString(36)}` });
			await updateUserInDatabase(db, movedUser.id, {
				movedToUri: `${origin}/users/${alice.id}`,
			});

			const denied = await api('pages/like', { pageId: page.id }, movedUser);
			expect(denied.status).toBe(403);
			expect(castAsError(denied.body as any).error.code).toBe('YOUR_ACCOUNT_MOVED');
			expect(castAsError(denied.body as any).error.id).toBe('56f20ec9-fd06-4fa5-841b-edd6d7d4fa31');
			expect(await pageLikeExistsInDatabase(db, movedUser.id, page.id)).toBe(false);
		});
	});


	describe('Hono rate limited write endpoints', () => {
		test('following/create は follow 作成、locked follow request、blocking、scope、エラーを維持する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const follower = await signup({ username: `hfc${suffix}` });
			const followee = await signup({ username: `hfce${suffix}` });

			const wrongWriteToken = await createAppToken(follower, ['read:following']);
			const scopeDenied = await api('following/create', { userId: followee.id }, { token: wrongWriteToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const selfFollow = await api('following/create', { userId: follower.id }, follower);
			expect(selfFollow.status).toBe(400);
			expect(castAsError(selfFollow.body as any).error.code).toBe('FOLLOWEE_IS_YOURSELF');
			expect(castAsError(selfFollow.body as any).error.id).toBe('26fbe7bb-a331-4857-af17-205b426669a9');

			const noSuch = await api('following/create', { userId: genId(now - 1000) }, follower);
			expect(noSuch.status).toBe(400);
			expect(castAsError(noSuch.body as any).error.code).toBe('NO_SUCH_USER');
			expect(castAsError(noSuch.body as any).error.id).toBe('fcd2eef9-a9b2-4c4f-8624-038099e90aa5');

			const created = await api('following/create', { userId: followee.id, withReplies: true }, follower);
			expect(created.status).toBe(200);
			expect(created.body.id).toBe(followee.id);

			const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(db, follower.id, followee.id);
			assert.ok(following);
			expect(following.withReplies).toBe(true);

			const refreshedFollower = await fetchUserByIdOrFailFromDatabase(db, follower.id);
			const refreshedFollowee = await fetchUserByIdOrFailFromDatabase(db, followee.id);
			expect(refreshedFollower.followingCount).toBe(1);
			expect(refreshedFollowee.followersCount).toBe(1);

			const duplicate = await api('following/create', { userId: followee.id }, follower);
			expect(duplicate.status).toBe(400);
			expect(castAsError(duplicate.body as any).error.code).toBe('ALREADY_FOLLOWING');
			expect(castAsError(duplicate.body as any).error.id).toBe('35387507-38c7-4cb9-9197-300b93783fa0');

			const blocker = await signup({ username: `hfcb${suffix}` });
			const blockedUser = await signup({ username: `hfcbu${suffix}` });
			const block = await api('blocking/create', { userId: blockedUser.id }, blocker);
			expect(block.status).toBe(200);

			const blocked = await api('following/create', { userId: blocker.id }, blockedUser);
			expect(blocked.status).toBe(400);
			expect(castAsError(blocked.body as any).error.code).toBe('BLOCKED');
			expect(castAsError(blocked.body as any).error.id).toBe('c4ab57cc-4e41-45e9-bfd9-584f61e35ce0');

			const lockedFollowee = await signup({ username: `hfcl${suffix}` });
			const requestFollower = await signup({ username: `hfcr${suffix}` });
			await updateUserInDatabase(db, lockedFollowee.id, { isLocked: true });

			const requested = await api(
				'following/create',
				{ userId: lockedFollowee.id, withReplies: false },
				requestFollower,
			);
			expect(requested.status).toBe(200);
			expect(requested.body.id).toBe(lockedFollowee.id);
			expect(await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(db, requestFollower.id, lockedFollowee.id)).toBe(
				null,
			);

			const followRequest = await fetchFollowRequestFromDatabase(db, requestFollower.id, lockedFollowee.id);
			assert.ok(followRequest);
			expect(followRequest.withReplies).toBe(false);
		});

		test('following/update は notify/withReplies 変更、scope、エラーを維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const follower = await signup({ username: `hfu${suffix}` });
			const followee = await signup({ username: `hfue${suffix}` });

			const wrongWriteToken = await createAppToken(follower, ['read:following']);
			const scopeDenied = await api(
				'following/update',
				{ userId: followee.id, notify: 'normal' },
				{ token: wrongWriteToken },
			);
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const selfUpdate = await api('following/update', { userId: follower.id, notify: 'normal' }, follower);
			expect(selfUpdate.status).toBe(400);
			expect(castAsError(selfUpdate.body as any).error.code).toBe('FOLLOWEE_IS_YOURSELF');
			expect(castAsError(selfUpdate.body as any).error.id).toBe('4c4cbaf9-962a-463b-8418-a5e365dbf2eb');

			const noSuch = await api('following/update', { userId: genId(Date.now() - 1000), notify: 'normal' }, follower);
			expect(noSuch.status).toBe(400);
			expect(castAsError(noSuch.body as any).error.code).toBe('NO_SUCH_USER');
			expect(castAsError(noSuch.body as any).error.id).toBe('14318698-f67e-492a-99da-5353a5ac52be');

			const notFollowing = await api('following/update', { userId: followee.id, notify: 'normal' }, follower);
			expect(notFollowing.status).toBe(400);
			expect(castAsError(notFollowing.body as any).error.code).toBe('NOT_FOLLOWING');
			expect(castAsError(notFollowing.body as any).error.id).toBe('b8dc75cf-1cb5-46c9-b14b-5f1ffbd782c9');

			await api('following/create', { userId: followee.id, withReplies: false }, follower);

			const updated = await api(
				'following/update',
				{ userId: followee.id, notify: 'normal', withReplies: true },
				follower,
			);
			expect(updated.status).toBe(200);
			expect(updated.body.id).toBe(follower.id);

			const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(db, follower.id, followee.id);
			expect(following?.notify).toBe('normal');
			expect(following?.withReplies).toBe(true);

			const clearedNotify = await api('following/update', { userId: followee.id, notify: 'none' }, follower);
			expect(clearedNotify.status).toBe(200);
			const refreshed = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(db, follower.id, followee.id);
			expect(refreshed?.notify).toBe(null);
			expect(refreshed?.withReplies).toBe(true);
		});

		test('following/delete は unfollow、カウント減算、scope、エラーを維持する', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const follower = await signup({ username: `hfd${suffix}` });
			const followee = await signup({ username: `hfde${suffix}` });

			const wrongWriteToken = await createAppToken(follower, ['read:following']);
			const scopeDenied = await api('following/delete', { userId: followee.id }, { token: wrongWriteToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const selfUnfollow = await api('following/delete', { userId: follower.id }, follower);
			expect(selfUnfollow.status).toBe(400);
			expect(castAsError(selfUnfollow.body as any).error.code).toBe('FOLLOWEE_IS_YOURSELF');
			expect(castAsError(selfUnfollow.body as any).error.id).toBe('d9e400b9-36b0-4808-b1d8-79e707f1296c');

			const noSuch = await api('following/delete', { userId: genId(Date.now() - 1000) }, follower);
			expect(noSuch.status).toBe(400);
			expect(castAsError(noSuch.body as any).error.code).toBe('NO_SUCH_USER');
			expect(castAsError(noSuch.body as any).error.id).toBe('5b12c78d-2b28-4dca-99d2-f56139b42ff8');

			const notFollowing = await api('following/delete', { userId: followee.id }, follower);
			expect(notFollowing.status).toBe(400);
			expect(castAsError(notFollowing.body as any).error.code).toBe('NOT_FOLLOWING');
			expect(castAsError(notFollowing.body as any).error.id).toBe('5dbf82f5-c92b-40b1-87d1-6c8c0741fd09');

			await api('following/create', { userId: followee.id, withReplies: true }, follower);
			assert.ok(await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(db, follower.id, followee.id));

			const deleted = await api('following/delete', { userId: followee.id }, follower);
			expect(deleted.status).toBe(200);
			expect(deleted.body.id).toBe(followee.id);

			expect(await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(db, follower.id, followee.id)).toBe(null);

			const refreshedFollower = await fetchUserByIdOrFailFromDatabase(db, follower.id);
			const refreshedFollowee = await fetchUserByIdOrFailFromDatabase(db, followee.id);
			expect(refreshedFollower.followingCount).toBe(0);
			expect(refreshedFollowee.followersCount).toBe(0);
		});

		test('following/invalidate は他人のフォローを解除、カウント減算、scope、エラーを維持する', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const followee = await signup({ username: `hfi${suffix}` });
			const follower = await signup({ username: `hfie${suffix}` });

			const wrongWriteToken = await createAppToken(followee, ['read:following']);
			const scopeDenied = await api('following/invalidate', { userId: follower.id }, { token: wrongWriteToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const selfInvalidate = await api('following/invalidate', { userId: followee.id }, followee);
			expect(selfInvalidate.status).toBe(400);
			expect(castAsError(selfInvalidate.body as any).error.code).toBe('FOLLOWER_IS_YOURSELF');
			expect(castAsError(selfInvalidate.body as any).error.id).toBe('07dc03b9-03da-422d-885b-438313707662');

			const noSuch = await api('following/invalidate', { userId: genId(Date.now() - 1000) }, followee);
			expect(noSuch.status).toBe(400);
			expect(castAsError(noSuch.body as any).error.code).toBe('NO_SUCH_USER');
			expect(castAsError(noSuch.body as any).error.id).toBe('b77e6ae6-a3e5-40da-9cc8-c240115479cc');

			const notFollowing = await api('following/invalidate', { userId: follower.id }, followee);
			expect(notFollowing.status).toBe(400);
			expect(castAsError(notFollowing.body as any).error.code).toBe('NOT_FOLLOWING');
			expect(castAsError(notFollowing.body as any).error.id).toBe('918faac3-074f-41ae-9c43-ed5d2946770d');

			await api('following/create', { userId: followee.id, withReplies: true }, follower);
			assert.ok(await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(db, follower.id, followee.id));

			const invalidated = await api('following/invalidate', { userId: follower.id }, followee);
			expect(invalidated.status).toBe(200);
			expect(invalidated.body.id).toBe(follower.id);

			expect(await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(db, follower.id, followee.id)).toBe(null);

			const refreshedFollower = await fetchUserByIdOrFailFromDatabase(db, follower.id);
			const refreshedFollowee = await fetchUserByIdOrFailFromDatabase(db, followee.id);
			expect(refreshedFollower.followingCount).toBe(0);
			expect(refreshedFollowee.followersCount).toBe(0);
		});

		test('following/requests/accept は保留リクエストを承認しfollowレコードを作成する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const followee = await signup({ username: `hra${suffix}` });
			const follower = await signup({ username: `hrae${suffix}` });
			await updateUserInDatabase(db, followee.id, { isLocked: true });

			const wrongWriteToken = await createAppToken(followee, ['read:following']);
			const scopeDenied = await api('following/requests/accept', { userId: follower.id }, { token: wrongWriteToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const noSuch = await api('following/requests/accept', { userId: genId(Date.now() - 1000) }, followee);
			expect(noSuch.status).toBe(400);
			expect(castAsError(noSuch.body as any).error.code).toBe('NO_SUCH_USER');
			expect(castAsError(noSuch.body as any).error.id).toBe('66ce1645-d66c-46bb-8b79-96739af885bd');

			const noRequest = await api('following/requests/accept', { userId: follower.id }, followee);
			expect(noRequest.status).toBe(400);
			expect(castAsError(noRequest.body as any).error.code).toBe('NO_FOLLOW_REQUEST');
			expect(castAsError(noRequest.body as any).error.id).toBe('bcde4f8b-0913-4614-8881-614e522fb041');

			const created = await api('following/create', { userId: followee.id, withReplies: true }, follower);
			expect(created.status).toBe(200);
			assert.ok(await fetchFollowRequestFromDatabase(db, follower.id, followee.id));

			const accepted = await api('following/requests/accept', { userId: follower.id }, followee);
			expect(accepted.status).toBe(204);

			expect(await fetchFollowRequestFromDatabase(db, follower.id, followee.id)).toBe(null);
			const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(db, follower.id, followee.id);
			assert.ok(following);
			expect(following.withReplies).toBe(true);

			const refreshedFollower = await fetchUserByIdOrFailFromDatabase(db, follower.id);
			const refreshedFollowee = await fetchUserByIdOrFailFromDatabase(db, followee.id);
			expect(refreshedFollower.followingCount).toBe(1);
			expect(refreshedFollowee.followersCount).toBe(1);
		});

		test('following/requests/cancel は送信済みリクエストを取消しUserLiteを返す', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const follower = await signup({ username: `hrc${suffix}` });
			const followee = await signup({ username: `hrce${suffix}` });
			await updateUserInDatabase(db, followee.id, { isLocked: true });

			const wrongWriteToken = await createAppToken(follower, ['read:following']);
			const scopeDenied = await api('following/requests/cancel', { userId: followee.id }, { token: wrongWriteToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const noSuch = await api('following/requests/cancel', { userId: genId(Date.now() - 1000) }, follower);
			expect(noSuch.status).toBe(400);
			expect(castAsError(noSuch.body as any).error.code).toBe('NO_SUCH_USER');
			expect(castAsError(noSuch.body as any).error.id).toBe('4e68c551-fc4c-4e46-bb41-7d4a37bf9dab');

			const notFound = await api('following/requests/cancel', { userId: followee.id }, follower);
			expect(notFound.status).toBe(400);
			expect(castAsError(notFound.body as any).error.code).toBe('FOLLOW_REQUEST_NOT_FOUND');
			expect(castAsError(notFound.body as any).error.id).toBe('089b125b-d338-482a-9a09-e2622ac9f8d4');

			await api('following/create', { userId: followee.id }, follower);
			assert.ok(await fetchFollowRequestFromDatabase(db, follower.id, followee.id));

			const cancelled = await api('following/requests/cancel', { userId: followee.id }, follower);
			expect(cancelled.status).toBe(200);
			expect(cancelled.body.id).toBe(followee.id);
			expect(await fetchFollowRequestFromDatabase(db, follower.id, followee.id)).toBe(null);
		});

		test('following/requests/reject は受信済みリクエストを拒否し再実行しても冪等', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const followee = await signup({ username: `hrr${suffix}` });
			const follower = await signup({ username: `hrre${suffix}` });
			await updateUserInDatabase(db, followee.id, { isLocked: true });

			const wrongWriteToken = await createAppToken(followee, ['read:following']);
			const scopeDenied = await api('following/requests/reject', { userId: follower.id }, { token: wrongWriteToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const noSuch = await api('following/requests/reject', { userId: genId(Date.now() - 1000) }, followee);
			expect(noSuch.status).toBe(400);
			expect(castAsError(noSuch.body as any).error.code).toBe('NO_SUCH_USER');
			expect(castAsError(noSuch.body as any).error.id).toBe('abc2ffa6-25b2-4380-ba99-321ff3a94555');

			await api('following/create', { userId: followee.id }, follower);
			assert.ok(await fetchFollowRequestFromDatabase(db, follower.id, followee.id));

			const rejected = await api('following/requests/reject', { userId: follower.id }, followee);
			expect(rejected.status).toBe(204);
			expect(await fetchFollowRequestFromDatabase(db, follower.id, followee.id)).toBe(null);

			const rejectedAgain = await api('following/requests/reject', { userId: follower.id }, followee);
			expect(rejectedAgain.status).toBe(204);
		});

		test('following/requests/list と sent はページングして follower/followee を含む', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const followee = await signup({ username: `hrl${suffix}` });
			const followerA = await signup({ username: `hrla${suffix}` });
			const followerB = await signup({ username: `hrlb${suffix}` });
			await updateUserInDatabase(db, followee.id, { isLocked: true });

			await api('following/create', { userId: followee.id }, followerA);
			await api('following/create', { userId: followee.id }, followerB);

			const list = await api('following/requests/list', {}, followee);
			expect(list.status).toBe(200);
			expect(list.body.length).toBe(2);
			const listFollowerIds = list.body.map((r: any) => r.follower.id).sort();
			expect(listFollowerIds).toStrictEqual([followerA.id, followerB.id].sort());
			expect(getAt(list.body, 0).followee.id).toBe(followee.id);

			const sentA = await api('following/requests/sent', {}, followerA);
			expect(sentA.status).toBe(200);
			expect(sentA.body.length).toBe(1);
			expect(getAt(sentA.body, 0).follower.id).toBe(followerA.id);
			expect(getAt(sentA.body, 0).followee.id).toBe(followee.id);

			const limited = await api('following/requests/list', { limit: 1 }, followee);
			expect(limited.status).toBe(200);
			expect(limited.body.length).toBe(1);
		});

		test('following/list はフォロー中一覧を followee 情報付きでページングする', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const follower = await signup({ username: `hfl${suffix}` });
			const followeeA = await signup({ username: `hfla${suffix}` });
			const followeeB = await signup({ username: `hflb${suffix}` });

			await api('following/create', { userId: followeeA.id }, follower);
			await api('following/create', { userId: followeeB.id }, follower);

			const list = await api('following/list', {}, follower);
			expect(list.status).toBe(200);
			expect(list.body.length).toBe(2);
			const followeeIds = list.body.map((f: any) => f.followeeId).sort();
			expect(followeeIds).toStrictEqual([followeeA.id, followeeB.id].sort());
			expect(list.body[0]!.followerId).toBe(follower.id);
			assert.ok(list.body[0]!.followee!.id);
			expect(list.body[0]!.follower).toBe(undefined);

			const limited = await api('following/list', { limit: 1 }, follower);
			expect(limited.status).toBe(200);
			expect(limited.body.length).toBe(1);

			const strangerList = await api('following/list', {}, followeeA);
			expect(strangerList.status).toBe(200);
			expect(strangerList.body.length).toBe(0);
		});

		test('following/update-all updates only the caller followings', async () => {
			const config = fixtureConfig;
			// 共有fixture (alice/bob) に直接DBのfollowing行を残すと、後続のblocking系テストの
			// unfollow副作用がカウンタを負値に汚染するため、使い捨てユーザーで完結させる
			const suffix = Date.now().toString(36).slice(-8);
			const updater = await signup({ username: `hfua${suffix}` });
			const targetA = await signup({ username: `hfub${suffix}` });
			const targetB = await signup({ username: `hfuc${suffix}` });
			await createFollowingInDatabase(db, {
				id: genId(),
				followerId: updater.id,
				followeeId: targetA.id,
				notify: 'normal',
				withReplies: false,
			});
			await createFollowingInDatabase(db, {
				id: genId(),
				followerId: updater.id,
				followeeId: targetB.id,
				notify: 'normal',
				withReplies: false,
			});
			await createFollowingInDatabase(db, {
				id: genId(),
				followerId: targetA.id,
				followeeId: updater.id,
				notify: 'normal',
				withReplies: false,
			});

			const res = await api(
				'following/update-all',
				{
					notify: 'none',
					withReplies: true,
				},
				updater,
			);
			expect(res.status).toBe(204);

			const updaterToA = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(db, updater.id, targetA.id);
			const updaterToB = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(db, updater.id, targetB.id);
			const aToUpdater = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(db, targetA.id, updater.id);
			expect(updaterToA?.notify).toBe(null);
			expect(updaterToA?.withReplies).toBe(true);
			expect(updaterToB?.notify).toBe(null);
			expect(updaterToB?.withReplies).toBe(true);
			expect(aToUpdater?.notify).toBe('normal');
			expect(aToUpdater?.withReplies).toBe(false);
		});

		test('flash/update updates own flash and preserves ownership errors', async () => {
			const config = fixtureConfig;
			const flash = await createFlashInDatabase(db, {
				id: genId(),
				updatedAt: new Date(),
				title: 'old title',
				summary: 'old summary',
				userId: alice.id,
				script: 'old script',
				permissions: [],
				visibility: 'public',
			});
			const otherFlash = await createFlashInDatabase(db, {
				id: genId(),
				updatedAt: new Date(),
				title: 'other title',
				summary: 'other summary',
				userId: bob.id,
				script: 'other script',
				permissions: [],
				visibility: 'public',
			});

			const updated = await api(
				'flash/update',
				{
					flashId: flash.id,
					title: 'new title',
					summary: 'new summary',
					script: 'new script',
					permissions: ['read:account'],
					visibility: 'private',
				},
				alice,
			);
			expect(updated.status).toBe(204);

			const fetched = await fetchFlashByIdFromDatabase(db, flash.id);
			expect(fetched?.title).toBe('new title');
			expect(fetched?.summary).toBe('new summary');
			expect(fetched?.script).toBe('new script');
			expect(fetched?.permissions).toStrictEqual(['read:account']);
			expect(fetched?.visibility).toBe('private');

			const denied = await api('flash/update', { flashId: otherFlash.id, title: 'bad update' }, alice);
			expect(denied.status).toBe(400);
			expect(castAsError(denied.body as any).error.id).toBe('08e60c88-5948-478e-a132-02ec701d67b2');

			const missing = await api('flash/update', { flashId: genId() }, alice);
			expect(missing.status).toBe(400);
			expect(castAsError(missing.body as any).error.id).toBe('611e13d2-309e-419a-a5e4-e0422da39b02');
		});

		test('flash/update rejects moved users before side effects', async () => {
			const config = fixtureConfig;
			const movedUser = await signup({ username: `mvflash${Date.now().toString(36)}` });
			const flash = await createFlashInDatabase(db, {
				id: genId(),
				updatedAt: new Date(),
				title: 'moved title',
				summary: 'moved summary',
				userId: movedUser.id,
				script: 'moved script',
				permissions: [],
				visibility: 'public',
			});
			await updateUserInDatabase(db, movedUser.id, {
				movedToUri: `${origin}/users/${alice.id}`,
			});

			const denied = await api('flash/update', { flashId: flash.id, title: 'updated by moved user' }, movedUser);
			expect(denied.status).toBe(403);
			expect(castAsError(denied.body as any).error.id).toBe('56f20ec9-fd06-4fa5-841b-edd6d7d4fa31');

			const unchanged = await fetchFlashByIdFromDatabase(db, flash.id);
			expect(unchanged?.title).toBe('moved title');
		});

		test('Hono rate limited write endpoints require matching app token permissions', async () => {
			const config = fixtureConfig;
			const readAccountToken = await createAppToken(alice, ['read:account']);
			const flash = await createFlashInDatabase(db, {
				id: genId(),
				updatedAt: new Date(),
				title: 'permission title',
				summary: 'permission summary',
				userId: alice.id,
				script: 'permission script',
				permissions: [],
				visibility: 'public',
			});

			for (const [endpoint, params] of [
				['following/update-all', { notify: 'normal' }],
				['flash/update', { flashId: flash.id, title: 'denied update' }],
			] as const) {
				const denied = await api(endpoint, params as any, { token: readAccountToken });
				expect(denied.status, endpoint).toBe(403);
				expect(castAsError(denied.body as any).error.code, endpoint).toBe('PERMISSION_DENIED');
			}
		});
	});


	describe('export jobs', () => {
		const getExportJobs = async (jobName: string, userId: string) => {
			const jobs = await dbQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
			return jobs.filter((job) => job.name === jobName && (job.data as any).user?.id === userId);
		};
		const waitExportJob = async (jobName: string, userId: string) => {
			return await vi.waitFor(async () => {
				const jobs = await getExportJobs(jobName, userId);
				assert.ok(jobs[0], `${jobName} job was not found for ${userId}`);
				return jobs[0];
			}, POLL);
		};

		test.each([
			['export-custom-emojis', 'exportCustomEmojis'],
			['i/export-notes', 'exportNotes'],
			['i/export-clips', 'exportClips'],
			['i/export-favorites', 'exportFavorites'],
			['i/export-mute', 'exportMuting'],
			['i/export-blocking', 'exportBlocking'],
			['i/export-user-lists', 'exportUserLists'],
			['i/export-antennas', 'exportAntennas'],
		] as const)('%s は %s ジョブを積む', async (endpoint, jobName) => {
			const suffix = Date.now().toString(36).slice(-8) + Math.random().toString(36).slice(-4);
			const user = await signup({ username: `hej${suffix}` });

			const res = await api(endpoint, {}, user);
			expect(res.status, JSON.stringify(res.body)).toBe(204);

			const job = await waitExportJob(jobName, user.id);
			await job.remove();
		});

		test('i/export-following はジョブにexcludeMuting/excludeInactiveを渡す', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hejf${suffix}` });

			const res = await api('i/export-following', { excludeMuting: true, excludeInactive: true }, user);
			expect(res.status).toBe(204);

			const job = await waitExportJob('exportFollowing', user.id);
			expect((job.data as any).excludeMuting).toBe(true);
			expect((job.data as any).excludeInactive).toBe(true);
			await job.remove();
		});
	});


	describe('notifications', () => {
		async function readNotificationTimeline(config: typeof fixtureConfig, userId: string) {
			const redis = createRedisClient(config);
			try {
				const entries = await redis.xrevrange(`notificationTimeline:${userId}`, '+', '-', 'COUNT', 10);
				return entries.map(([, values]) => {
					const dataIndex = values.findIndex((value) => value === 'data');
					return JSON.parse(values[dataIndex + 1]!) as {
						id: string;
						type?: string;
						customBody?: string;
						customHeader?: string | null;
						customIcon?: string | null;
					};
				});
			} finally {
				await closeRedisConnection(redis);
			}
		}

		test('notifications/create は scope 保護つきで app 通知を作成しwrite:notifications 以外は拒否される', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnc${suffix}` });

			const wrongScopeToken = await createAppToken(user, ['read:account']);
			const scopeDenied = await api('notifications/create', { body: 'hello' }, { token: wrongScopeToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const created = await api(
				'notifications/create',
				{ body: 'hello world', header: 'my header', icon: 'https://example.com/icon.png' },
				user,
			);
			expect(created.status).toBe(204);

			const appNotification = await vi.waitFor(async () => {
				const notifications = await readNotificationTimeline(config, user.id);
				const found = notifications.find((n) => n.type === 'app');
				assert.ok(found);
				return found;
			}, POLL);
			// Redis stream 上の生の通知は customBody/customHeader/customIcon で保持され、
			// body/header/icon への改名は i/notifications の pack 時に行われる。
			expect(appNotification.customBody).toBe('hello world');
			expect(appNotification.customHeader).toBe('my header');
			expect(appNotification.customIcon).toBe('https://example.com/icon.png');
		});

		test('notifications/create は通知設定が never の場合は作成しない', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hncn${suffix}` });
			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, user.id);
			await updateUserProfileInDatabase(db, user.id, {
				notificationRecieveConfig: {
					...profile.notificationRecieveConfig,
					app: { type: 'never' },
				},
			});

			const created = await api('notifications/create', { body: 'should be suppressed' }, user);
			expect(created.status).toBe(204);

			// 「作られないこと」を見るので、作られるだけの猶予を置いてから読む
			await new Promise((resolve) => setTimeout(resolve, 100));
			const notifications = await readNotificationTimeline(config, user.id);
			expect(notifications.some((n) => n.type === 'app')).toBe(false);
		});

		test('notifications/test-notification はテスト通知を作成する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hntn${suffix}` });

			const res = await api('notifications/test-notification', {}, user);
			expect(res.status).toBe(204);

			await vi.waitFor(async () => {
				const notifications = await readNotificationTimeline(config, user.id);
				assert.ok(notifications.some((n) => n.type === 'test'));
			}, POLL);
		});

		test('notifications/mark-all-as-read は既読状態を更新しreadAllNotificationsを発行する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnmar${suffix}` });

			await api('notifications/test-notification', {}, user);
			await vi.waitFor(async () => {
				const notifications = await readNotificationTimeline(config, user.id);
				assert.ok(notifications.some((n) => n.type === 'test'));
			}, POLL);

			const res = await api('notifications/mark-all-as-read', {}, user);
			expect(res.status).toBe(204);

			const redis = createRedisClient(config);
			try {
				await vi.waitFor(async () => {
					const latestReadNotificationId = await redis.get(`latestReadNotification:${user.id}`);
					assert.ok(latestReadNotificationId);
				}, POLL);
			} finally {
				await closeRedisConnection(redis);
			}
		});

		test('notifications/delete は本人の通知だけを個別に削除する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnd${suffix}` });
			const other = await signup({ username: `hndo${suffix}` });

			await api('notifications/test-notification', {}, user);
			const notification = await vi.waitFor(async () => {
				const found = (await readNotificationTimeline(config, user.id)).find((item) => item.type === 'test');
				assert.ok(found);
				return found;
			}, POLL);

			const wrongScopeToken = await createAppToken(user, ['read:account']);
			const scopeDenied = await api(
				'notifications/delete',
				{ notificationId: notification.id },
				{ token: wrongScopeToken },
			);
			expect(scopeDenied.status).toBe(403);

			const otherDelete = await api('notifications/delete', { notificationId: notification.id }, other);
			expect(otherDelete.status).toBe(204);
			assert.ok((await readNotificationTimeline(config, user.id)).some((item) => item.id === notification.id));

			const deleted = await api('notifications/delete', { notificationId: notification.id }, user);
			expect(deleted.status).toBe(204);
			expect((await readNotificationTimeline(config, user.id)).some((item) => item.id === notification.id)).toBe(false);
		});

		test('notifications/delete はグルーピングされた通知をまとめて削除する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hndg${suffix}` });
			const redis = createRedisClient(config);
			const streamKey = `notificationTimeline:${user.id}`;
			const unrelatedBefore = { id: genId(), createdAt: new Date().toISOString(), type: 'test' };
			const reaction1 = {
				id: genId(),
				createdAt: new Date().toISOString(),
				type: 'reaction',
				noteId: genId(),
				notifierId: user.id,
				reaction: '❤',
			};
			const reaction2 = { ...reaction1, id: genId() };
			const unrelatedAfter = { id: genId(), createdAt: new Date().toISOString(), type: 'login' };

			try {
				for (const notification of [unrelatedBefore, reaction1, reaction2, unrelatedAfter]) {
					await redis.xadd(streamKey, toXListId(notification.id), 'data', JSON.stringify(notification));
				}

				const deleted = await api('notifications/delete', { notificationId: reaction1.id, grouped: true }, user);
				expect(deleted.status).toBe(204);

				const remaining = await readNotificationTimeline(config, user.id);
				expect(remaining.some((item) => item.id === reaction1.id)).toBe(false);
				expect(remaining.some((item) => item.id === reaction2.id)).toBe(false);
				expect(remaining.some((item) => item.id === unrelatedBefore.id)).toBe(true);
				expect(remaining.some((item) => item.id === unrelatedAfter.id)).toBe(true);
			} finally {
				await closeRedisConnection(redis);
			}
		});

		test('notifications/flush はタイムラインと既読状態を消去する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnf${suffix}` });

			await api('notifications/test-notification', {}, user);
			await vi.waitFor(async () => {
				const notifications = await readNotificationTimeline(config, user.id);
				assert.ok(notifications.some((n) => n.type === 'test'));
			}, POLL);

			const res = await api('notifications/flush', {}, user);
			expect(res.status).toBe(204);

			const redis = createRedisClient(config);
			try {
				await vi.waitFor(async () => {
					expect(await redis.exists(`notificationTimeline:${user.id}`)).toBe(0);
				}, POLL);
			} finally {
				await closeRedisConnection(redis);
			}
		});
	});


	describe('stats', () => {
		test('stats は集計値を返す', async () => {
			const res = await api('stats', {});
			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
			expect(typeof (res.body as any).notesCount).toBe('number');
			expect(typeof (res.body as any).originalNotesCount).toBe('number');
			expect(typeof (res.body as any).usersCount).toBe('number');
			expect(typeof (res.body as any).originalUsersCount).toBe('number');
			expect(typeof (res.body as any).reactionsCount).toBe('number');
			expect(typeof (res.body as any).instances).toBe('number');
			expect((res.body as any).driveUsageLocal).toBe(0);
			expect((res.body as any).driveUsageRemote).toBe(0);
		});
	});


	describe('gallery', () => {
		test('gallery/posts/{create,show,update,delete} は所有権・moderator・moderation logを維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `hgc${suffix}` });
			const stranger = await signup({ username: `hgcs${suffix}` });
			const fileMd5 = createHash('md5').update(`hono-gallery-create-${suffix}`).digest('hex');
			const file = await createDriveFileInDatabase(db, {
				id: genId(),
				userId: owner.id,
				userHost: null,
				md5: fileMd5,
				name: `hono-gallery-${suffix}.png`,
				type: 'image/png',
				size: 123,
				blurhash: null,
				properties: { width: 100, height: 200 },
				storedInternal: true,
				url: `${origin}/files/${fileMd5}`,
				thumbnailUrl: `${origin}/files/${fileMd5}.thumbnail`,
				comment: null,
				folderId: null,
			});

			const created = await api(
				'gallery/posts/create',
				{
					title: `Hono gallery post ${suffix}`,
					description: 'created via e2e',
					fileIds: [file.id],
				},
				owner,
			);
			expect(created.status).toBe(200);
			expect(created.body.title).toBe(`Hono gallery post ${suffix}`);
			expect(created.body.userId).toBe(owner.id);
			expect(created.body.user.id).toBe(owner.id);
			expect(created.body.fileIds!.length).toBe(1);
			expect(created.body.files!.length).toBe(1);
			expect(created.body.files![0]!.id).toBe(file.id);
			expect(created.body.likedCount).toBe(0);
			expect(created.body.isSensitive).toBe(false);

			const shown = await api('gallery/posts/show', { postId: created.body.id }, stranger);
			expect(shown.status).toBe(200);
			expect(shown.body.id).toBe(created.body.id);
			expect(shown.body.isLiked).toBe(false);

			const missing = await api('gallery/posts/show', { postId: genId() });
			expect(missing.status).toBe(400);
			expect(castAsError(missing.body as any).error.code).toBe('NO_SUCH_POST');

			const updated = await api(
				'gallery/posts/update',
				{
					postId: created.body.id,
					title: `${created.body.title} updated`,
					isSensitive: true,
				},
				owner,
			);
			expect(updated.status).toBe(200);
			expect(updated.body.title).toBe(`${created.body.title} updated`);
			expect(updated.body.isSensitive).toBe(true);

			const deleteDenied = await api('gallery/posts/delete', { postId: created.body.id }, stranger);
			expect(deleteDenied.status).toBe(400);
			expect(castAsError(deleteDenied.body as any).error.code).toBe('ACCESS_DENIED');

			const deletedByMod = await api('gallery/posts/delete', { postId: created.body.id }, alice);
			expect(deletedByMod.status).toBe(204);
			expect(await fetchGalleryPostByIdFromDatabase(db, created.body.id)).toBe(null);

			const logs = await listModerationLogsFromDatabase(db, { limit: 100, order: 'desc' });
			const log = logs.find((l) => l.type === 'deleteGalleryPost' && (l.info as any).postId === created.body.id);
			assert.ok(log);
			expect((log!.info as any).postUserId).toBe(owner.id);
		});

		test('gallery/posts/{like,unlike} はカウント、ランキング、二重操作エラーを維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `hgl${suffix}` });
			const liker = await signup({ username: `hgll${suffix}` });
			const fileMd5 = createHash('md5').update(`hono-gallery-like-${suffix}`).digest('hex');
			const file = await createDriveFileInDatabase(db, {
				id: genId(),
				userId: owner.id,
				userHost: null,
				md5: fileMd5,
				name: `hono-gallery-like-${suffix}.png`,
				type: 'image/png',
				size: 123,
				blurhash: null,
				properties: {},
				storedInternal: true,
				url: `${origin}/files/${fileMd5}`,
				thumbnailUrl: null,
				comment: null,
				folderId: null,
			});
			const post = await api(
				'gallery/posts/create',
				{
					title: `Hono gallery like ${suffix}`,
					fileIds: [file.id],
				},
				owner,
			);
			expect(post.status).toBe(200);

			const selfLikeDenied = await api('gallery/posts/like', { postId: post.body.id }, owner);
			expect(selfLikeDenied.status).toBe(400);
			expect(castAsError(selfLikeDenied.body as any).error.code).toBe('YOUR_POST');

			const unlikeNotLiked = await api('gallery/posts/unlike', { postId: post.body.id }, liker);
			expect(unlikeNotLiked.status).toBe(400);
			expect(castAsError(unlikeNotLiked.body as any).error.code).toBe('NOT_LIKED');

			const liked = await api('gallery/posts/like', { postId: post.body.id }, liker);
			expect(liked.status).toBe(204);

			const alreadyLiked = await api('gallery/posts/like', { postId: post.body.id }, liker);
			expect(alreadyLiked.status).toBe(400);
			expect(castAsError(alreadyLiked.body as any).error.code).toBe('ALREADY_LIKED');

			const afterLike = await fetchGalleryPostByIdFromDatabase(db, post.body.id);
			expect(afterLike?.likedCount).toBe(1);

			const shownAsLiker = await api('gallery/posts/show', { postId: post.body.id }, liker);
			expect(shownAsLiker.body.isLiked).toBe(true);

			const unliked = await api('gallery/posts/unlike', { postId: post.body.id }, liker);
			expect(unliked.status).toBe(204);

			const afterUnlike = await fetchGalleryPostByIdFromDatabase(db, post.body.id);
			expect(afterUnlike?.likedCount).toBe(0);
		});

		test('gallery/posts と gallery/popular はページングして投稿を返す', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `hgp${suffix}` });
			const fileMd5 = createHash('md5').update(`hono-gallery-list-${suffix}`).digest('hex');
			const file = await createDriveFileInDatabase(db, {
				id: genId(),
				userId: owner.id,
				userHost: null,
				md5: fileMd5,
				name: `hono-gallery-list-${suffix}.png`,
				type: 'image/png',
				size: 10,
				blurhash: null,
				properties: {},
				storedInternal: true,
				url: `${origin}/files/${fileMd5}`,
				thumbnailUrl: null,
				comment: null,
				folderId: null,
			});
			const post = await api(
				'gallery/posts/create',
				{
					title: `Hono gallery list ${suffix}`,
					fileIds: [file.id],
				},
				owner,
			);
			expect(post.status).toBe(200);

			const list = await api('gallery/posts', { limit: 100 });
			expect(list.status).toBe(200);
			assert.ok(list.body.some((p: any) => p.id === post.body.id));

			const liker = await signup({ username: `hgpl${suffix}` });
			await api('gallery/posts/like', { postId: post.body.id }, liker);

			const popular = await api('gallery/popular', {});
			expect(popular.status).toBe(200);
			assert.ok(popular.body.some((p: any) => p.id === post.body.id));
		});

		test('i/gallery/posts は自分の投稿のみをページングして返す', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `higp${suffix}` });
			const other = await signup({ username: `higpo${suffix}` });
			const fileMd5 = createHash('md5').update(`hono-i-gallery-posts-${suffix}`).digest('hex');
			const file = await createDriveFileInDatabase(db, {
				id: genId(),
				userId: owner.id,
				userHost: null,
				md5: fileMd5,
				name: `hono-i-gallery-posts-${suffix}.png`,
				type: 'image/png',
				size: 10,
				blurhash: null,
				properties: {},
				storedInternal: true,
				url: `${origin}/files/${fileMd5}`,
				thumbnailUrl: null,
				comment: null,
				folderId: null,
			});
			const post = await api(
				'gallery/posts/create',
				{
					title: `Hono i gallery posts ${suffix}`,
					fileIds: [file.id],
				},
				owner,
			);
			expect(post.status).toBe(200);

			const otherFileMd5 = createHash('md5').update(`hono-i-gallery-posts-other-${suffix}`).digest('hex');
			const otherFile = await createDriveFileInDatabase(db, {
				id: genId(),
				userId: other.id,
				userHost: null,
				md5: otherFileMd5,
				name: `hono-i-gallery-posts-other-${suffix}.png`,
				type: 'image/png',
				size: 10,
				blurhash: null,
				properties: {},
				storedInternal: true,
				url: `${origin}/files/${otherFileMd5}`,
				thumbnailUrl: null,
				comment: null,
				folderId: null,
			});
			const otherPost = await api(
				'gallery/posts/create',
				{
					title: `Hono i gallery posts other ${suffix}`,
					fileIds: [otherFile.id],
				},
				other,
			);
			expect(otherPost.status).toBe(200);

			const mine = await api('i/gallery/posts', { limit: 100 }, owner);
			expect(mine.status).toBe(200);
			assert.ok(mine.body.some((p: any) => p.id === post.body.id));
			assert.ok(!mine.body.some((p: any) => p.id === otherPost.body.id));

			const unauthorized = await api('i/gallery/posts', {});
			expect(unauthorized.status).toBe(401);
			expect(castAsError(unauthorized.body as any).error.code).toBe('CREDENTIAL_REQUIRED');
		});

		test('i/gallery/likes はいいねした投稿一覧を返す', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `higl${suffix}` });
			const liker = await signup({ username: `higll${suffix}` });
			const fileMd5 = createHash('md5').update(`hono-i-gallery-likes-${suffix}`).digest('hex');
			const file = await createDriveFileInDatabase(db, {
				id: genId(),
				userId: owner.id,
				userHost: null,
				md5: fileMd5,
				name: `hono-i-gallery-likes-${suffix}.png`,
				type: 'image/png',
				size: 10,
				blurhash: null,
				properties: {},
				storedInternal: true,
				url: `${origin}/files/${fileMd5}`,
				thumbnailUrl: null,
				comment: null,
				folderId: null,
			});
			const post = await api(
				'gallery/posts/create',
				{
					title: `Hono i gallery likes ${suffix}`,
					fileIds: [file.id],
				},
				owner,
			);
			expect(post.status).toBe(200);

			const empty = await api('i/gallery/likes', {}, liker);
			expect(empty.status).toBe(200);
			expect(empty.body).toStrictEqual([]);

			const liked = await api('gallery/posts/like', { postId: post.body.id }, liker);
			expect(liked.status).toBe(204);

			const likes = await api('i/gallery/likes', {}, liker);
			expect(likes.status).toBe(200);
			expect(likes.body.length).toBe(1);
			expect(getAt(likes.body, 0).post.id).toBe(post.body.id);

			const unauthorized = await api('i/gallery/likes', {});
			expect(unauthorized.status).toBe(401);
			expect(castAsError(unauthorized.body as any).error.code).toBe('CREDENTIAL_REQUIRED');
		});
	});


	describe('clips', () => {
		test('clips/{create,list,show,update,delete} は所有権とpublic可視性を維持する', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `hcc${suffix}` });
			const stranger = await signup({ username: `hccs${suffix}` });

			const created = await api(
				'clips/create',
				{ name: `Hono clip ${suffix}`, isPublic: false, description: 'desc' },
				owner,
			);
			expect(created.status).toBe(200);
			expect(created.body.name).toBe(`Hono clip ${suffix}`);
			expect(created.body.isPublic).toBe(false);
			expect(created.body.userId).toBe(owner.id);
			expect(created.body.favoritedCount).toBe(0);
			expect(created.body.notesCount).toBe(0);

			const hiddenFromStranger = await api('clips/show', { clipId: created.body.id }, stranger);
			expect(hiddenFromStranger.status).toBe(400);
			expect(castAsError(hiddenFromStranger.body as any).error.code).toBe('NO_SUCH_CLIP');

			const visibleToOwner = await api('clips/show', { clipId: created.body.id }, owner);
			expect(visibleToOwner.status).toBe(200);
			expect(visibleToOwner.body.notesCount).toBe(0);

			const list = await api('clips/list', {}, owner);
			expect(list.status).toBe(200);
			assert.ok(list.body.some((c: any) => c.id === created.body.id));

			const updated = await api(
				'clips/update',
				{ clipId: created.body.id, isPublic: true, name: `${created.body.name} updated` },
				owner,
			);
			expect(updated.status).toBe(200);
			expect(updated.body.isPublic).toBe(true);
			expect(updated.body.name).toBe(`${created.body.name} updated`);

			const nowVisible = await api('clips/show', { clipId: created.body.id }, stranger);
			expect(nowVisible.status).toBe(200);
			expect(nowVisible.body.notesCount).toBe(undefined);

			const updateDenied = await api('clips/update', { clipId: created.body.id, name: 'nope' }, stranger);
			expect(updateDenied.status).toBe(400);
			expect(castAsError(updateDenied.body as any).error.code).toBe('NO_SUCH_CLIP');

			const deleteDenied = await api('clips/delete', { clipId: created.body.id }, stranger);
			expect(deleteDenied.status).toBe(400);
			expect(castAsError(deleteDenied.body as any).error.code).toBe('NO_SUCH_CLIP');

			const deleted = await api('clips/delete', { clipId: created.body.id }, owner);
			expect(deleted.status).toBe(204);

			const afterDelete = await api('clips/show', { clipId: created.body.id });
			expect(afterDelete.status).toBe(400);
		});

		test('clips/{add-note,remove-note} はNOTEカウント、重複、404を維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `hcn${suffix}` });
			const noteId = genId();
			await createNoteInDatabase(db, {
				id: noteId,
				text: `hono clip note ${suffix}`,
				userId: owner.id,
				userHost: null,
				visibility: 'public',
			});
			const clip = await api('clips/create', { name: `Hono clip notes ${suffix}` }, owner);
			expect(clip.status).toBe(200);

			const missingClip = await api('clips/add-note', { clipId: genId(), noteId }, owner);
			expect(missingClip.status).toBe(400);
			expect(castAsError(missingClip.body as any).error.code).toBe('NO_SUCH_CLIP');

			const missingNote = await api('clips/add-note', { clipId: clip.body.id, noteId: genId() }, owner);
			expect(missingNote.status).toBe(400);
			expect(castAsError(missingNote.body as any).error.code).toBe('NO_SUCH_NOTE');

			const added = await api('clips/add-note', { clipId: clip.body.id, noteId }, owner);
			expect(added.status).toBe(204);

			const duplicate = await api('clips/add-note', { clipId: clip.body.id, noteId }, owner);
			expect(duplicate.status).toBe(400);
			expect(castAsError(duplicate.body as any).error.code).toBe('ALREADY_CLIPPED');

			const shownAfterAdd = await api('clips/show', { clipId: clip.body.id }, owner);
			expect(shownAfterAdd.body.notesCount).toBe(1);
			assert.ok(shownAfterAdd.body.lastClippedAt);

			const removed = await api('clips/remove-note', { clipId: clip.body.id, noteId }, owner);
			expect(removed.status).toBe(204);

			const shownAfterRemove = await api('clips/show', { clipId: clip.body.id }, owner);
			expect(shownAfterRemove.body.notesCount).toBe(0);
		});

		test('clips/my-favorites はfavoriteしたclipを一覧する', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `hcf${suffix}` });
			const favoriter = await signup({ username: `hcff${suffix}` });
			const clip = await api('clips/create', { name: `Hono clip fav ${suffix}`, isPublic: true }, owner);
			expect(clip.status).toBe(200);

			const favorited = await api('clips/favorite', { clipId: clip.body.id }, favoriter);
			expect(favorited.status).toBe(204);
			expect(await clipFavoriteExistsInDatabase(db, favoriter.id, clip.body.id)).toBe(true);

			const myFavorites = await api('clips/my-favorites', {}, favoriter);
			expect(myFavorites.status).toBe(200);
			expect(myFavorites.body.length).toBe(1);
			expect(getAt(myFavorites.body, 0).id).toBe(clip.body.id);
			expect(getAt(myFavorites.body, 0).isFavorited).toBe(true);
		});

		test('clips/notes は可視性とNO_SUCH_CLIPを維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `hcn2${suffix}` });
			const stranger = await signup({ username: `hcn2s${suffix}` });
			const noteId = genId();
			await createNoteInDatabase(db, {
				id: noteId,
				text: `clip note ${suffix}`,
				userId: owner.id,
				userHost: null,
				visibility: 'public',
			});
			const privateClip = await api(
				'clips/create',
				{ name: `Hono clip notes private ${suffix}`, isPublic: false },
				owner,
			);
			expect(privateClip.status).toBe(200);
			await api('clips/add-note', { clipId: privateClip.body.id, noteId }, owner);

			const deniedForStranger = await api('clips/notes', { clipId: privateClip.body.id }, stranger);
			expect(deniedForStranger.status).toBe(400);
			expect(castAsError(deniedForStranger.body as any).error.code).toBe('NO_SUCH_CLIP');

			const visibleForOwner = await api('clips/notes', { clipId: privateClip.body.id }, owner);
			expect(visibleForOwner.status).toBe(200);
			expect(visibleForOwner.body.length).toBe(1);
			expect(getAt(visibleForOwner.body, 0).id).toBe(noteId);

			const publicClip = await api('clips/create', { name: `Hono clip notes public ${suffix}`, isPublic: true }, owner);
			await api('clips/add-note', { clipId: publicClip.body.id, noteId }, owner);
			const visibleForAnyone = await api('clips/notes', { clipId: publicClip.body.id });
			expect(visibleForAnyone.status).toBe(200);
			expect(visibleForAnyone.body.length).toBe(1);

			const missingClip = await api('clips/notes', { clipId: genId() });
			expect(missingClip.status).toBe(400);
			expect(castAsError(missingClip.body as any).error.code).toBe('NO_SUCH_CLIP');
		});
	});


	describe('flash', () => {
		test('作成できる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnflc${suffix}` });

			const res = await api(
				'flash/create',
				{
					title: 'test flash',
					summary: 'summary',
					script: 'Ui:render([])',
					permissions: [],
				},
				user,
			);

			expect(res.status).toBe(200);
			expect(res.body.title).toBe('test flash');
			expect(res.body.userId).toBe(user.id);
			expect(res.body.visibility).toBe('public');
		});

		test('作成したFlashを取得できる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnfls${suffix}` });
			const created = await api(
				'flash/create',
				{
					title: 'test flash',
					summary: 'summary',
					script: 'Ui:render([])',
					permissions: [],
				},
				user,
			);

			const res = await api('flash/show', { flashId: created.body.id }, user);

			expect(res.status).toBe(200);
			expect(res.body.id).toBe(created.body.id);
		});

		test('存在しないFlashの取得は怒られる', async () => {
			const res = await api('flash/show', { flashId: '000000000000000000000000' });
			expect(res.status).toBe(400);
			expect(castAsError(res.body).error.code).toBe('NO_SUCH_FLASH');
		});

		test('自分のFlash一覧が取得できる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnflm${suffix}` });
			await api(
				'flash/create',
				{
					title: 'test flash',
					summary: 'summary',
					script: 'Ui:render([])',
					permissions: [],
				},
				user,
			);

			const res = await api('flash/my', {}, user);

			expect(res.status).toBe(200);
			expect(res.body.length).toBe(1);
		});

		test('削除できる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnfld${suffix}` });
			const created = await api(
				'flash/create',
				{
					title: 'test flash',
					summary: 'summary',
					script: 'Ui:render([])',
					permissions: [],
				},
				user,
			);

			const res = await api('flash/delete', { flashId: created.body.id }, user);
			expect(res.status).toBe(204);

			const shown = await api('flash/show', { flashId: created.body.id });
			expect(shown.status).toBe(400);
		});

		test('他人のFlashは削除できない', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `hnflo${suffix}` });
			const other = await signup({ username: `hnfloo${suffix}` });
			const created = await api(
				'flash/create',
				{
					title: 'test flash',
					summary: 'summary',
					script: 'Ui:render([])',
					permissions: [],
				},
				owner,
			);

			const res = await api('flash/delete', { flashId: created.body.id }, other);
			expect(res.status).toBe(400);
			expect(castAsError(res.body as unknown as Record<string, unknown>).error.code).toBe('ACCESS_DENIED');
		});

		test('タイトルでキーワード検索できる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnflse${suffix}` });
			await api(
				'flash/create',
				{
					title: `findme-${suffix}`,
					summary: 'summary',
					script: 'Ui:render([])',
					permissions: [],
				},
				user,
			);

			const res = await api('flash/search', { query: `findme-${suffix}` });

			expect(res.status).toBe(200);
			expect(res.body.length).toBe(1);
		});

		test('いいねしたFlash一覧を取得できる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `hnflla${suffix}` });
			const liker = await signup({ username: `hnfllb${suffix}` });
			const created = await api(
				'flash/create',
				{
					title: 'test flash',
					summary: 'summary',
					script: 'Ui:render([])',
					permissions: [],
				},
				owner,
			);
			await api('flash/like', { flashId: created.body.id }, liker);

			const res = await api('flash/my-likes', {}, liker);

			expect(res.status).toBe(200);
			expect(res.body.length).toBe(1);
			expect(getAt(res.body, 0).flash.id).toBe(created.body.id);
			expect(getAt(res.body, 0).flash.isLiked).toBe(true);
		});

		test('モデレータは他人のFlashを削除でき、モデレーションログが記録される', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `hnflmd${suffix}` });
			const created = await api(
				'flash/create',
				{
					title: 'test flash',
					summary: 'summary',
					script: 'Ui:render([])',
					permissions: [],
				},
				owner,
			);

			const moderatorRole = await role(alice, { isModerator: true });
			const moderator = await signup({ username: `hnflmo${suffix}` });
			await createRoleAssignmentInDatabase(db, {
				id: genId(),
				roleId: moderatorRole.id,
				userId: moderator.id,
			});

			const res = await api('flash/delete', { flashId: created.body.id }, moderator);
			expect(res.status).toBe(204);

			const shown = await api('flash/show', { flashId: created.body.id });
			expect(shown.status).toBe(400);

			const logs = await listModerationLogsFromDatabase(db, { limit: 100, order: 'desc' });
			const log = logs.find(
				(l) => l.userId === moderator.id && l.type === 'deleteFlash' && (l.info as any).flashId === created.body.id,
			);
			assert.ok(log);
			expect((log!.info as any).flashUserId).toBe(owner.id);
		});

		test('sinceId/untilIdで自分のFlash一覧を絞り込める', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnflpg${suffix}` });
			const first = await api(
				'flash/create',
				{
					title: 'first',
					summary: 'summary',
					script: 'Ui:render([])',
					permissions: [],
				},
				user,
			);
			const second = await api(
				'flash/create',
				{
					title: 'second',
					summary: 'summary',
					script: 'Ui:render([])',
					permissions: [],
				},
				user,
			);

			const res = await api('flash/my', { sinceId: first.body.id }, user);

			expect(res.status).toBe(200);
			expect(res.body.length).toBe(1);
			expect(getAt(res.body, 0).id).toBe(second.body.id);
		});

		test('非公開のFlashは検索結果に出ない', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnflpv${suffix}` });
			await api(
				'flash/create',
				{
					title: `private-${suffix}`,
					summary: 'summary',
					script: 'Ui:render([])',
					permissions: [],
					visibility: 'private',
				},
				user,
			);

			const res = await api('flash/search', { query: `private-${suffix}` });

			expect(res.status).toBe(200);
			expect(res.body.length).toBe(0);
		});

		test('人気のFlash一覧を取得できる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `hnflfa${suffix}` });
			const liker = await signup({ username: `hnflfb${suffix}` });
			const created = await api(
				'flash/create',
				{
					title: 'test flash',
					summary: 'summary',
					script: 'Ui:render([])',
					permissions: [],
				},
				owner,
			);
			expect(created.status).toBe(200);
			const liked = await api('flash/like', { flashId: created.body.id }, liker);
			expect(liked.status).toBe(204);

			const res = await api('flash/featured', {});

			expect(res.status).toBe(200);
			assert.ok(
				res.body.some((f: any) => f.id === created.body.id),
				`flash ${created.body.id} not in featured: ${JSON.stringify(res.body.map((f: any) => ({ id: f.id, likedCount: f.likedCount, updatedAt: f.updatedAt })))}`,
			);
		});
	});


	describe('パーソナルメモ機能のテスト', () => {
		test('他者に関するメモを更新できる', async () => {
			const memo = '10月まで低浮上とのこと。';

			const res1 = await api(
				'users/update-memo',
				{
					memo,
					userId: bob.id,
				},
				alice,
			);

			const res2 = await api(
				'users/show',
				{
					userId: bob.id,
				},
				alice,
			);
			expect(res1.status).toBe(204);
			expect((res2.body as unknown as { memo: string })?.memo).toBe(memo);
		});

		test('自分に関するメモを更新できる', async () => {
			const memo = 'チケットを月末までに買う。';

			const res1 = await api(
				'users/update-memo',
				{
					memo,
					userId: alice.id,
				},
				alice,
			);

			const res2 = await api(
				'users/show',
				{
					userId: alice.id,
				},
				alice,
			);
			expect(res1.status).toBe(204);
			expect((res2.body as unknown as { memo: string })?.memo).toBe(memo);
		});

		test('メモを削除できる', async () => {
			const memo = '10月まで低浮上とのこと。';

			await api(
				'users/update-memo',
				{
					memo,
					userId: bob.id,
				},
				alice,
			);

			await api(
				'users/update-memo',
				{
					memo: '',
					userId: bob.id,
				},
				alice,
			);

			const res = await api(
				'users/show',
				{
					userId: bob.id,
				},
				alice,
			);

			// memoには常に文字列かnullが入っている(5cac151)
			expect((res.body as unknown as { memo: string | null }).memo).toBe(null);
		});

		test('メモは個人ごとに独立して保存される', async () => {
			const memoAliceToBob = '10月まで低浮上とのこと。';
			const memoCarolToBob = '例の件について今度問いただす。';

			await Promise.all([
				api(
					'users/update-memo',
					{
						memo: memoAliceToBob,
						userId: bob.id,
					},
					alice,
				),
				api(
					'users/update-memo',
					{
						memo: memoCarolToBob,
						userId: bob.id,
					},
					carol,
				),
			]);

			const [resAlice, resCarol] = await Promise.all([
				api(
					'users/show',
					{
						userId: bob.id,
					},
					alice,
				),
				api(
					'users/show',
					{
						userId: bob.id,
					},
					carol,
				),
			]);

			expect((resAlice.body as unknown as { memo: string }).memo).toBe(memoAliceToBob);
			expect((resCarol.body as unknown as { memo: string }).memo).toBe(memoCarolToBob);
		});

		test('存在しないユーザーに対してはNO_SUCH_USERを維持する', async () => {
			const res = await api(
				'users/update-memo',
				{
					memo: 'test',
					userId: genId(),
				},
				alice,
			);
			expect(res.status).toBe(400);
			expect(castAsError(res.body as any).error.code).toBe('NO_SUCH_USER');
			expect(castAsError(res.body as any).error.id).toBe('6fef56f3-e765-4957-88e5-c6f65329b8a5');
		});
	});
});
