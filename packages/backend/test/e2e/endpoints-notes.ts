/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash, randomUUID } from 'node:crypto';
import * as assert from 'assert';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
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
import { createEndpointsContext, type EndpointsContext, getAt } from '../endpoints-context.js';

/*
 * アサーションは vitest の expect に寄せているが、判別可能ユニオンの分岐を確定させる箇所だけ
 * node:assert を使う。expect の matcher は `asserts` 述語を持たないため、判別子を検査しても
 * 後続のプロパティアクセスが型エラーになる。
 */

describe('Endpoints', () => {
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let carol: misskey.entities.SignupResponse;
	let dave: misskey.entities.SignupResponse;
	let db: TestDatabase;
	let context: EndpointsContext;

	beforeAll(
		async () => {
			context = await createEndpointsContext();
			({ alice, bob, carol, dave, db } = context);
		},
		1000 * 60 * 2,
	);

	afterAll(async () => {
		await context.close();
	});

	describe('hashtag endpoints', () => {
		test('list, search, and show return packed hashtag data', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const primary = `hono_hashtag_primary_${now}`;
			const secondary = `hono_hashtag_secondary_${now}`;
			await insertHashtags(db, [
				{
					id: genId(now),
					name: primary,
					mentionedUserIds: [alice.id, bob.id],
					mentionedUsersCount: 1000002,
					mentionedLocalUserIds: [alice.id, bob.id],
					mentionedLocalUsersCount: 1000002,
					mentionedRemoteUserIds: [],
					mentionedRemoteUsersCount: 0,
					attachedUserIds: [alice.id],
					attachedUsersCount: 1000001,
					attachedLocalUserIds: [alice.id],
					attachedLocalUsersCount: 1000001,
					attachedRemoteUserIds: [],
					attachedRemoteUsersCount: 0,
				},
				{
					id: genId(now + 1),
					name: secondary,
					mentionedUserIds: [alice.id],
					mentionedUsersCount: 1000001,
					mentionedLocalUserIds: [alice.id],
					mentionedLocalUsersCount: 1000001,
					mentionedRemoteUserIds: [],
					mentionedRemoteUsersCount: 0,
					attachedUserIds: [],
					attachedUsersCount: 0,
					attachedLocalUserIds: [],
					attachedLocalUsersCount: 0,
					attachedRemoteUserIds: [],
					attachedRemoteUsersCount: 0,
				},
			]);

			const list = await api('hashtags/list', {
				limit: 5,
				sort: '+mentionedUsers',
			});
			expect(list.status).toBe(200);
			expect(getAt(list.body, 0).tag).toBe(primary);
			expect(getAt(list.body, 0).mentionedUsersCount).toBe(1000002);
			expect(getAt(list.body, 0).attachedLocalUsersCount).toBe(1000001);

			const search = await api('hashtags/search', {
				query: `hono_hashtag_`,
				limit: 10,
			});
			expect(search.status).toBe(200);
			assert.ok(search.body.includes(primary));
			assert.ok(search.body.includes(secondary));

			const shown = await api('hashtags/show', {
				tag: primary.toUpperCase(),
			});
			expect(shown.status).toBe(200);
			expect(shown.body.tag).toBe(primary);
			expect(shown.body.mentionedLocalUsersCount).toBe(1000002);

			const missing = await api('hashtags/show', {
				tag: `missing_${primary}`,
			});
			expect(missing.status).toBe(400);
			expect(castAsError(missing.body as any).error.code).toBe('NO_SUCH_HASHTAG');
		});

		test('drive/files, drive/files/show, drive/files/find, and drive/files/find-by-hash scope results to the caller', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36);
			const md5 = createHash('md5').update(`hono-drive-files-${suffix}`).digest('hex');
			const file = await createDriveFileInDatabase(db, {
				id: genId(),
				userId: alice.id,
				userHost: null,
				md5,
				name: `hono-drive-files-${suffix}.bin`,
				type: 'application/octet-stream',
				size: 10,
				storedInternal: true,
				url: `${origin}/files/${md5}`,
			});

			const list = await api('drive/files', { limit: 100 }, alice);
			expect(list.status).toBe(200);
			expect((list.body as any[]).some((f) => f.id === file.id)).toBe(true);

			const shownById = await api('drive/files/show', { fileId: file.id }, alice);
			expect(shownById.status).toBe(200);
			expect(shownById.body.id).toBe(file.id);

			const shownByUrl = await api('drive/files/show', { url: file.url }, alice);
			expect(shownByUrl.status).toBe(200);
			expect(shownByUrl.body.id).toBe(file.id);

			const notFound = await api('drive/files/show', { fileId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz' }, alice);
			expect(notFound.status).toBe(400);
			expect(castAsError(notFound.body as any).error.id).toBe('067bc436-2718-4795-b0fb-ecbe43949e31');

			const deniedForBob = await api('drive/files/show', { fileId: file.id }, bob);
			expect(deniedForBob.status).toBe(400);
			expect(castAsError(deniedForBob.body as any).error.id).toBe('25b73c73-68b1-41d0-bad1-381cfdf6579f');

			const found = await api('drive/files/find', { name: file.name }, alice);
			expect(found.status).toBe(200);
			expect((found.body as any[]).some((f) => f.id === file.id)).toBe(true);

			const foundByHash = await api('drive/files/find-by-hash', { md5 }, alice);
			expect(foundByHash.status).toBe(200);
			expect((foundByHash.body as any[]).some((f) => f.id === file.id)).toBe(true);
		});

		test('drive/stream は自分のファイルのみtype絞り込み・ページングして返す', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hdsm${suffix}` });
			const otherUser = await signup({ username: `hdso${suffix}` });

			const imageMd5 = createHash('md5').update(`hono-drive-stream-image-${suffix}`).digest('hex');
			const imageFile = await createDriveFileInDatabase(db, {
				id: genId(),
				userId: user.id,
				userHost: null,
				md5: imageMd5,
				name: `hono-drive-stream-${suffix}.png`,
				type: 'image/png',
				size: 10,
				storedInternal: true,
				url: `${origin}/files/${imageMd5}`,
			});
			const textMd5 = createHash('md5').update(`hono-drive-stream-text-${suffix}`).digest('hex');
			await createDriveFileInDatabase(db, {
				id: genId(),
				userId: user.id,
				userHost: null,
				md5: textMd5,
				name: `hono-drive-stream-${suffix}.txt`,
				type: 'text/plain',
				size: 5,
				storedInternal: true,
				url: `${origin}/files/${textMd5}`,
			});
			const otherMd5 = createHash('md5').update(`hono-drive-stream-other-${suffix}`).digest('hex');
			const otherFile = await createDriveFileInDatabase(db, {
				id: genId(),
				userId: otherUser.id,
				userHost: null,
				md5: otherMd5,
				name: `hono-drive-stream-other-${suffix}.png`,
				type: 'image/png',
				size: 10,
				storedInternal: true,
				url: `${origin}/files/${otherMd5}`,
			});

			const all = await api('drive/stream', { limit: 100 }, user);
			expect(all.status).toBe(200);
			expect(all.body.length).toBe(2);
			assert.ok(!all.body.some((f: any) => f.id === otherFile.id));
			expect(getAt(all.body, 0).user).toBe(null);

			const imagesOnly = await api('drive/stream', { limit: 100, type: 'image/png' }, user);
			expect(imagesOnly.status).toBe(200);
			expect(imagesOnly.body.map((f: any) => f.id)).toStrictEqual([imageFile.id]);
		});

		test('drive/files/attached-notes finds notes referencing a file and rejects non-owners', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36);
			const md5 = createHash('md5').update(`hono-attached-notes-${suffix}`).digest('hex');
			const file = await createDriveFileInDatabase(db, {
				id: genId(),
				userId: alice.id,
				userHost: null,
				md5,
				name: `hono-attached-notes-${suffix}.bin`,
				type: 'application/octet-stream',
				size: 10,
				storedInternal: true,
				url: `${origin}/files/${md5}`,
			});
			const noteId = genId();
			await createNoteInDatabase(db, {
				id: noteId,
				userId: alice.id,
				text: 'attached file note',
				visibility: 'public',
				fileIds: [file.id],
			});

			const found = await api('drive/files/attached-notes', { fileId: file.id }, alice);
			expect(found.status).toBe(200);
			expect((found.body as any[]).some((n) => n.id === noteId)).toBe(true);

			const deniedForBob = await api('drive/files/attached-notes', { fileId: file.id }, bob);
			expect(deniedForBob.status).toBe(400);
			expect(castAsError(deniedForBob.body as any).error.id).toBe('c118ece3-2e4b-4296-99d1-51756e32d232');
		});

		test('drive/files/attached-chat-messages finds chat messages referencing a file and rejects non-owners', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36);
			const sender = await signup({ username: `achatsend${suffix}` });
			const recipient = await signup({ username: `achatrecv${suffix}` });
			await api('following/create', { userId: recipient.id }, sender);
			await api('following/create', { userId: sender.id }, recipient);
			const md5 = createHash('md5').update(`hono-attached-chat-${suffix}`).digest('hex');
			const file = await createDriveFileInDatabase(db, {
				id: genId(),
				userId: sender.id,
				userHost: null,
				md5,
				name: `hono-attached-chat-${suffix}.bin`,
				type: 'application/octet-stream',
				size: 10,
				storedInternal: true,
				url: `${origin}/files/${md5}`,
			});

			const message = await api('chat/messages/create-to-user', { toUserId: recipient.id, fileId: file.id }, sender);
			expect(message.status).toBe(200);

			const found = await api('drive/files/attached-chat-messages', { fileId: file.id }, sender);
			expect(found.status).toBe(200);
			expect((found.body as any[]).some((m) => m.id === message.body.id)).toBe(true);

			const deniedForCarol = await api('drive/files/attached-chat-messages', { fileId: file.id }, carol);
			expect(deniedForCarol.status).toBe(400);
			expect(castAsError(deniedForCarol.body as any).error.id).toBe('485ce26d-f5d2-4313-9783-e689d131eafb');
		});

		test('drive/files/update renames, moves, and toggles sensitivity, rejecting invalid input and foreign access', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36);
			const md5 = createHash('md5').update(`hono-drive-update-${suffix}`).digest('hex');
			const file = await createDriveFileInDatabase(db, {
				id: genId(),
				userId: alice.id,
				userHost: null,
				md5,
				name: `hono-drive-update-${suffix}.bin`,
				type: 'application/octet-stream',
				size: 10,
				storedInternal: true,
				url: `${origin}/files/${md5}`,
				isSensitive: false,
			});
			const folder = await createDriveFolderInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `hono-drive-update-folder-${suffix}`,
			});

			const deniedForBob = await api('drive/files/update', { fileId: file.id, name: 'hijack.bin' }, bob);
			expect(deniedForBob.status).toBe(400);
			expect(castAsError(deniedForBob.body as any).error.id).toBe('01a53b27-82fc-445b-a0c1-b558465a8ed2');

			const invalidName = await api('drive/files/update', { fileId: file.id, name: 'has/slash' }, alice);
			expect(invalidName.status).toBe(400);
			expect(castAsError(invalidName.body as any).error.id).toBe('395e7156-f9f0-475e-af89-53c3c23080c2');

			const noSuchFolder = await api(
				'drive/files/update',
				{ fileId: file.id, folderId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz' },
				alice,
			);
			expect(noSuchFolder.status).toBe(400);
			expect(castAsError(noSuchFolder.body as any).error.id).toBe('ea8fb7a5-af77-4a08-b608-c0218176cd73');

			const updated = await api(
				'drive/files/update',
				{
					fileId: file.id,
					name: `hono-drive-updated-${suffix}.bin`,
					folderId: folder.id,
					isSensitive: true,
					comment: 'updated comment',
				},
				alice,
			);
			expect(updated.status).toBe(200);
			expect(updated.body.name).toBe(`hono-drive-updated-${suffix}.bin`);
			expect(updated.body.folderId).toBe(folder.id);
			expect(updated.body.isSensitive).toBe(true);
			expect(updated.body.comment).toBe('updated comment');

			const missing = await api('drive/files/update', { fileId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz', name: 'x' }, alice);
			expect(missing.status).toBe(400);
			expect(castAsError(missing.body as any).error.id).toBe('e7778c7e-3af9-49cd-9690-6dbc3e6c972d');
		});

		test('drive/files/delete removes a file, rejecting foreign access and missing files', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36);
			const md5 = createHash('md5').update(`hono-drive-delete-${suffix}`).digest('hex');
			const file = await createDriveFileInDatabase(db, {
				id: genId(),
				userId: alice.id,
				userHost: null,
				md5,
				name: `hono-drive-delete-${suffix}.bin`,
				type: 'application/octet-stream',
				size: 10,
				storedInternal: true,
				url: `${origin}/files/${md5}`,
				accessKey: randomUUID(),
			});

			const deniedForBob = await api('drive/files/delete', { fileId: file.id }, bob);
			expect(deniedForBob.status).toBe(400);
			expect(castAsError(deniedForBob.body as any).error.id).toBe('5eb8d909-2540-4970-90b8-dd6f86088121');

			const deleted = await api('drive/files/delete', { fileId: file.id }, alice);
			expect(deleted.status).toBe(204);

			// 実ファイルの削除はレスポンスを待たない fire-and-forget のため、DB からの削除が反映されるまでポーリングする
			let missing;
			await vi.waitFor(
				async () => {
					missing = await api('drive/files/delete', { fileId: file.id }, alice);
					expect(missing.status).toBe(400);
				},
				{ ...POLL, timeout: 10_000 },
			);
			expect(missing!.status).toBe(400);
			expect(castAsError(missing!.body as any).error.id).toBe('908939ec-e52b-4458-b395-1025195cea58');
		});

		test('drive/files/move-bulk moves multiple files into a folder', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36);
			const md5A = createHash('md5').update(`hono-drive-move-a-${suffix}`).digest('hex');
			const fileA = await createDriveFileInDatabase(db, {
				id: genId(),
				userId: alice.id,
				userHost: null,
				md5: md5A,
				name: `hono-drive-move-a-${suffix}.bin`,
				type: 'application/octet-stream',
				size: 10,
				storedInternal: true,
				url: `${origin}/files/${md5A}`,
			});
			const md5B = createHash('md5').update(`hono-drive-move-b-${suffix}`).digest('hex');
			const fileB = await createDriveFileInDatabase(db, {
				id: genId(),
				userId: alice.id,
				userHost: null,
				md5: md5B,
				name: `hono-drive-move-b-${suffix}.bin`,
				type: 'application/octet-stream',
				size: 10,
				storedInternal: true,
				url: `${origin}/files/${md5B}`,
			});
			const folder = await createDriveFolderInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `hono-drive-move-folder-${suffix}`,
			});

			const moved = await api('drive/files/move-bulk', { fileIds: [fileA.id, fileB.id], folderId: folder.id }, alice);
			expect(moved.status).toBe(204);

			expect((await fetchDriveFileByIdFromDatabase(db, fileA.id))?.folderId).toBe(folder.id);
			expect((await fetchDriveFileByIdFromDatabase(db, fileB.id))?.folderId).toBe(folder.id);

			const movedBack = await api('drive/files/move-bulk', { fileIds: [fileA.id, fileB.id], folderId: null }, alice);
			expect(movedBack.status).toBe(204);
			expect((await fetchDriveFileByIdFromDatabase(db, fileA.id))?.folderId).toBe(null);

			const missingFolder = await api(
				'drive/files/move-bulk',
				{ fileIds: [fileA.id], folderId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz' },
				alice,
			);
			expect(missingFolder.status).toBe(400);
			expect(castAsError(missingFolder.body as any).error.id).toBe('abdd73a9-6225-4140-a3e4-8089c77168bc');
		});

		test('chat/messages/create-to-user, show, react, unreact, and delete manage a 1-on-1 message lifecycle', async () => {
			const suffix = Date.now().toString(36);
			const sender = await signup({ username: `chatsender${suffix}` });
			const recipient = await signup({ username: `chatrcpt${suffix}` });
			const unavailableRecipient = await signup({ username: `chatunavail${suffix}` });
			const unavailable = await api(
				'chat/messages/create-to-user',
				{ text: 'hi', toUserId: unavailableRecipient.id },
				sender,
			);
			expect(unavailable.status).toBe(400);
			expect(castAsError(unavailable.body as any).error.code).toBe('CHAT_NOT_AVAILABLE');
			await api('blocking/create', { userId: sender.id }, unavailableRecipient);
			const unavailableAndBlocked = await api(
				'chat/messages/create-to-user',
				{ text: 'hi', toUserId: unavailableRecipient.id },
				sender,
			);
			expect(unavailableAndBlocked.status).toBe(400);
			expect(castAsError(unavailableAndBlocked.body as any).error.code).toBe('CHAT_NOT_AVAILABLE');
			// chatScope はデフォルト 'mutual' のため、相互フォローを確立してからチャットする
			await api('following/create', { userId: recipient.id }, sender);
			await api('following/create', { userId: sender.id }, recipient);

			const selfSend = await api('chat/messages/create-to-user', { text: 'hi', toUserId: sender.id }, sender);
			expect(selfSend.status).toBe(400);
			expect(castAsError(selfSend.body as any).error.id).toBe('17e2ba79-e22a-4cbc-bf91-d327643f4a7e');

			const noContent = await api('chat/messages/create-to-user', { toUserId: recipient.id }, sender);
			expect(noContent.status).toBe(400);
			expect(castAsError(noContent.body as any).error.id).toBe('25587321-b0e6-449c-9239-f8925092942c');

			const noSuchUser = await api(
				'chat/messages/create-to-user',
				{ text: 'hi', toUserId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz' },
				sender,
			);
			expect(noSuchUser.status).toBe(400);
			expect(castAsError(noSuchUser.body as any).error.id).toBe('11795c64-40ea-4198-b06e-3c873ed9039d');

			const noSuchReactionTarget = await api(
				'chat/messages/react',
				{ messageId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz', reaction: '👍' },
				recipient,
			);
			expect(noSuchReactionTarget.status).toBe(400);
			expect(castAsError(noSuchReactionTarget.body as any).error.id).toBe('9b5839b9-0ba0-4351-8c35-37082093d200');

			const noSuchUnreactionTarget = await api(
				'chat/messages/unreact',
				{ messageId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz', reaction: '👍' },
				recipient,
			);
			expect(noSuchUnreactionTarget.status).toBe(400);
			expect(castAsError(noSuchUnreactionTarget.body as any).error.id).toBe('c39ea42f-e3ca-428a-ad57-390e0a711595');

			const created = await api(
				'chat/messages/create-to-user',
				{ text: 'hello there', toUserId: recipient.id },
				sender,
			);
			expect(created.status).toBe(200);
			expect(created.body.text).toBe('hello there');
			expect(created.body.toUserId).toBe(recipient.id);

			const shownBySender = await api('chat/messages/show', { messageId: created.body.id }, sender);
			expect(shownBySender.status).toBe(200);
			expect(shownBySender.body.fromUserId).toBe(sender.id);

			const outsider = await signup({ username: `chatoutsdr${suffix}` });
			const shownByOutsider = await api('chat/messages/show', { messageId: created.body.id }, outsider);
			expect(shownByOutsider.status).toBe(400);
			expect(castAsError(shownByOutsider.body as any).error.id).toBe('3710865b-1848-4da9-8d61-cfed15510b93');

			const invalidReaction = await api(
				'chat/messages/react',
				{ messageId: created.body.id, reaction: 'not-an-emoji' },
				recipient,
			);
			expect(invalidReaction.status).toBe(400);
			expect(castAsError(invalidReaction.body as any).error.code).toBe('INVALID_PARAM');

			const ownReaction = await api('chat/messages/react', { messageId: created.body.id, reaction: '👍' }, sender);
			expect(ownReaction.status).toBe(400);
			expect(castAsError(ownReaction.body as any).error.id).toBe('9b5839b9-0ba0-4351-8c35-37082093d200');

			const reacted = await api('chat/messages/react', { messageId: created.body.id, reaction: '👍' }, recipient);
			expect(reacted.status).toBe(204);
			const unreactedByOutsider = await api(
				'chat/messages/unreact',
				{ messageId: created.body.id, reaction: '👍' },
				outsider,
			);
			expect(unreactedByOutsider.status).toBe(400);
			expect(castAsError(unreactedByOutsider.body as any).error.id).toBe('c39ea42f-e3ca-428a-ad57-390e0a711595');

			const shownAfterReact = await api('chat/messages/show', { messageId: created.body.id }, sender);
			expect(shownAfterReact.status).toBe(200);
			expect(shownAfterReact.body.reactions.length).toBe(1);
			expect(getAt(shownAfterReact.body.reactions, 0).reaction).toBe('👍');

			const unreacted = await api('chat/messages/unreact', { messageId: created.body.id, reaction: '👍' }, recipient);
			expect(unreacted.status).toBe(204);

			const deleteByOther = await api('chat/messages/delete', { messageId: created.body.id }, recipient);
			expect(deleteByOther.status).toBe(400);
			expect(castAsError(deleteByOther.body as any).error.id).toBe('36b67f0e-66a6-414b-83df-992a55294f17');

			const deleted = await api('chat/messages/delete', { messageId: created.body.id }, sender);
			expect(deleted.status).toBe(204);

			await api('i/update', { chatScope: 'everyone' }, recipient);
			const blocked = await api('blocking/create', { userId: sender.id }, recipient);
			expect(blocked.status).toBe(200);
			const sendAfterBlock = await api(
				'chat/messages/create-to-user',
				{ text: 'blocked', toUserId: recipient.id },
				sender,
			);
			expect(sendAfterBlock.status).toBe(400);
			expect(castAsError(sendAfterBlock.body as any).error.id).toBe('c15a5199-7422-4968-941a-2a462c478f7d');
		});

		test('chat/messages/user-timeline and chat/history reflect sent messages and read state', async () => {
			const suffix = Date.now().toString(36);
			const sender = await signup({ username: `chattimeline${suffix}` });
			const recipient = await signup({ username: `chattlrecv${suffix}` });
			await api('following/create', { userId: recipient.id }, sender);
			await api('following/create', { userId: sender.id }, recipient);

			const created = await api(
				'chat/messages/create-to-user',
				{ text: 'timeline message', toUserId: recipient.id },
				sender,
			);
			expect(created.status).toBe(200);

			const timeline = await api('chat/messages/user-timeline', { userId: recipient.id }, sender);
			expect(timeline.status).toBe(200);
			expect((timeline.body as any[]).some((m) => m.id === created.body.id)).toBe(true);

			const history = await api('chat/history', {}, sender);
			expect(history.status).toBe(200);
			const historyEntry = (history.body as any[]).find((m) => m.id === created.body.id);
			assert.ok(historyEntry);

			const readAll = await api('chat/read-all', {}, recipient);
			expect(readAll.status).toBe(204);
		});

		test('chat/rooms lifecycle: create, invite, join, message, members, mute, and leave', async () => {
			const suffix = Date.now().toString(36);
			const owner = await signup({ username: `chatrmown${suffix}` });
			const invitee = await signup({ username: `chatrminv${suffix}` });
			const parallelInvitee = await signup({ username: `chatrmpar${suffix}` });
			const noSuchRoomId = 'zzzzzzzzzzzzzzzzzzzzzzzzzz';

			const joinMissing = await api('chat/rooms/join', { roomId: noSuchRoomId }, invitee);
			expect(joinMissing.status).toBe(400);
			expect(castAsError(joinMissing.body as any).error.id).toBe('84416476-5ce8-4a2c-b568-9569f1b10733');

			const leaveMissing = await api('chat/rooms/leave', { roomId: noSuchRoomId }, invitee);
			expect(leaveMissing.status).toBe(400);
			expect(castAsError(leaveMissing.body as any).error.id).toBe('cb7f3179-50e8-4389-8c30-dbe2650a67c9');

			const muteMissing = await api('chat/rooms/mute', { roomId: noSuchRoomId, mute: true }, invitee);
			expect(muteMissing.status).toBe(400);
			expect(castAsError(muteMissing.body as any).error.id).toBe('c2cde4eb-8d0f-42f1-8f2f-c4d6bfc8e5df');

			const room = await api(
				'chat/rooms/create',
				{ name: `hono-chat-room-${suffix}`, description: 'test room' },
				owner,
			);
			expect(room.status).toBe(200);
			const missingInvitee = await api(
				'chat/rooms/invitations/create',
				{ roomId: room.body.id, userId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz' },
				owner,
			);
			expect(missingInvitee.status).toBe(400);
			expect(castAsError(missingInvitee.body as any).error.id).toBe('0f451b9e-fc21-491a-b2bf-46331103a945');
			expect(room.body.name).toBe(`hono-chat-room-${suffix}`);

			const shown = await api('chat/rooms/show', { roomId: room.body.id }, owner);
			expect(shown.status).toBe(200);
			expect(shown.body.id).toBe(room.body.id);

			const shownByOutsider = await api('chat/rooms/show', { roomId: room.body.id }, invitee);
			expect(shownByOutsider.status).toBe(400);
			expect(castAsError(shownByOutsider.body as any).error.id).toBe('857ae02f-8759-4d20-9adb-6e95fffe4fd7');

			const owned = await api('chat/rooms/owned', {}, owner);
			expect(owned.status).toBe(200);
			expect((owned.body as any[]).some((r) => r.id === room.body.id)).toBe(true);

			const invitation = await api(
				'chat/rooms/invitations/create',
				{ roomId: room.body.id, userId: invitee.id },
				owner,
			);
			expect(invitation.status).toBe(200);
			expect(invitation.body.userId).toBe(invitee.id);
			const parallelInvitations = await Promise.all([
				api('chat/rooms/invitations/create', { roomId: room.body.id, userId: parallelInvitee.id }, owner),
				api('chat/rooms/invitations/create', { roomId: room.body.id, userId: parallelInvitee.id }, owner),
			]);
			expect(parallelInvitations.filter((result) => result.status === 200).length).toBe(1);
			const parallelDuplicate = parallelInvitations.find((result) => result.status === 400);
			assert.ok(parallelDuplicate);
			expect(castAsError(parallelDuplicate.body as any).error.code).toBe('CANNOT_CREATE_INVITATION');
			const [parallelJoin, invitationDuringJoin] = await Promise.all([
				api('chat/rooms/join', { roomId: room.body.id }, parallelInvitee),
				api('chat/rooms/invitations/create', { roomId: room.body.id, userId: parallelInvitee.id }, owner),
			]);
			expect(parallelJoin.status).toBe(204);
			expect(invitationDuringJoin.status).toBe(400);
			expect(castAsError(invitationDuringJoin.body as any).error.code).toBe('CANNOT_CREATE_INVITATION');

			const duplicateInvitation = await api(
				'chat/rooms/invitations/create',
				{ roomId: room.body.id, userId: invitee.id },
				owner,
			);
			expect(duplicateInvitation.status).toBe(400);
			expect(castAsError(duplicateInvitation.body as any).error.code).toBe('CANNOT_CREATE_INVITATION');

			const selfInvitation = await api(
				'chat/rooms/invitations/create',
				{ roomId: room.body.id, userId: owner.id },
				owner,
			);
			expect(selfInvitation.status).toBe(400);
			expect(castAsError(selfInvitation.body as any).error.code).toBe('INVALID_PARAM');

			const outbox = await api('chat/rooms/invitations/outbox', { roomId: room.body.id }, owner);
			expect(outbox.status).toBe(200);
			expect((outbox.body as any[]).some((i) => i.id === invitation.body.id)).toBe(true);

			const inbox = await api('chat/rooms/invitations/inbox', {}, invitee);
			expect(inbox.status).toBe(200);
			expect((inbox.body as any[]).some((i) => i.id === invitation.body.id)).toBe(true);

			const joined = await api('chat/rooms/join', { roomId: room.body.id }, invitee);
			expect(joined.status).toBe(204);

			const joining = await api('chat/rooms/joining', {}, invitee);
			expect(joining.status).toBe(200);
			expect((joining.body as any[]).some((m) => m.roomId === room.body.id)).toBe(true);

			const roomMessage = await api(
				'chat/messages/create-to-room',
				{ text: 'hello room', toRoomId: room.body.id },
				owner,
			);
			expect(roomMessage.status).toBe(200);
			expect(roomMessage.body.toRoomId).toBe(room.body.id);

			const roomTimeline = await api('chat/messages/room-timeline', { roomId: room.body.id }, invitee);
			expect(roomTimeline.status).toBe(200);
			expect((roomTimeline.body as any[]).some((m) => m.id === roomMessage.body.id)).toBe(true);

			const members = await api('chat/rooms/members', { roomId: room.body.id }, owner);
			expect(members.status).toBe(200);
			expect((members.body as any[]).some((m) => m.user.id === invitee.id)).toBe(true);

			// chat/rooms/members は write:chat を要求し、read:chat では利用できない。
			const readOnlyToken = await createAppToken(owner, ['read:chat']);
			const membersWithReadOnlyToken = await api(
				'chat/rooms/members',
				{ roomId: room.body.id },
				{ token: readOnlyToken },
			);
			expect(membersWithReadOnlyToken.status).toBe(403);

			const muted = await api('chat/rooms/mute', { roomId: room.body.id, mute: true }, invitee);
			expect(muted.status).toBe(204);

			const searchResult = await api('chat/messages/search', { query: 'hello room', roomId: room.body.id }, owner);
			expect(searchResult.status).toBe(200);
			expect((searchResult.body as any[]).some((m) => m.id === roomMessage.body.id)).toBe(true);

			const updated = await api(
				'chat/rooms/update',
				{ roomId: room.body.id, name: `hono-chat-room-renamed-${suffix}` },
				owner,
			);
			expect(updated.status).toBe(200);
			expect(updated.body.name).toBe(`hono-chat-room-renamed-${suffix}`);

			const left = await api('chat/rooms/leave', { roomId: room.body.id }, invitee);
			expect(left.status).toBe(204);

			const deniedDelete = await api('chat/rooms/delete', { roomId: room.body.id }, invitee);
			expect(deniedDelete.status).toBe(400);
			expect(castAsError(deniedDelete.body as any).error.id).toBe('d4e3753d-97bf-4a19-ab8e-21080fbc0f4b');

			const deleted = await api('chat/rooms/delete', { roomId: room.body.id }, owner);
			expect(deleted.status).toBe(204);
		});

		test('chat/rooms/invitations/ignore lets a user decline without joining', async () => {
			const suffix = Date.now().toString(36);
			const owner = await signup({ username: `chatigown${suffix}` });
			const invitee = await signup({ username: `chatiginv${suffix}` });

			const ignoreMissing = await api(
				'chat/rooms/invitations/ignore',
				{ roomId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz' },
				invitee,
			);
			expect(ignoreMissing.status).toBe(400);
			expect(castAsError(ignoreMissing.body as any).error.id).toBe('5130557e-5a11-4cfb-9cc5-fe60cda5de0d');

			const room = await api('chat/rooms/create', { name: `hono-ignore-room-${suffix}` }, owner);
			expect(room.status).toBe(200);

			const invitation = await api(
				'chat/rooms/invitations/create',
				{ roomId: room.body.id, userId: invitee.id },
				owner,
			);
			expect(invitation.status).toBe(200);

			const ignored = await api('chat/rooms/invitations/ignore', { roomId: room.body.id }, invitee);
			expect(ignored.status).toBe(204);

			// ignore 済みの招待は既定の一覧（ignored: false）から除外されるが、招待自体は取り消されない。
			const inboxAfterIgnore = await api('chat/rooms/invitations/inbox', {}, invitee);
			expect(inboxAfterIgnore.status).toBe(200);
			expect((inboxAfterIgnore.body as any[]).some((i) => i.id === invitation.body.id)).toBe(false);

			const joinAfterIgnore = await api('chat/rooms/join', { roomId: room.body.id }, invitee);
			expect(joinAfterIgnore.status).toBe(204);
		});

		test('hashtags/users finds users tagged with the given hashtag', async () => {
			const suffix = Date.now().toString(36);
			const tag = `hono_hashtag_users_${suffix}`;
			const tagged = await signup({ username: `htu${suffix}` });
			await updateUserInDatabase(db, tagged.id, { tags: [tag] });

			const found = await api('hashtags/users', {
				tag,
				sort: '+follower',
			});
			expect(found.status).toBe(200);
			expect((found.body as any[]).some((u) => u.id === tagged.id)).toBe(true);

			const notFound = await api('hashtags/users', {
				tag: `missing_${tag}`,
				sort: '+follower',
			});
			expect(notFound.status).toBe(200);
			expect((notFound.body as any[]).length).toBe(0);

			// 負の offset は SQL の OFFSET へ渡ると Postgres がエラーにするので、その前に弾く。
			const negativeOffset = await api('hashtags/users', {
				tag,
				sort: '+follower',
				offset: -1,
			});
			expect(negativeOffset.status).toBe(400);
			expect(castAsError(negativeOffset.body as any).error.code).toBe('INVALID_PARAM');
		});

		test('trend returns Redis-backed hashtag ranking charts', async () => {
			const config = fixtureConfig;
			const redis = createRedisClient(config);
			const tag = `hono_trend_${Date.now()}`;
			const featuredEpoc = new Date('2023-01-01T00:00:00Z').getTime();
			const rankingWindow = Math.floor((Date.now() - featuredEpoc) / (1000 * 60 * 60));
			const chartWindowDate = new Date();
			chartWindowDate.setMinutes(Math.floor(chartWindowDate.getMinutes() / 10) * 10, 0, 0);
			const chartWindow = `${chartWindowDate.getUTCFullYear()}${(chartWindowDate.getUTCMonth() + 1).toString().padStart(2, '0')}${chartWindowDate.getUTCDate().toString().padStart(2, '0')}${chartWindowDate.getUTCHours().toString().padStart(2, '0')}${chartWindowDate.getUTCMinutes().toString().padStart(2, '0')}`;

			try {
				await redis.zadd(`featuredHashtagsRanking:${rankingWindow}`, 5, tag);
				await redis.pfadd(`hashtagUsers:${tag}:${chartWindow}`, alice.id, bob.id);

				const trend = await api('hashtags/trend', {});
				expect(trend.status).toBe(200);
				const ranked = trend.body.find((item) => item.tag === tag);
				assert.ok(ranked);
				expect(ranked.chart.length).toBe(20);
				assert.ok(ranked.usersCount >= 1);
			} finally {
				await redis.zrem(`featuredHashtagsRanking:${rankingWindow}`, tag);
				await redis.del(`hashtagUsers:${tag}:${chartWindow}`);
				await closeRedisConnection(redis);
			}
		});
	});

	describe('notes/translate', () => {
		test('role policy、可視性、DeepL未設定によるUNAVAILABLEを維持する', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hnt${suffix}` });
			const viewer = await signup({ username: `hntv${suffix}` });
			const publicNote = await post(author, { text: 'hono translate target', visibility: 'public' });
			const specifiedNote = await post(author, {
				text: 'hono translate specified',
				visibility: 'specified',
				visibleUserIds: [author.id],
			});

			// deeplAuthKeyがテスト環境では未設定のため、可視な公開ノートに対してもUNAVAILABLEになる
			const unavailableNoKey = await api('notes/translate', { noteId: publicNote.id, targetLang: 'en' }, viewer);
			expect(unavailableNoKey.status).toBe(400);
			expect(castAsError(unavailableNoKey.body as any).error.code).toBe('UNAVAILABLE');

			const noSuchNote = await api('notes/translate', { noteId: genId(), targetLang: 'en' }, viewer);
			expect(noSuchNote.status).toBe(400);
			expect(castAsError(noSuchNote.body as any).error.code).toBe('NO_SUCH_NOTE');

			const invisible = await api('notes/translate', { noteId: specifiedNote.id, targetLang: 'en' }, viewer);
			expect(invisible.status).toBe(400);
			expect(castAsError(invisible.body as any).error.code).toBe('CANNOT_TRANSLATE_INVISIBLE_NOTE');

			const noTranslatorRole = await role(
				alice,
				{
					name: `hono notes translate denied ${suffix}`,
				},
				{
					canUseTranslator: { priority: 1, useDefault: false, value: false },
				},
			);
			const assignDenied = await api('admin/roles/assign', { roleId: noTranslatorRole.id, userId: viewer.id }, alice);
			expect(assignDenied.status).toBe(204);

			const roleDenied = await api('notes/translate', { noteId: publicNote.id, targetLang: 'en' }, viewer);
			expect(roleDenied.status).toBe(400);
			expect(castAsError(roleDenied.body as any).error.code).toBe('UNAVAILABLE');
		});

		test('本文が無いノートは204(本文無し)を返す', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hntn${suffix}` });
			const file = await uploadFile(author);
			const textlessNote = await post(author, { fileIds: [file.body!.id], visibility: 'public' });
			expect(textlessNote.text).toBe(null);

			const res = await api('notes/translate', { noteId: textlessNote.id, targetLang: 'en' }, author);
			expect(res.status).toBe(204);
			expect(res.body).toBe(null);
		});
	});

	describe('notes/show', () => {
		test('基本フィールド、reply/renote、poll、reactionを維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hns${suffix}` });
			const reactor = await signup({ username: `hnsr${suffix}` });

			const replyTargetId = genId();
			await createNoteInDatabase(db, {
				id: replyTargetId,
				text: 'reply target',
				userId: author.id,
				userHost: null,
				visibility: 'public',
			});
			const renoteTargetId = genId();
			await createNoteInDatabase(db, {
				id: renoteTargetId,
				text: 'renote target',
				userId: author.id,
				userHost: null,
				visibility: 'public',
			});
			const pollNoteId = genId();
			await createNoteInDatabase(db, {
				id: pollNoteId,
				text: 'poll note',
				userId: author.id,
				userHost: null,
				visibility: 'public',
				hasPoll: true,
			});
			await createPollInDatabase(db, {
				noteId: pollNoteId,
				expiresAt: null,
				multiple: false,
				choices: ['A', 'B'],
				votes: [3, 5],
				noteVisibility: 'public',
				userId: author.id,
				userHost: null,
				channelId: null,
			});

			const mainNoteId = genId();
			await createNoteInDatabase(db, {
				id: mainNoteId,
				text: 'hono notes/show main note',
				userId: author.id,
				userHost: null,
				visibility: 'public',
				replyId: replyTargetId,
				renoteId: renoteTargetId,
				reactions: { '👍': 2 },
				// 直近 2 秒以内のノートは DB を引かず pair cache から myReaction を解決する。
				// reactions の合計数 (2) 以上の pair が無いと cache 不完全とみなされ 2秒ガードで
				// undefined になるため、reactions と整合する 2 件の pair を用意する
				reactionAndUserPairCache: [`${reactor.id}/👍`, `${author.id}/👍`],
			});
			await createNoteReactionInDatabase(db, {
				id: genId(),
				noteId: mainNoteId,
				userId: reactor.id,
				reaction: '👍',
			});

			const shown = await api('notes/show', { noteId: mainNoteId });
			expect(shown.status).toBe(200);
			expect(shown.body.id).toBe(mainNoteId);
			expect(shown.body.text).toBe('hono notes/show main note');
			expect(shown.body.userId).toBe(author.id);
			expect(shown.body.user.id).toBe(author.id);
			expect(shown.body.replyId).toBe(replyTargetId);
			expect(shown.body.reply?.id).toBe(replyTargetId);
			expect(shown.body.renoteId).toBe(renoteTargetId);
			expect(shown.body.renote?.id).toBe(renoteTargetId);
			expect(shown.body.reactions?.['👍']).toBe(2);
			expect(shown.body.reactionCount).toBe(2);

			const pollShown = await api('notes/show', { noteId: pollNoteId }, author);
			expect(pollShown.status).toBe(200);
			expect(pollShown.body.poll?.multiple).toBe(false);
			expect(pollShown.body.poll?.choices.length).toBe(2);
			expect(pollShown.body.poll?.choices.find((c: any) => c.text === 'A')?.votes).toBe(3);
			expect(pollShown.body.poll?.choices.find((c: any) => c.text === 'B')?.votes).toBe(5);

			const reactedAsReactor = await api('notes/show', { noteId: mainNoteId }, reactor);
			expect(reactedAsReactor.body.myReaction).toBe('👍');

			const missing = await api('notes/show', { noteId: genId() });
			expect(missing.status).toBe(400);
			expect(castAsError(missing.body as any).error.code).toBe('NO_SUCH_NOTE');
			expect(castAsError(missing.body as any).error.id).toBe('24fcbfc6-2e37-42b6-8388-c29b3861a08d');
		});

		test('可視性(specified/followers)とrequireSigninToViewContentsを維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hnv${suffix}` });
			const addressee = await signup({ username: `hnva${suffix}` });
			const stranger = await signup({ username: `hnvs${suffix}` });
			const follower = await signup({ username: `hnvf${suffix}` });
			await api('following/create', { userId: author.id }, follower);

			const specifiedNoteId = genId();
			await createNoteInDatabase(db, {
				id: specifiedNoteId,
				text: 'specified note',
				userId: author.id,
				userHost: null,
				visibility: 'specified',
				visibleUserIds: [addressee.id],
			});

			const hiddenFromStranger = await api('notes/show', { noteId: specifiedNoteId }, stranger);
			expect(hiddenFromStranger.status).toBe(200);
			expect(hiddenFromStranger.body.isHidden).toBe(true);
			expect(hiddenFromStranger.body.text).toBe(null);

			const visibleToAddressee = await api('notes/show', { noteId: specifiedNoteId }, addressee);
			expect(visibleToAddressee.status).toBe(200);
			expect(visibleToAddressee.body.isHidden).toBe(undefined);
			expect(visibleToAddressee.body.text).toBe('specified note');

			const followersNoteId = genId();
			await createNoteInDatabase(db, {
				id: followersNoteId,
				text: 'followers only note',
				userId: author.id,
				userHost: null,
				visibility: 'followers',
			});

			const hiddenFromNonFollower = await api('notes/show', { noteId: followersNoteId }, stranger);
			expect(hiddenFromNonFollower.body.isHidden).toBe(true);

			const visibleToFollower = await api('notes/show', { noteId: followersNoteId }, follower);
			expect(visibleToFollower.body.isHidden).toBe(undefined);
			expect(visibleToFollower.body.text).toBe('followers only note');

			await updateUserInDatabase(db, author.id, { requireSigninToViewContents: true });
			const publicNoteId = genId();
			await createNoteInDatabase(db, {
				id: publicNoteId,
				text: 'public but restricted',
				userId: author.id,
				userHost: null,
				visibility: 'public',
			});

			const restrictedAnonymous = await api('notes/show', { noteId: publicNoteId });
			expect(restrictedAnonymous.status).toBe(400);
			expect(castAsError(restrictedAnonymous.body as any).error.code).toBe('CONTENT_RESTRICTED_BY_USER');

			const allowedSignedIn = await api('notes/show', { noteId: publicNoteId }, stranger);
			expect(allowedSignedIn.status).toBe(200);
			expect(allowedSignedIn.body.text).toBe('public but restricted');
		});
	});

	describe('notes relations (children/conversation/mentions/replies/renotes)', () => {
		test('reply/renoteの親子関係とmentionsを維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hnr${suffix}` });
			const mentioned = await signup({ username: `hnrm${suffix}` });
			const stranger = await signup({ username: `hnrs${suffix}` });

			const rootId = genId();
			await createNoteInDatabase(db, {
				id: rootId,
				text: 'root note',
				userId: author.id,
				userHost: null,
				visibility: 'public',
			});
			const replyId = genId();
			await createNoteInDatabase(db, {
				id: replyId,
				text: 'reply note',
				userId: author.id,
				userHost: null,
				visibility: 'public',
				replyId: rootId,
			});
			const grandReplyId = genId();
			await createNoteInDatabase(db, {
				id: grandReplyId,
				text: 'grand reply note',
				userId: author.id,
				userHost: null,
				visibility: 'public',
				replyId: replyId,
			});
			const renoteId = genId();
			await createNoteInDatabase(db, {
				id: renoteId,
				text: null,
				userId: author.id,
				userHost: null,
				visibility: 'public',
				renoteId: rootId,
			});
			const mentionNoteId = genId();
			await createNoteInDatabase(db, {
				id: mentionNoteId,
				text: `@${mentioned.username} hi`,
				userId: author.id,
				userHost: null,
				visibility: 'public',
				mentions: [mentioned.id],
			});

			const children = await api('notes/children', { noteId: rootId });
			expect(children.status).toBe(200);
			const childIds = children.body.map((n: any) => n.id).sort();
			// 純リノート (text/ファイル/投票なし) は children に含まれず、引用のみ含まれる。
			expect(childIds).toStrictEqual([replyId]);

			const replies = await api('notes/replies', { noteId: rootId });
			expect(replies.status).toBe(200);
			expect(replies.body.length).toBe(1);
			expect(getAt(replies.body, 0).id).toBe(replyId);

			const renotes = await api('notes/renotes', { noteId: rootId });
			expect(renotes.status).toBe(200);
			expect(renotes.body.length).toBe(1);
			expect(getAt(renotes.body, 0).id).toBe(renoteId);

			const missingRenotes = await api('notes/renotes', { noteId: genId() });
			expect(missingRenotes.status).toBe(400);
			expect(castAsError(missingRenotes.body as any).error.code).toBe('NO_SUCH_NOTE');

			const conversation = await api('notes/conversation', { noteId: grandReplyId });
			expect(conversation.status).toBe(200);
			const conversationIds = conversation.body.map((n: any) => n.id).sort();
			expect(conversationIds).toStrictEqual([rootId, replyId].sort());

			const missingConversation = await api('notes/conversation', { noteId: genId() });
			expect(missingConversation.status).toBe(400);
			expect(castAsError(missingConversation.body as any).error.code).toBe('NO_SUCH_NOTE');

			const mentions = await api('notes/mentions', {}, mentioned);
			expect(mentions.status).toBe(200);
			assert.ok(mentions.body.some((n: any) => n.id === mentionNoteId));
			expect(mentions.body.some((n: any) => n.id === rootId)).toBe(false);

			const noMentionsForStranger = await api('notes/mentions', {}, stranger);
			expect(noMentionsForStranger.status).toBe(200);
			expect(noMentionsForStranger.body.some((n: any) => n.id === mentionNoteId)).toBe(false);
		});
	});

	describe('notes/state and notes/favorites', () => {
		test('notes/state、notes/favorites/{create,delete}はfavorite状態とachievementを維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hnf${suffix}` });
			const favoriter = await signup({ username: `hnff${suffix}` });
			const noteId = genId();
			await createNoteInDatabase(db, {
				id: noteId,
				text: 'favorite target',
				userId: author.id,
				userHost: null,
				visibility: 'public',
			});

			const stateBefore = await api('notes/state', { noteId }, favoriter);
			expect(stateBefore.status).toBe(200);
			expect(stateBefore.body.isFavorited).toBe(false);
			expect(stateBefore.body.isMutedThread).toBe(false);

			const missingFavorite = await api('notes/favorites/delete', { noteId }, favoriter);
			expect(missingFavorite.status).toBe(400);
			expect(castAsError(missingFavorite.body as any).error.code).toBe('NOT_FAVORITED');

			const favorited = await api('notes/favorites/create', { noteId }, favoriter);
			expect(favorited.status).toBe(204);

			const duplicateFavorite = await api('notes/favorites/create', { noteId }, favoriter);
			expect(duplicateFavorite.status).toBe(400);
			expect(castAsError(duplicateFavorite.body as any).error.code).toBe('ALREADY_FAVORITED');

			const stateAfter = await api('notes/state', { noteId }, favoriter);
			expect(stateAfter.body.isFavorited).toBe(true);

			const authorProfile = await fetchUserProfileByUserIdOrFailFromDatabase(db, author.id);
			assert.ok(authorProfile.achievements.some((a) => a.name === 'myNoteFavorited1'));

			const unfavorited = await api('notes/favorites/delete', { noteId }, favoriter);
			expect(unfavorited.status).toBe(204);

			const stateFinal = await api('notes/state', { noteId }, favoriter);
			expect(stateFinal.body.isFavorited).toBe(false);
		});

		test('notes/thread-muting/{create,delete}はミュート状態を維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `htm${suffix}` });
			const muter = await signup({ username: `htmm${suffix}` });
			const noteId = genId();
			await createNoteInDatabase(db, {
				id: noteId,
				text: 'thread mute target',
				userId: author.id,
				userHost: null,
				visibility: 'public',
			});

			const muted = await api('notes/thread-muting/create', { noteId }, muter);
			expect(muted.status).toBe(204);

			const stateAfterMute = await api('notes/state', { noteId }, muter);
			expect(stateAfterMute.body.isMutedThread).toBe(true);

			// (userId, threadId) は unique なので、二重ミュートは 500 ではなく明示的なエラーになる
			const duplicate = await api('notes/thread-muting/create', { noteId }, muter);
			expect(duplicate.status).toBe(400);
			expect(castAsError(duplicate.body as any).error.code).toBe('ALREADY_MUTING');

			const unmuted = await api('notes/thread-muting/delete', { noteId }, muter);
			expect(unmuted.status).toBe(204);

			const stateAfterUnmute = await api('notes/state', { noteId }, muter);
			expect(stateAfterUnmute.body.isMutedThread).toBe(false);

			const missingNote = await api('notes/thread-muting/create', { noteId: genId() }, muter);
			expect(missingNote.status).toBe(400);
			expect(castAsError(missingNote.body as any).error.code).toBe('NO_SUCH_NOTE');
		});
	});

	describe('notes timelines (global/local/hybrid/featured)', () => {
		test('global-timeline と local-timeline は可視性・ホスト条件を維持する', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `htl${suffix}` });

			// fanout タイムライン (Redis) 経由の読み取りを検証するため、直接DB挿入ではなく実APIで投稿する
			const publicNoteId = (await post(author, { text: 'global/local timeline public note', visibility: 'public' })).id;
			const homeNoteId = (
				await post(author, { text: 'home-only note (excluded from global/local)', visibility: 'home' })
			).id;

			const global = await api('notes/global-timeline', { limit: 100 });
			expect(global.status).toBe(200);
			assert.ok(global.body.some((n: any) => n.id === publicNoteId));
			expect(global.body.some((n: any) => n.id === homeNoteId)).toBe(false);

			const local = await api('notes/local-timeline', { limit: 100 });
			expect(local.status).toBe(200);
			assert.ok(local.body.some((n: any) => n.id === publicNoteId));
			expect(local.body.some((n: any) => n.id === homeNoteId)).toBe(false);
		});

		test('hybrid-timeline はfolloweeの投稿のみ含む', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const viewer = await signup({ username: `hht${suffix}` });
			const followee = await signup({ username: `hhtf${suffix}` });
			const stranger = await signup({ username: `hhts${suffix}` });
			await api('following/create', { userId: followee.id }, viewer);

			const followeeNoteId = (await post(followee, { text: 'from followee', visibility: 'public' })).id;
			const strangerNoteId = (
				await post(stranger, { text: 'from stranger, not followed, not local timeline eligible', visibility: 'home' })
			).id;

			const hybrid = await api('notes/hybrid-timeline', { limit: 100 }, viewer);
			expect(hybrid.status).toBe(200);
			assert.ok(hybrid.body.some((n: any) => n.id === followeeNoteId));
			expect(hybrid.body.some((n: any) => n.id === strangerNoteId)).toBe(false);
		});

		test('notes/featured はランキング、mute/blockフィルタを維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hnff2${suffix}` });
			const viewer = await signup({ username: `hnff2v${suffix}` });
			const noteId = genId();
			await createNoteInDatabase(db, {
				id: noteId,
				text: 'featured note',
				userId: author.id,
				userHost: null,
				visibility: 'public',
			});
			const mutedNoteId = genId();
			await createNoteInDatabase(db, {
				id: mutedNoteId,
				text: 'featured note from muted user',
				userId: author.id,
				userHost: null,
				visibility: 'public',
			});

			const redis = createRedisClient(config);
			const windowKey = `featuredGlobalNotesRanking:${Math.floor((Date.now() - new Date('2023-01-01T00:00:00Z').getTime()) / (1000 * 60 * 60 * 24 * 3))}`;
			try {
				await redis.zadd(windowKey, 1, noteId, 1, mutedNoteId);

				const featured = await api('notes/featured', { limit: 100 });
				expect(featured.status).toBe(200);
				assert.ok(featured.body.some((n: any) => n.id === noteId));

				await api('mute/create', { userId: author.id }, viewer);
				const featuredAsViewer = await api('notes/featured', { limit: 100 }, viewer);
				expect(featuredAsViewer.status).toBe(200);
				expect(featuredAsViewer.body.some((n: any) => n.id === noteId)).toBe(false);

				const getFeatured = await relativeFetch(`api/notes/featured?limit=100`);
				expect(getFeatured.status).toBe(200);
				const getFeaturedBody = (await getFeatured.json()) as { id?: unknown }[];
				assert.ok(getFeaturedBody.some((n) => n.id === noteId));
			} finally {
				await redis.del(windowKey);
				await closeRedisConnection(redis);
			}
		});
	});

	describe('notes (bare, インスタンス全体のpublicノート一覧)', () => {
		test('publicかつlocalOnly=falseなノートのみ返す', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hn${suffix}` });

			const publicNoteId = genId();
			await createNoteInDatabase(db, {
				id: publicNoteId,
				text: 'bare notes public',
				userId: author.id,
				userHost: null,
				visibility: 'public',
			});
			const homeNoteId = genId();
			await createNoteInDatabase(db, {
				id: homeNoteId,
				text: 'bare notes home (excluded)',
				userId: author.id,
				userHost: null,
				visibility: 'home',
			});
			const localOnlyNoteId = genId();
			await createNoteInDatabase(db, {
				id: localOnlyNoteId,
				text: 'bare notes localOnly (excluded)',
				userId: author.id,
				userHost: null,
				visibility: 'public',
				localOnly: true,
			});

			const res = await api('notes', { limit: 100 });
			expect(res.status).toBe(200);
			assert.ok(res.body.some((n: any) => n.id === publicNoteId));
			expect(res.body.some((n: any) => n.id === homeNoteId)).toBe(false);
			expect(res.body.some((n: any) => n.id === localOnlyNoteId)).toBe(false);
		});

		test('local/reply/renote/withFiles/pollフィルタを維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hnf${suffix}` });
			const file = await uploadFile(author);

			const localNoteId = genId();
			await createNoteInDatabase(db, {
				id: localNoteId,
				text: 'bare notes local',
				userId: author.id,
				userHost: null,
				visibility: 'public',
			});
			const remoteNoteId = genId();
			await createNoteInDatabase(db, {
				id: remoteNoteId,
				text: 'bare notes remote (excluded by local)',
				userId: author.id,
				userHost: 'remote.example.com',
				visibility: 'public',
			});

			const rootNote = await post(author, { text: 'bare notes root', visibility: 'public' });
			const replyNoteId = genId();
			await createNoteInDatabase(db, {
				id: replyNoteId,
				text: 'bare notes reply',
				userId: author.id,
				userHost: null,
				visibility: 'public',
				replyId: rootNote.id,
			});

			const fileNoteId = genId();
			await createNoteInDatabase(db, {
				id: fileNoteId,
				text: null,
				userId: author.id,
				userHost: null,
				visibility: 'public',
				fileIds: [file.body!.id],
			});

			const renoteNoteId = genId();
			await createNoteInDatabase(db, {
				id: renoteNoteId,
				text: null,
				userId: author.id,
				userHost: null,
				visibility: 'public',
				renoteId: rootNote.id,
			});

			const local = await api('notes', { local: true, limit: 100 });
			expect(local.status).toBe(200);
			assert.ok(local.body.some((n: any) => n.id === localNoteId));
			expect(local.body.some((n: any) => n.id === remoteNoteId)).toBe(false);

			const replies = await api('notes', { reply: true, limit: 100 });
			expect(replies.status).toBe(200);
			assert.ok(replies.body.some((n: any) => n.id === replyNoteId));
			expect(replies.body.some((n: any) => n.id === localNoteId)).toBe(false);

			const renotes = await api('notes', { renote: true, limit: 100 });
			expect(renotes.status).toBe(200);
			assert.ok(renotes.body.some((n: any) => n.id === renoteNoteId));
			expect(renotes.body.some((n: any) => n.id === localNoteId)).toBe(false);

			const withFiles = await api('notes', { withFiles: true, limit: 100 });
			expect(withFiles.status).toBe(200);
			assert.ok(withFiles.body.some((n: any) => n.id === fileNoteId));
			expect(withFiles.body.some((n: any) => n.id === localNoteId)).toBe(false);

			const pollNoteId = genId();
			await createNoteInDatabase(db, {
				id: pollNoteId,
				text: 'bare notes poll',
				userId: author.id,
				userHost: null,
				visibility: 'public',
				hasPoll: true,
			});
			await createPollInDatabase(db, {
				noteId: pollNoteId,
				expiresAt: null,
				multiple: false,
				choices: ['a', 'b'],
				votes: [0, 0],
				noteVisibility: 'public',
				userId: author.id,
				userHost: null,
			});

			const polls = await api('notes', { poll: true, limit: 100 });
			expect(polls.status).toBe(200);
			assert.ok(polls.body.some((n: any) => n.id === pollNoteId));
			expect(polls.body.some((n: any) => n.id === localNoteId)).toBe(false);
		});

		test('認証済みで呼んでもmeを渡さず常に匿名としてパックする(元実装がpackMany(notes)をme無しで呼ぶため)', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hnm${suffix}` });
			const reactor = await signup({ username: `hnmr${suffix}` });

			const noteId = genId();
			await createNoteInDatabase(db, {
				id: noteId,
				text: 'bare notes anonymous packing',
				userId: author.id,
				userHost: null,
				visibility: 'public',
			});
			const reacted = await api('notes/reactions/create', { noteId, reaction: '👍' }, reactor);
			expect(reacted.status).toBe(204);

			const asReactor = await api('notes', { limit: 100 }, reactor);
			expect(asReactor.status).toBe(200);
			const packed = asReactor.body.find((n: any) => n.id === noteId);
			assert.ok(packed);
			expect(packed.myReaction).toBe(undefined);
		});

		test('sinceId/untilIdによるページネーションを維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hnp${suffix}` });

			const oldNoteId = genId();
			await createNoteInDatabase(db, {
				id: oldNoteId,
				text: 'bare notes pagination old',
				userId: author.id,
				userHost: null,
				visibility: 'public',
			});
			const newNoteId = genId();
			await createNoteInDatabase(db, {
				id: newNoteId,
				text: 'bare notes pagination new',
				userId: author.id,
				userHost: null,
				visibility: 'public',
			});

			const afterOld = await api('notes', { sinceId: oldNoteId, limit: 100 });
			expect(afterOld.status).toBe(200);
			assert.ok(afterOld.body.some((n: any) => n.id === newNoteId));
			expect(afterOld.body.some((n: any) => n.id === oldNoteId)).toBe(false);

			const beforeNew = await api('notes', { untilId: newNoteId, limit: 100 });
			expect(beforeNew.status).toBe(200);
			assert.ok(beforeNew.body.some((n: any) => n.id === oldNoteId));
			expect(beforeNew.body.some((n: any) => n.id === newNoteId)).toBe(false);
		});
	});

	describe('notes/clips, search-by-tag, show-partial-bulk, timeline, user-list-timeline, polls/recommendation', () => {
		test('notes/clips はpublicなclipのみ返しNO_SUCH_NOTEを維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `hncl${suffix}` });
			const noteId = genId();
			await createNoteInDatabase(db, {
				id: noteId,
				text: 'clipped note',
				userId: owner.id,
				userHost: null,
				visibility: 'public',
			});
			const publicClip = await api(
				'clips/create',
				{ name: `hono notes/clips public ${suffix}`, isPublic: true },
				owner,
			);
			const privateClip = await api(
				'clips/create',
				{ name: `hono notes/clips private ${suffix}`, isPublic: false },
				owner,
			);
			await api('clips/add-note', { clipId: publicClip.body.id, noteId }, owner);
			await api('clips/add-note', { clipId: privateClip.body.id, noteId }, owner);

			const clips = await api('notes/clips', { noteId });
			expect(clips.status).toBe(200);
			expect(clips.body.length).toBe(1);
			expect(getAt(clips.body, 0).id).toBe(publicClip.body.id);

			const missing = await api('notes/clips', { noteId: genId() });
			expect(missing.status).toBe(400);
			expect(castAsError(missing.body as any).error.code).toBe('NO_SUCH_NOTE');
		});

		test('notes/search-by-tag はtagで検索する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hnst${suffix}` });
			const tag = `hono-tag-${suffix}`;
			const taggedNoteId = genId();
			await createNoteInDatabase(db, {
				id: taggedNoteId,
				text: `#${tag}`,
				userId: author.id,
				userHost: null,
				visibility: 'public',
				tags: [tag.toLowerCase()],
			});
			const untaggedNoteId = genId();
			await createNoteInDatabase(db, {
				id: untaggedNoteId,
				text: 'no tag here',
				userId: author.id,
				userHost: null,
				visibility: 'public',
			});

			const res = await api('notes/search-by-tag', { tag });
			expect(res.status).toBe(200);
			assert.ok(res.body.some((n: any) => n.id === taggedNoteId));
			expect(res.body.some((n: any) => n.id === untaggedNoteId)).toBe(false);
		});

		test('notes/show-partial-bulk はreactionsとreactionEmojisを返す', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hnsp${suffix}` });
			const noteId = genId();
			await createNoteInDatabase(db, {
				id: noteId,
				text: 'partial bulk target',
				userId: author.id,
				userHost: null,
				visibility: 'public',
				reactions: { '👍': 3 },
			});

			const res = await api('notes/show-partial-bulk', { noteIds: [noteId] });
			expect(res.status).toBe(200);
			expect(res.body.length).toBe(1);
			expect(getAt(res.body, 0).id).toBe(noteId);
			expect(getAt(res.body, 0).reactions['👍']).toBe(3);
		});

		test('notes/show-partial-bulk は閲覧できないノートを返さない', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hnsv${suffix}` });
			const viewer = await signup({ username: `hnsvv${suffix}` });
			const publicNote = await post(author, { text: 'visible partial bulk' });
			const specifiedNote = await post(author, {
				text: 'invisible partial bulk',
				visibility: 'specified',
				visibleUserIds: [author.id],
			});

			for (const user of [undefined, viewer]) {
				const res = await api('notes/show-partial-bulk', { noteIds: [publicNote.id, specifiedNote.id] }, user);
				expect(res.status).toBe(200);
				expect(res.body.map((note) => note.id)).toStrictEqual([publicNote.id]);
			}
		});

		test('notes/show-partial-bulk はフォロー中のfollowersノートだけ返す', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const viewer = await signup({ username: `hnfv${suffix}` });
			const followee = await signup({ username: `hnff${suffix}` });
			const stranger = await signup({ username: `hnfs${suffix}` });
			await api('following/create', { userId: followee.id }, viewer);

			const followeeNote = await post(followee, {
				text: 'visible followers note',
				visibility: 'followers',
			});
			const strangerNote = await post(stranger, {
				text: 'invisible followers note',
				visibility: 'followers',
			});

			const res = await api(
				'notes/show-partial-bulk',
				{
					noteIds: [followeeNote.id, strangerNote.id],
				},
				viewer,
			);
			expect(res.status).toBe(200);
			expect(res.body.map((note) => note.id)).toStrictEqual([followeeNote.id]);
		});

		test('notes/timeline はfolloweeの投稿のみ含む', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const viewer = await signup({ username: `hnt${suffix}` });
			const followee = await signup({ username: `hntf${suffix}` });
			const stranger = await signup({ username: `hnts${suffix}` });
			await api('following/create', { userId: followee.id }, viewer);

			const followeeNoteId = genId();
			await createNoteInDatabase(db, {
				id: followeeNoteId,
				text: 'timeline from followee',
				userId: followee.id,
				userHost: null,
				visibility: 'public',
			});
			const strangerNoteId = genId();
			await createNoteInDatabase(db, {
				id: strangerNoteId,
				text: 'timeline from stranger',
				userId: stranger.id,
				userHost: null,
				visibility: 'public',
			});

			const timeline = await api('notes/timeline', { limit: 100 }, viewer);
			expect(timeline.status).toBe(200);
			assert.ok(timeline.body.some((n: any) => n.id === followeeNoteId));
			expect(timeline.body.some((n: any) => n.id === strangerNoteId)).toBe(false);
		});

		test('notes/user-list-timeline はリストメンバーの投稿のみ含みNO_SUCH_LISTを維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `hult${suffix}` });
			const member = await signup({ username: `hultm${suffix}` });
			const nonMember = await signup({ username: `hultn${suffix}` });
			const list = await createUserListInDatabase(db, {
				id: genId(),
				userId: owner.id,
				name: `hono user-list-timeline ${suffix}`,
			});
			await createUserListMembershipInDatabase(db, {
				id: genId(),
				userId: member.id,
				userListId: list.id,
				userListUserId: owner.id,
			});

			const memberNoteId = genId();
			await createNoteInDatabase(db, {
				id: memberNoteId,
				text: 'from list member',
				userId: member.id,
				userHost: null,
				visibility: 'public',
			});
			const nonMemberNoteId = genId();
			await createNoteInDatabase(db, {
				id: nonMemberNoteId,
				text: 'from non member',
				userId: nonMember.id,
				userHost: null,
				visibility: 'public',
			});

			const timeline = await api('notes/user-list-timeline', { listId: list.id, limit: 100 }, owner);
			expect(timeline.status).toBe(200);
			assert.ok(timeline.body.some((n: any) => n.id === memberNoteId));
			expect(timeline.body.some((n: any) => n.id === nonMemberNoteId)).toBe(false);

			const missingList = await api('notes/user-list-timeline', { listId: genId() }, owner);
			expect(missingList.status).toBe(400);
			expect(castAsError(missingList.body as any).error.code).toBe('NO_SUCH_LIST');
		});

		test('notes/polls/recommendation は未投票のpublic pollのみ返す', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hnpr${suffix}` });
			const voter = await signup({ username: `hnprv${suffix}` });

			const unvotedNoteId = genId();
			await createNoteInDatabase(db, {
				id: unvotedNoteId,
				text: 'unvoted poll',
				userId: author.id,
				userHost: null,
				visibility: 'public',
				hasPoll: true,
			});
			await createPollInDatabase(db, {
				noteId: unvotedNoteId,
				expiresAt: null,
				multiple: false,
				choices: ['A', 'B'],
				votes: [0, 0],
				noteVisibility: 'public',
				userId: author.id,
				userHost: null,
				channelId: null,
			});

			const recommendation = await api('notes/polls/recommendation', { limit: 100 }, voter);
			expect(recommendation.status).toBe(200);
			assert.ok(recommendation.body.some((n: any) => n.id === unvotedNoteId));
		});

		test('notes/search はテキスト全文検索とROLE制限を維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hnse${suffix}` });
			const searchNoteId = genId();
			const uniqueText = `hono-search-unique-${suffix}`;
			await createNoteInDatabase(db, {
				id: searchNoteId,
				text: uniqueText,
				userId: author.id,
				userHost: null,
				visibility: 'public',
			});

			// canSearchNotes はデフォルト false のため、ロールで許可してから検索する。
			const searchRole = await role(alice, {}, { canSearchNotes: { priority: 1, useDefault: false, value: true } });
			await api('admin/roles/assign', { userId: author.id, roleId: searchRole.id }, alice);

			const searched = await api('notes/search', { query: uniqueText }, author);
			expect(searched.status).toBe(200);
			assert.ok(searched.body.some((n: any) => n.id === searchNoteId));
		});

		test('notes/search は内容の詳細条件で絞り込める', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hnsf${suffix}` });
			const query = `hono-search-filter-${suffix}`;
			const searchRole = await role(alice, {}, { canSearchNotes: { priority: 1, useDefault: false, value: true } });
			await api('admin/roles/assign', { userId: author.id, roleId: searchRole.id }, alice);

			const original = await post(author, { text: `${query} original` });
			const reply = await post(author, { text: `${query} reply`, replyId: original.id });
			const quote = await post(author, { text: `${query} quote`, renoteId: original.id });
			const cw = await post(author, { text: `${query} cw`, cw: '内容注意' });
			const followers = await post(author, { text: `${query} followers`, visibility: 'followers' });

			const regularUpload = await uploadFile(author);
			assert.ok(regularUpload.body != null);
			const regularFile = await post(author, { text: `${query} file`, fileIds: [regularUpload.body.id] });

			const sensitiveUpload = await uploadFile(author);
			assert.ok(sensitiveUpload.body != null);
			await updateDriveFileInDatabase(db, sensitiveUpload.body.id, { isSensitive: true });
			const sensitiveFile = await post(author, { text: `${query} sensitive`, fileIds: [sensitiveUpload.body.id] });

			const searchIds = async (params: Record<string, unknown>) => {
				const result = await api('notes/search', { query, limit: 100, ...params }, author);
				expect(result.status).toBe(200);
				return new Set(result.body.map((note) => note.id));
			};

			expect(await searchIds({ withReplies: true })).toStrictEqual(new Set([reply.id]));
			expect(await searchIds({ withQuotes: true })).toStrictEqual(new Set([quote.id]));
			expect(await searchIds({ withCw: true })).toStrictEqual(new Set([cw.id]));
			expect(await searchIds({ withFiles: true })).toStrictEqual(new Set([regularFile.id, sensitiveFile.id]));
			expect(await searchIds({ withSensitiveFiles: true })).toStrictEqual(new Set([sensitiveFile.id]));
			expect(await searchIds({ visibility: 'followers' })).toStrictEqual(new Set([followers.id]));

			const withoutFiles = await searchIds({ withFiles: false });
			expect(withoutFiles.has(regularFile.id)).toBe(false);
			expect(withoutFiles.has(sensitiveFile.id)).toBe(false);
			expect(withoutFiles.has(original.id)).toBe(true);
		});
	});

	describe('page-push', () => {
		test('page-push はNO_SUCH_PAGEとsecure保護を維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `hpp${suffix}` });
			const pusher = await signup({ username: `hppp${suffix}` });
			const page = await createPageInDatabase(db, {
				id: genId(),
				updatedAt: new Date(),
				title: `page-push ${suffix}`,
				name: `hpp-page-${suffix}`,
				summary: null,
				alignCenter: false,
				hideTitleWhenPinned: false,
				font: 'sans-serif',
				userId: owner.id,
				eyeCatchingImageId: null,
				content: [],
				variables: [],
				script: '',
				visibility: 'public',
			});

			const appToken = await createAppToken(pusher, ['write:account']);
			const secureDenied = await api('page-push', { pageId: page.id, event: 'ping' }, { token: appToken });
			expect(secureDenied.status).toBe(400);
			expect(castAsError(secureDenied.body as any).error.code).toBe('ACCESS_DENIED');

			const missing = await api('page-push', { pageId: genId(), event: 'ping' }, pusher);
			expect(missing.status).toBe(400);
			expect(castAsError(missing.body as any).error.code).toBe('NO_SUCH_PAGE');
			expect(castAsError(missing.body as any).error.id).toBe('4a13ad31-6729-46b4-b9af-e86b265c2e74');

			const pushed = await api('page-push', { pageId: page.id, event: 'ping', var: { hello: 'world' } }, pusher);
			expect(pushed.status).toBe(204);
		});
	});

	describe('notes/show', () => {
		test('投稿が取得できる', async () => {
			const myPost = await post(alice, {
				text: 'test',
			});

			const res = await api(
				'notes/show',
				{
					noteId: myPost.id,
				},
				alice,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
			expect(res.body.id).toBe(myPost.id);
			expect(res.body.text).toBe(myPost.text);
		});

		test('投稿が存在しなかったら怒る', async () => {
			const res = await api('notes/show', {
				noteId: '000000000000000000000000',
			});
			expect(res.status).toBe(400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('notes/show', {
				noteId: 'kyoppie',
			});
			expect(res.status).toBe(400);
		});
	});

	describe('notes/create', () => {
		test('テキストのみで投稿できる', async () => {
			const res = await api('notes/create', { text: 'hello hono' }, alice);
			expect(res.status).toBe(200);
			expect(res.body.createdNote.text).toBe('hello hono');
			expect(res.body.createdNote.userId).toBe(alice.id);
			expect(res.body.createdNote.visibility).toBe('public');
		});

		test('テキストもファイルもRenoteもPollも無いと怒られる', async () => {
			const res = await api('notes/create', {}, alice);
			expect(res.status).toBe(400);
		});

		test('返信を作成できる', async () => {
			const parent = await api('notes/create', { text: 'parent' }, alice);
			const res = await api('notes/create', { text: 'child', replyId: parent.body.createdNote.id }, bob);
			expect(res.status).toBe(200);
			expect(res.body.createdNote.replyId).toBe(parent.body.createdNote.id);

			const noSuchReply = await api('notes/create', { text: 'x', replyId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz' }, alice);
			expect(noSuchReply.status).toBe(400);
			expect(castAsError(noSuchReply.body as any).error.id).toBe('749ee0f6-d3da-459a-bf02-282e2da4292c');
		});

		test('Renoteを作成できる', async () => {
			const target = await api('notes/create', { text: 'to be renoted' }, alice);
			const res = await api('notes/create', { renoteId: target.body.createdNote.id }, bob);
			expect(res.status).toBe(200);
			expect(res.body.createdNote.renoteId).toBe(target.body.createdNote.id);

			const pureRenoteOfRenote = await api('notes/create', { renoteId: res.body.createdNote.id }, alice);
			expect(pureRenoteOfRenote.status).toBe(400);
			expect(castAsError(pureRenoteOfRenote.body as any).error.id).toBe('fd4cc33e-2a37-48dd-99cc-9b806eb2031a');

			const noSuchRenote = await api('notes/create', { renoteId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz' }, alice);
			expect(noSuchRenote.status).toBe(400);
			expect(castAsError(noSuchRenote.body as any).error.id).toBe('b5c90186-4ab0-49c8-9bba-a1f76c282ba4');
		});

		test('投票を作成できる', async () => {
			const res = await api(
				'notes/create',
				{
					text: 'poll time',
					poll: { choices: ['a', 'b'], multiple: false },
				},
				alice,
			);
			expect(res.status).toBe(200);
			expect(res.body.createdNote.poll!.choices.length).toBe(2);

			const expired = await api(
				'notes/create',
				{
					text: 'expired poll',
					poll: { choices: ['a', 'b'], expiresAt: Date.now() - 10000 },
				},
				alice,
			);
			expect(expired.status).toBe(400);
			expect(castAsError(expired.body as any).error.id).toBe('04da457d-b083-4055-9082-955525eda5a5');
		});

		test('visibility: specified で visibleUserIds を保存できる', async () => {
			const res = await api(
				'notes/create',
				{
					text: 'secret',
					visibility: 'specified',
					visibleUserIds: [bob.id],
				},
				alice,
			);
			expect(res.status).toBe(200);
			expect(res.body.createdNote.visibility).toBe('specified');
			expect(res.body.createdNote.visibleUserIds).toStrictEqual([bob.id]);
		});
	});

	describe('notes/delete', () => {
		test('自分の投稿を削除できる', async () => {
			const created = await api('notes/create', { text: 'to be deleted' }, alice);
			expect(created.status).toBe(200);

			const res = await api('notes/delete', { noteId: created.body.createdNote.id }, alice);
			expect(res.status).toBe(204);

			const shown = await api('notes/show', { noteId: created.body.createdNote.id }, alice);
			expect(shown.status).toBe(400);
		});

		test('他人の投稿は削除できない', async () => {
			const created = await api('notes/create', { text: 'not yours' }, alice);
			expect(created.status).toBe(200);

			const res = await api('notes/delete', { noteId: created.body.createdNote.id }, bob);
			expect(res.status).toBe(400);
			expect(castAsError(res.body as any).error.id).toBe('fe8d7103-0ea8-4ec3-814d-f8b401dc69e9');
		});

		test('存在しない投稿の削除で怒られる', async () => {
			const res = await api('notes/delete', { noteId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz' }, alice);
			expect(res.status).toBe(400);
			expect(castAsError(res.body as any).error.id).toBe('490be23f-8c1f-4796-819f-94cb4f9d1630');
		});
	});

	describe('notes/unrenote', () => {
		test('自分のRenoteを取り消せる', async () => {
			const target = await api('notes/create', { text: 'to be unrenoted' }, alice);
			expect(target.status).toBe(200);

			const renote = await api('notes/create', { renoteId: target.body.createdNote.id }, bob);
			expect(renote.status).toBe(200);

			const res = await api('notes/unrenote', { noteId: target.body.createdNote.id }, bob);
			expect(res.status).toBe(204);

			const shown = await api('notes/show', { noteId: renote.body.createdNote.id }, bob);
			expect(shown.status).toBe(400);
		});

		test('存在しない投稿のunrenoteで怒られる', async () => {
			const res = await api('notes/unrenote', { noteId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz' }, alice);
			expect(res.status).toBe(400);
			expect(castAsError(res.body as any).error.id).toBe('efd4a259-2442-496b-8dd7-b255aa1a160f');
		});
	});

	describe('notes/reactions/create', () => {
		test('リアクションできる', async () => {
			const bobPost = await post(bob, { text: 'hi' });

			const res = await api(
				'notes/reactions/create',
				{
					noteId: bobPost.id,
					reaction: '🚀',
				},
				alice,
			);

			expect(res.status).toBe(204);

			const resNote = await api(
				'notes/show',
				{
					noteId: bobPost.id,
				},
				alice,
			);

			expect(resNote.status).toBe(200);
			expect(resNote.body.reactions['🚀']).toBe(1);
		});

		test('自分の投稿にもリアクションできる', async () => {
			const myPost = await post(alice, { text: 'hi' });

			const res = await api(
				'notes/reactions/create',
				{
					noteId: myPost.id,
					reaction: '🚀',
				},
				alice,
			);

			expect(res.status).toBe(204);
		});

		test('二重にリアクションすると上書きされる', async () => {
			const bobPost = await post(bob, { text: 'hi' });

			await api(
				'notes/reactions/create',
				{
					noteId: bobPost.id,
					reaction: '🥰',
				},
				alice,
			);

			const res = await api(
				'notes/reactions/create',
				{
					noteId: bobPost.id,
					reaction: '🚀',
				},
				alice,
			);

			expect(res.status).toBe(204);

			const resNote = await api(
				'notes/show',
				{
					noteId: bobPost.id,
				},
				alice,
			);

			expect(resNote.status).toBe(200);
			expect(resNote.body.reactions).toStrictEqual({ '🚀': 1 });
		});

		test('同じリアクションを二重にすると怒られる', async () => {
			const bobPost = await post(bob, { text: 'hi' });

			const first = await api('notes/reactions/create', { noteId: bobPost.id, reaction: '🚀' }, alice);
			expect(first.status).toBe(204);

			const second = await api('notes/reactions/create', { noteId: bobPost.id, reaction: '🚀' }, alice);
			expect(second.status).toBe(400);
			expect(castAsError(second.body as any).error.id).toBe('71efcf98-86d6-4e2b-b2ad-9d032369366b');
		});

		test('ブロックされているとリアクションできない', async () => {
			const bobPost = await post(bob, { text: 'hi' });

			const block = await api('blocking/create', { userId: alice.id }, bob);
			expect(block.status).toBe(200);

			try {
				const res = await api('notes/reactions/create', { noteId: bobPost.id, reaction: '🚀' }, alice);
				expect(res.status).toBe(400);
				expect(castAsError(res.body as any).error.id).toBe('20ef5475-9f38-4e4c-bd33-de6d979498ec');
			} finally {
				await api('blocking/delete', { userId: alice.id }, bob);
			}
		});

		test('存在しない投稿にはリアクションできない', async () => {
			const res = await api(
				'notes/reactions/create',
				{
					noteId: '000000000000000000000000',
					reaction: '🚀',
				},
				alice,
			);

			expect(res.status).toBe(400);
		});

		test('リノートにリアクションできない', async () => {
			const bobNote = await post(bob, { text: 'hi' });
			const bobRenote = await post(bob, { renoteId: bobNote.id });

			const res = await api(
				'notes/reactions/create',
				{
					noteId: bobRenote.id,
					reaction: '🚀',
				},
				alice,
			);

			expect(res.status).toBe(400);
			assert.ok(res.body);
			expect(castAsError(res.body).error.code).toBe('CANNOT_REACT_TO_RENOTE');
		});

		test('引用にリアクションできる', async () => {
			const bobNote = await post(bob, { text: 'hi' });
			const bobRenote = await post(bob, { text: 'hi again', renoteId: bobNote.id });

			const res = await api(
				'notes/reactions/create',
				{
					noteId: bobRenote.id,
					reaction: '🚀',
				},
				alice,
			);

			expect(res.status).toBe(204);
		});

		test('空文字列のリアクションは\u2764にフォールバックされる', async () => {
			const bobNote = await post(bob, { text: 'hi' });

			const res = await api(
				'notes/reactions/create',
				{
					noteId: bobNote.id,
					reaction: '',
				},
				alice,
			);

			expect(res.status).toBe(204);

			const reaction = await api('notes/reactions', {
				noteId: bobNote.id,
			});

			expect(reaction.body.length).toBe(1);
			expect(getAt(reaction.body, 0).type).toBe('\u2764');
		});

		test('絵文字ではない文字列のリアクションは\u2764にフォールバックされる', async () => {
			const bobNote = await post(bob, { text: 'hi' });

			const res = await api(
				'notes/reactions/create',
				{
					noteId: bobNote.id,
					reaction: 'Hello!',
				},
				alice,
			);

			expect(res.status).toBe(204);

			const reaction = await api('notes/reactions', {
				noteId: bobNote.id,
			});

			expect(reaction.body.length).toBe(1);
			expect(getAt(reaction.body, 0).type).toBe('\u2764');
		});

		test('空のパラメータで怒られる', async () => {
			// @ts-expect-error param must not be empty
			const res = await api('notes/reactions/create', {}, alice);

			expect(res.status).toBe(400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api(
				'notes/reactions/create',
				{
					noteId: 'kyoppie',
					reaction: '🚀',
				},
				alice,
			);

			expect(res.status).toBe(400);
		});
	});

	describe('notes/reactions', () => {
		test('specified/followersノートの反応を匿名・非受信者へ返さない', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hnrv${suffix}` });
			const viewer = await signup({ username: `hnrvv${suffix}` });
			const notes = [
				await post(author, { text: 'specified reactions', visibility: 'specified', visibleUserIds: [author.id] }),
				await post(author, { text: 'followers reactions', visibility: 'followers' }),
			];

			for (const note of notes) {
				expect((await api('notes/reactions/create', { noteId: note.id, reaction: '👍' }, author)).status).toBe(204);
				for (const user of [undefined, viewer]) {
					const res = await api('notes/reactions', { noteId: note.id }, user);
					expect(res.status).toBe(400);
					expect(castAsError(res.body as any).error.code).toBe('NO_SUCH_NOTE');
					expect(castAsError(res.body as any).error.id).toBe('263fff3d-d0e1-4af4-bea7-8408059b451a');
				}
			}
		});
	});

	describe('notes/reactions/delete', () => {
		test('リアクションを取り消せる', async () => {
			const bobNote = await post(bob, { text: 'hi' });

			const created = await api('notes/reactions/create', { noteId: bobNote.id, reaction: '🚀' }, alice);
			expect(created.status).toBe(204);

			const res = await api('notes/reactions/delete', { noteId: bobNote.id }, alice);
			expect(res.status).toBe(204);

			const reactions = await api('notes/reactions', { noteId: bobNote.id });
			expect(reactions.body.length).toBe(0);
		});

		test('リアクションしていないと怒られる', async () => {
			const bobNote = await post(bob, { text: 'hi' });

			const res = await api('notes/reactions/delete', { noteId: bobNote.id }, alice);
			expect(res.status).toBe(400);
			expect(castAsError(res.body as any).error.id).toBe('92f4426d-4196-4125-aa5b-02943e2ec8fc');
		});

		test('存在しない投稿で怒られる', async () => {
			const res = await api('notes/reactions/delete', { noteId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz' }, alice);
			expect(res.status).toBe(400);
			expect(castAsError(res.body as any).error.id).toBe('764d9fce-f9f2-4a0e-92b1-6ceac9a7ad37');
		});
	});

	describe('notes/polls/vote', () => {
		test('投票できる', async () => {
			const created = await api(
				'notes/create',
				{
					text: 'poll',
					poll: { choices: ['a', 'b'], multiple: false },
				},
				bob,
			);
			expect(created.status).toBe(200);

			const res = await api('notes/polls/vote', { noteId: created.body.createdNote.id, choice: 0 }, alice);
			expect(res.status).toBe(204);

			const shown = await api('notes/show', { noteId: created.body.createdNote.id }, alice);
			expect(shown.status).toBe(200);
			expect(shown.body.poll!.choices[0]!.votes).toBe(1);
			expect(shown.body.poll!.choices[0]!.isVoted).toBe(true);
		});

		test('複数投票可能な場合は複数選べる', async () => {
			const created = await api(
				'notes/create',
				{
					text: 'multi poll',
					poll: { choices: ['a', 'b', 'c'], multiple: true },
				},
				bob,
			);
			expect(created.status).toBe(200);

			const first = await api('notes/polls/vote', { noteId: created.body.createdNote.id, choice: 0 }, alice);
			expect(first.status).toBe(204);
			const second = await api('notes/polls/vote', { noteId: created.body.createdNote.id, choice: 1 }, alice);
			expect(second.status).toBe(204);

			const dup = await api('notes/polls/vote', { noteId: created.body.createdNote.id, choice: 0 }, alice);
			expect(dup.status).toBe(400);
			expect(castAsError(dup.body as any).error.id).toBe('0963fc77-efac-419b-9424-b391608dc6d8');
		});

		test('複数投票不可の場合は二重投票できない', async () => {
			const created = await api(
				'notes/create',
				{
					text: 'single poll',
					poll: { choices: ['a', 'b'], multiple: false },
				},
				bob,
			);
			expect(created.status).toBe(200);

			const first = await api('notes/polls/vote', { noteId: created.body.createdNote.id, choice: 0 }, alice);
			expect(first.status).toBe(204);

			const second = await api('notes/polls/vote', { noteId: created.body.createdNote.id, choice: 1 }, alice);
			expect(second.status).toBe(400);
			expect(castAsError(second.body as any).error.id).toBe('0963fc77-efac-419b-9424-b391608dc6d8');
		});

		test('複数投票不可の場合は並行投票の一方だけ成功する', async () => {
			const created = await api(
				'notes/create',
				{
					text: 'concurrent single poll',
					poll: { choices: ['a', 'b'], multiple: false },
				},
				bob,
			);
			expect(created.status).toBe(200);
			const noteId = created.body.createdNote.id;

			const results = await Promise.all([
				api('notes/polls/vote', { noteId, choice: 0 }, alice),
				api('notes/polls/vote', { noteId, choice: 1 }, alice),
			]);
			expect(results.map((result) => result.status).sort()).toStrictEqual([204, 400]);

			const votes = await listPollVotesByNoteAndUserFromDatabase(db, noteId, alice.id);
			const poll = await fetchPollByNoteIdOrFailFromDatabase(db, noteId);
			expect(votes.length).toBe(1);
			expect(poll.votes.reduce((sum, count) => sum + count, 0)).toBe(1);
			expect(poll.votes[votes[0]!.choice]).toBe(1);
		});

		test('閲覧できないpollには投票できない', async () => {
			const created = await api(
				'notes/create',
				{
					text: 'private poll',
					visibility: 'specified',
					visibleUserIds: [bob.id],
					poll: { choices: ['a', 'b'], multiple: false },
				},
				bob,
			);
			expect(created.status).toBe(200);

			const res = await api('notes/polls/vote', { noteId: created.body.createdNote.id, choice: 0 }, alice);
			expect(res.status).toBe(400);
			expect(castAsError(res.body as any).error.code).toBe('NO_SUCH_NOTE');
		});

		test('無効な選択肢では怒られる', async () => {
			const created = await api(
				'notes/create',
				{
					text: 'poll for invalid choice',
					poll: { choices: ['a', 'b'], multiple: false },
				},
				bob,
			);
			expect(created.status).toBe(200);

			const res = await api('notes/polls/vote', { noteId: created.body.createdNote.id, choice: 5 }, alice);
			expect(res.status).toBe(400);
			expect(castAsError(res.body as any).error.id).toBe('e0cc9a04-f2e8-41e4-a5f1-4127293260cc');
		});

		test('投票が無い投稿には投票できない', async () => {
			const created = await api('notes/create', { text: 'no poll here' }, bob);
			expect(created.status).toBe(200);

			const res = await api('notes/polls/vote', { noteId: created.body.createdNote.id, choice: 0 }, alice);
			expect(res.status).toBe(400);
			expect(castAsError(res.body as any).error.id).toBe('5f979967-52d9-4314-a911-1c673727f92f');
		});

		test('期限切れの投票には投票できない', async () => {
			const created = await api(
				'notes/create',
				{
					text: 'expiring poll',
					poll: { choices: ['a', 'b'], multiple: false, expiredAfter: 100 },
				},
				bob,
			);
			expect(created.status).toBe(200);

			// 投票期限そのものが過ぎるのを待つ (状態の伝播待ちではないので固定で待つ)
			await new Promise((resolve) => setTimeout(resolve, 300));

			const res = await api('notes/polls/vote', { noteId: created.body.createdNote.id, choice: 0 }, alice);
			expect(res.status).toBe(400);
			expect(castAsError(res.body as any).error.id).toBe('1022a357-b085-4054-9083-8f8de358337e');
		});

		test('存在しない投稿には投票できない', async () => {
			const res = await api('notes/polls/vote', { noteId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz', choice: 0 }, alice);
			expect(res.status).toBe(400);
			expect(castAsError(res.body as any).error.id).toBe('ecafbd2e-c283-4d6d-aecb-1a0a33b75396');
		});

		test('ブロックされていると投票できない', async () => {
			const created = await api(
				'notes/create',
				{
					text: 'blocked poll',
					poll: { choices: ['a', 'b'], multiple: false },
				},
				bob,
			);
			expect(created.status).toBe(200);

			const block = await api('blocking/create', { userId: alice.id }, bob);
			expect(block.status).toBe(200);

			try {
				const res = await api('notes/polls/vote', { noteId: created.body.createdNote.id, choice: 0 }, alice);
				expect(res.status).toBe(400);
				expect(castAsError(res.body as any).error.id).toBe('85a5377e-b1e9-4617-b0b9-5bea73331e49');
			} finally {
				await api('blocking/delete', { userId: alice.id }, bob);
			}
		});
	});

	describe('following/create', () => {
		test('フォローできる', async () => {
			const res = await api(
				'following/create',
				{
					userId: alice.id,
				},
				bob,
			);

			expect(res.status).toBe(200);

			const newBob = await fetchUserByIdOrFailFromDatabase(db, bob.id);
			expect(newBob.followersCount).toBe(0);
			expect(newBob.followingCount).toBe(1);
			const newAlice = await fetchUserByIdOrFailFromDatabase(db, alice.id);
			expect(newAlice.followersCount).toBe(1);
			expect(newAlice.followingCount).toBe(0);
		});

		test('既にフォローしている場合は怒る', async () => {
			const res = await api(
				'following/create',
				{
					userId: alice.id,
				},
				bob,
			);

			expect(res.status).toBe(400);
		});

		test('存在しないユーザーはフォローできない', async () => {
			const res = await api(
				'following/create',
				{
					userId: '000000000000000000000000',
				},
				alice,
			);

			expect(res.status).toBe(400);
		});

		test('自分自身はフォローできない', async () => {
			const res = await api(
				'following/create',
				{
					userId: alice.id,
				},
				alice,
			);

			expect(res.status).toBe(400);
		});

		test('空のパラメータで怒られる', async () => {
			// @ts-expect-error params must not be empty
			const res = await api('following/create', {}, alice);

			expect(res.status).toBe(400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api(
				'following/create',
				{
					userId: 'foo',
				},
				alice,
			);

			expect(res.status).toBe(400);
		});
	});

	describe('following/delete', () => {
		test('フォロー解除できる', async () => {
			await api(
				'following/create',
				{
					userId: alice.id,
				},
				bob,
			);

			const res = await api(
				'following/delete',
				{
					userId: alice.id,
				},
				bob,
			);

			expect(res.status).toBe(200);

			const newBob = await fetchUserByIdOrFailFromDatabase(db, bob.id);
			expect(newBob.followersCount).toBe(0);
			expect(newBob.followingCount).toBe(0);
			const newAlice = await fetchUserByIdOrFailFromDatabase(db, alice.id);
			expect(newAlice.followersCount).toBe(0);
			expect(newAlice.followingCount).toBe(0);
		});

		test('フォローしていない場合は怒る', async () => {
			const res = await api(
				'following/delete',
				{
					userId: alice.id,
				},
				bob,
			);

			expect(res.status).toBe(400);
		});

		test('存在しないユーザーはフォロー解除できない', async () => {
			const res = await api(
				'following/delete',
				{
					userId: '000000000000000000000000',
				},
				alice,
			);

			expect(res.status).toBe(400);
		});

		test('自分自身はフォロー解除できない', async () => {
			const res = await api(
				'following/delete',
				{
					userId: alice.id,
				},
				alice,
			);

			expect(res.status).toBe(400);
		});

		test('空のパラメータで怒られる', async () => {
			// @ts-expect-error params must not be empty
			const res = await api('following/delete', {}, alice);

			expect(res.status).toBe(400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api(
				'following/delete',
				{
					userId: 'kyoppie',
				},
				alice,
			);

			expect(res.status).toBe(400);
		});
	});

	describe('notes/replies', () => {
		test('自分に閲覧権限のない投稿は含まれない', async () => {
			const alicePost = await post(alice, {
				text: 'foo',
			});

			await post(bob, {
				replyId: alicePost.id,
				text: 'bar',
				visibility: 'specified',
				visibleUserIds: [alice.id],
			});

			const res = await api(
				'notes/replies',
				{
					noteId: alicePost.id,
				},
				carol,
			);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(0);
		});
	});

	describe('notes/timeline', () => {
		test('フォロワー限定投稿が含まれる', async () => {
			await api(
				'following/create',
				{
					userId: carol.id,
				},
				dave,
			);

			const carolPost = await post(carol, {
				text: 'foo',
				visibility: 'followers',
			});

			const res = await api('notes/timeline', {}, dave);

			expect(res.status).toBe(200);
			expect(Array.isArray(res.body)).toBe(true);
			expect(res.body.length).toBe(1);
			expect(getAt(res.body, 0).id).toBe(carolPost.id);
		});
	});
});
