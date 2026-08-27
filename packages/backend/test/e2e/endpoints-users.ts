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
	let postScheduledNoteQueue: Bull.Queue<PostScheduledNoteJobData> | undefined;
	let context: EndpointsContext;

	beforeAll(
		async () => {
			context = await createEndpointsContext();
			({ alice, bob, carol, dave, db, postScheduledNoteQueue } = context);
		},
		1000 * 60 * 2,
	);

	afterAll(async () => {
		await context.close();
	});

	describe('account data endpoints', () => {
		test('drive/files/check-existence returns ownership-scoped md5 existence', async () => {
			const config = fixtureConfig;
			const md5 = createHash('md5').update(`hono-drive-${Date.now()}`).digest('hex');
			await createDriveFileInDatabase(db, {
				id: genId(),
				userId: alice.id,
				userHost: null,
				md5,
				name: 'hono-drive-check.txt',
				type: 'text/plain',
				size: 11,
				storedInternal: true,
				url: `${origin}/files/${md5}`,
			});

			const exists = await api('drive/files/check-existence', { md5 }, alice);
			expect(exists.status).toBe(200);
			expect(exists.body).toBe(true);

			const otherUser = await api('drive/files/check-existence', { md5 }, bob);
			expect(otherUser.status).toBe(200);
			expect(otherUser.body).toBe(false);

			const missing = await api('drive/files/check-existence', { md5: '0'.repeat(32) }, alice);
			expect(missing.status).toBe(200);
			expect(missing.body).toBe(false);
		});

		test('drive/folders list, find, and show preserve ownership and detail fields', async () => {
			const config = fixtureConfig;
			const stamp = Date.now().toString(36);
			const parent = await createDriveFolderInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `hono-parent-${stamp}`,
				parentId: null,
			});
			const child = await createDriveFolderInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `hono-child-${stamp}`,
				parentId: parent.id,
			});
			const rootChildName = await createDriveFolderInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `hono-child-${stamp}`,
				parentId: null,
			});
			const otherUserFolder = await createDriveFolderInDatabase(db, {
				id: genId(),
				userId: bob.id,
				name: `hono-child-${stamp}`,
				parentId: null,
			});
			await createDriveFileInDatabase(db, {
				id: genId(),
				userId: alice.id,
				userHost: null,
				md5: createHash('md5').update(`hono-drive-folder-${stamp}`).digest('hex'),
				name: 'hono-drive-folder.txt',
				type: 'text/plain',
				size: 11,
				storedInternal: true,
				url: `${origin}/files/hono-drive-folder-${stamp}`,
				folderId: parent.id,
			});

			const rootList = await api('drive/folders', { folderId: null }, alice);
			expect(rootList.status).toBe(200);
			expect((rootList.body as any[]).some((item) => item.id === parent.id)).toBe(true);
			expect((rootList.body as any[]).some((item) => item.id === rootChildName.id)).toBe(true);
			expect((rootList.body as any[]).some((item) => item.id === otherUserFolder.id)).toBe(false);

			const childList = await api('drive/folders', { folderId: parent.id }, alice);
			expect(childList.status).toBe(200);
			expect((childList.body as any[]).map((item) => item.id)).toStrictEqual([child.id]);

			const childFind = await api(
				'drive/folders/find',
				{
					name: child.name,
					parentId: parent.id,
				},
				alice,
			);
			expect(childFind.status).toBe(200);
			expect((childFind.body as any[]).map((item) => item.id)).toStrictEqual([child.id]);

			const rootFind = await api(
				'drive/folders/find',
				{
					name: child.name,
					parentId: null,
				},
				alice,
			);
			expect(rootFind.status).toBe(200);
			expect((rootFind.body as any[]).some((item) => item.id === rootChildName.id)).toBe(true);
			expect((rootFind.body as any[]).some((item) => item.id === child.id)).toBe(false);
			expect((rootFind.body as any[]).some((item) => item.id === otherUserFolder.id)).toBe(false);

			const showParent = await api('drive/folders/show', { folderId: parent.id }, alice);
			expect(showParent.status).toBe(200);
			const shownParent = showParent.body as any;
			expect(shownParent.id).toBe(parent.id);
			expect(shownParent.parentId).toBe(null);
			expect(shownParent.foldersCount).toBe(1);
			expect(shownParent.filesCount).toBe(1);
			expect(typeof shownParent.createdAt).toBe('string');

			const showChild = await api('drive/folders/show', { folderId: child.id }, alice);
			expect(showChild.status).toBe(200);
			const shownChild = showChild.body as any;
			expect(shownChild.id).toBe(child.id);
			assert.ok(shownChild.parent);
			expect(shownChild.parent.id).toBe(parent.id);

			const otherUserShow = await api('drive/folders/show', { folderId: parent.id }, bob);
			expect(otherUserShow.status).toBe(400);
			expect(castAsError(otherUserShow.body as any).error.id).toBe('d74ab9eb-bb09-4bba-bf24-fb58f761e1e9');
		});

		test('notes/drafts/count returns the caller draft count and rejects moved users', async () => {
			const config = fixtureConfig;
			const before = await api('notes/drafts/count', {}, alice);
			expect(before.status).toBe(200);

			await createNoteDraftInDatabase(db, {
				id: genId(),
				userId: alice.id,
				text: 'hono draft 1',
				visibility: 'public',
				pollMultiple: false,
			});
			await createNoteDraftInDatabase(db, {
				id: genId(),
				userId: alice.id,
				text: 'hono draft 2',
				visibility: 'home',
				pollMultiple: false,
			});
			await createNoteDraftInDatabase(db, {
				id: genId(),
				userId: bob.id,
				text: 'other user draft',
				visibility: 'public',
				pollMultiple: false,
			});

			const after = await api('notes/drafts/count', {}, alice);
			expect(after.status).toBe(200);
			expect(after.body).toBe((before.body as number) + 2);

			const movedUser = await signup({ username: `mvdraft${Date.now().toString(36)}` });
			await updateUserInDatabase(db, movedUser.id, {
				movedToUri: `${origin}/users/${alice.id}`,
			});

			const denied = await api('notes/drafts/count', {}, movedUser);
			expect(denied.status).toBe(403);
			expect(castAsError(denied.body as any).error.code).toBe('YOUR_ACCOUNT_MOVED');
			expect(castAsError(denied.body as any).error.id).toBe('56f20ec9-fd06-4fa5-841b-edd6d7d4fa31');
		});

		test('notes/drafts/create creates a draft with reply/renote/poll/channel and schedules it', async () => {
			const config = fixtureConfig;
			const channel = await createChannelInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: 'draft channel',
			});
			const replyTarget = await post(alice, { text: 'reply target' });
			const renoteTarget = await post(alice, { text: 'renote target' });
			const file = await uploadFile(alice);

			const futureScheduledAt = Date.now() + 1000 * 60 * 60;
			const created = await api(
				'notes/drafts/create',
				{
					text: 'hono draft create',
					replyId: replyTarget.id,
					renoteId: renoteTarget.id,
					channelId: channel.id,
					fileIds: [file.body!.id],
					poll: { choices: ['a', 'b'], multiple: false },
					isActuallyScheduled: true,
					scheduledAt: futureScheduledAt,
				},
				alice,
			);

			expect(created.status).toBe(200);
			const createdDraft = (created.body as any).createdDraft;
			expect(createdDraft.text).toBe('hono draft create');
			expect(createdDraft.userId).toBe(alice.id);
			expect(createdDraft.replyId).toBe(replyTarget.id);
			expect(createdDraft.reply.id).toBe(replyTarget.id);
			expect(createdDraft.renoteId).toBe(renoteTarget.id);
			expect(createdDraft.renote.id).toBe(renoteTarget.id);
			expect(createdDraft.channelId).toBe(channel.id);
			expect(createdDraft.channel.id).toBe(channel.id);
			expect(createdDraft.fileIds).toStrictEqual([file.body!.id]);
			expect(createdDraft.files[0].id).toBe(file.body!.id);
			expect(createdDraft.poll.choices).toStrictEqual(['a', 'b']);
			expect(createdDraft.isActuallyScheduled).toBe(true);
			expect(createdDraft.scheduledAt).toBe(futureScheduledAt);

			const jobs = await postScheduledNoteQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
			expect(jobs.some((job) => job.data.noteDraftId === createdDraft.id)).toBe(true);

			// scheduledNoteLimit (デフォルト1) を後続テストで消費しないよう後片付け
			const cleanup = await api('notes/drafts/delete', { draftId: createdDraft.id }, alice);
			expect(cleanup.status).toBe(204);
		});

		test('notes/drafts/create validates scheduling and referenced entities', async () => {
			const noSuchId = 'zzzzzzzzzzzzzzzzzzzzzzzzzz';

			const scheduledAtRequired = await api(
				'notes/drafts/create',
				{
					isActuallyScheduled: true,
				},
				alice,
			);
			expect(scheduledAtRequired.status).toBe(400);
			expect(castAsError(scheduledAtRequired.body as any).error.id).toBe('15e28a55-e74c-4d65-89b7-8880cdaaa87d');

			const scheduledAtPast = await api(
				'notes/drafts/create',
				{
					isActuallyScheduled: true,
					scheduledAt: Date.now() - 1000 * 60,
				},
				alice,
			);
			expect(scheduledAtPast.status).toBe(400);
			expect(castAsError(scheduledAtPast.body as any).error.id).toBe('e4bed6c9-017e-4934-aed0-01c22cc60ec1');

			const noSuchFile = await api(
				'notes/drafts/create',
				{
					fileIds: [noSuchId],
				},
				alice,
			);
			expect(noSuchFile.status).toBe(400);
			expect(castAsError(noSuchFile.body as any).error.id).toBe('b6992544-63e7-67f0-fa7f-32444b1b5306');

			const noSuchRenoteTarget = await api(
				'notes/drafts/create',
				{
					renoteId: noSuchId,
				},
				alice,
			);
			expect(noSuchRenoteTarget.status).toBe(400);
			expect(castAsError(noSuchRenoteTarget.body as any).error.id).toBe('b5c90186-4ab0-49c8-9bba-a1f76c282ba4');

			const original = await post(alice, { text: 'pure renote source' });
			const pureRenote = await post(alice, { renoteId: original.id });
			const cannotReRenote = await api(
				'notes/drafts/create',
				{
					renoteId: pureRenote.id,
				},
				alice,
			);
			expect(cannotReRenote.status).toBe(400);
			expect(castAsError(cannotReRenote.body as any).error.id).toBe('fd4cc33e-2a37-48dd-99cc-9b806eb2031a');

			const noSuchReplyTarget = await api(
				'notes/drafts/create',
				{
					replyId: noSuchId,
				},
				alice,
			);
			expect(noSuchReplyTarget.status).toBe(400);
			expect(castAsError(noSuchReplyTarget.body as any).error.id).toBe('749ee0f6-d3da-459a-bf02-282e2da4292c');

			const noSuchChannel = await api(
				'notes/drafts/create',
				{
					channelId: noSuchId,
				},
				alice,
			);
			expect(noSuchChannel.status).toBe(400);
			expect(castAsError(noSuchChannel.body as any).error.id).toBe('b1653923-5453-4edc-b786-7c4f39bb0bbb');
		});

		test('notes/drafts/update updates a draft, reschedules it, and rejects foreign or missing drafts', async () => {
			const config = fixtureConfig;
			const draft = await createNoteDraftInDatabase(db, {
				id: genId(),
				userId: alice.id,
				text: 'before update',
				visibility: 'public',
				pollMultiple: false,
			});

			const futureScheduledAt = Date.now() + 1000 * 60 * 60;
			const updated = await api(
				'notes/drafts/update',
				{
					draftId: draft.id,
					text: 'after update',
					isActuallyScheduled: true,
					scheduledAt: futureScheduledAt,
				},
				alice,
			);
			expect(updated.status).toBe(200);
			const updatedDraft = (updated.body as any).updatedDraft;
			expect(updatedDraft.id).toBe(draft.id);
			expect(updatedDraft.text).toBe('after update');
			expect(updatedDraft.isActuallyScheduled).toBe(true);
			expect(updatedDraft.scheduledAt).toBe(futureScheduledAt);

			const jobs = await postScheduledNoteQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
			expect(jobs.some((job) => job.data.noteDraftId === draft.id)).toBe(true);

			const updatedWithoutSchedule = await api(
				'notes/drafts/update',
				{
					draftId: draft.id,
					text: 'schedule omitted on update',
				},
				alice,
			);
			expect(updatedWithoutSchedule.status).toBe(200);
			expect((updatedWithoutSchedule.body as any).updatedDraft.scheduledAt).toBe(futureScheduledAt);
			expect((updatedWithoutSchedule.body as any).updatedDraft.isActuallyScheduled).toBe(true);

			const jobsAfterUpdate = await postScheduledNoteQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
			expect(jobsAfterUpdate.some((job) => job.data.noteDraftId === draft.id)).toBe(true);

			const original = await post(alice, { text: 'update pure renote source' });
			const pureRenote = await post(alice, { renoteId: original.id });
			const cannotRenote = await api(
				'notes/drafts/update',
				{
					draftId: draft.id,
					renoteId: pureRenote.id,
				},
				alice,
			);
			expect(cannotRenote.status).toBe(400);
			expect(castAsError(cannotRenote.body as any).error.id).toBe('76cc5583-5a14-4ad3-8717-0298507e32db');
			expect(castAsError(cannotRenote.body as any).error.code).toBe('CANNOT_RENOTE');

			const specifiedReplyTarget = await post(alice, {
				text: 'specified reply target',
				visibility: 'specified',
				visibleUserIds: [alice.id],
			});
			const extendedVisibilityReply = await api(
				'notes/drafts/update',
				{
					draftId: draft.id,
					replyId: specifiedReplyTarget.id,
					visibility: 'public',
				},
				alice,
			);
			expect(extendedVisibilityReply.status).toBe(400);
			expect(castAsError(extendedVisibilityReply.body as any).error.id).toBe('215dbc76-336c-4d2a-9605-95766ba7dab0');
			expect(castAsError(extendedVisibilityReply.body as any).error.code).toBe(
				'CANNOT_REPLY_TO_SPECIFIED_VISIBILITY_NOTE_WITH_EXTENDED_VISIBILITY',
			);

			const foreignDraft = await createNoteDraftInDatabase(db, {
				id: genId(),
				userId: bob.id,
				text: 'bob draft',
				visibility: 'public',
				pollMultiple: false,
			});
			const foreignUpdate = await api(
				'notes/drafts/update',
				{
					draftId: foreignDraft.id,
					text: 'hijack attempt',
				},
				alice,
			);
			expect(foreignUpdate.status).toBe(400);
			expect(castAsError(foreignUpdate.body as any).error.id).toBe('49cd6b9d-848e-41ee-b0b9-adaca711a6b1');

			const missingUpdate = await api(
				'notes/drafts/update',
				{
					draftId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz',
					text: 'missing',
				},
				alice,
			);
			expect(missingUpdate.status).toBe(400);
			expect(castAsError(missingUpdate.body as any).error.id).toBe('49cd6b9d-848e-41ee-b0b9-adaca711a6b1');
		});

		test('notes/drafts/delete removes a draft and its schedule, rejecting missing drafts', async () => {
			const config = fixtureConfig;
			const futureScheduledAt = Date.now() + 1000 * 60 * 60;
			const draft = await createNoteDraftInDatabase(db, {
				id: genId(),
				userId: alice.id,
				text: 'to be deleted',
				visibility: 'public',
				pollMultiple: false,
				isActuallyScheduled: true,
				scheduledAt: new Date(futureScheduledAt),
			});
			await postScheduledNoteQueue!.add(
				draft.id,
				{ noteDraftId: draft.id, scheduledAt: futureScheduledAt },
				{
					delay: 1000 * 60 * 60,
					jobId: `scheduled-${draft.id}-${futureScheduledAt}`,
				},
			);

			const deleted = await api('notes/drafts/delete', { draftId: draft.id }, alice);
			expect(deleted.status).toBe(204);

			const afterDelete = await fetchNoteDraftByIdFromDatabase(db, draft.id);
			expect(afterDelete).toBe(null);

			const jobs = await postScheduledNoteQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
			expect(jobs.some((job) => job.data.noteDraftId === draft.id)).toBe(false);

			const missingDelete = await api('notes/drafts/delete', { draftId: draft.id }, alice);
			expect(missingDelete.status).toBe(400);
			expect(castAsError(missingDelete.body as any).error.id).toBe('49cd6b9d-848e-41ee-b0b9-adaca711a6b1');
		});

		test('notes/drafts/list paginates and filters by scheduled state', async () => {
			const config = fixtureConfig;
			const scheduledDraft = await createNoteDraftInDatabase(db, {
				id: genId(),
				userId: alice.id,
				text: 'list scheduled draft',
				visibility: 'public',
				pollMultiple: false,
				isActuallyScheduled: true,
				scheduledAt: new Date(Date.now() + 1000 * 60 * 60),
			});
			const plainDraft = await createNoteDraftInDatabase(db, {
				id: genId(),
				userId: alice.id,
				text: 'list plain draft',
				visibility: 'public',
				pollMultiple: false,
			});

			const scheduledOnly = await api('notes/drafts/list', { scheduled: true }, alice);
			expect(scheduledOnly.status).toBe(200);
			const scheduledIds = (scheduledOnly.body as any[]).map((d) => d.id);
			expect(scheduledIds.includes(scheduledDraft.id)).toBe(true);
			expect(scheduledIds.includes(plainDraft.id)).toBe(false);

			const unscheduledOnly = await api('notes/drafts/list', { scheduled: false }, alice);
			expect(unscheduledOnly.status).toBe(200);
			const unscheduledIds = (unscheduledOnly.body as any[]).map((d) => d.id);
			expect(unscheduledIds.includes(plainDraft.id)).toBe(true);
			expect(unscheduledIds.includes(scheduledDraft.id)).toBe(false);

			const limited = await api('notes/drafts/list', { limit: 1, untilId: plainDraft.id }, alice);
			expect(limited.status).toBe(200);
			expect((limited.body as any[]).length).toBe(1);
		});

		test('charts/notes returns a chart shaped array of the requested length', async () => {
			const res = await api('charts/notes', { span: 'day', limit: 5 });
			expect(res.status).toBe(200);
			const body = res.body as { local: { total: number[] }; remote: { total: number[] } };
			expect(body.local.total.length).toBe(5);
			expect(body.remote.total.length).toBe(5);
			expect(body.local.total.every((v) => typeof v === 'number')).toBe(true);
		});

		test('charts/notes via GET sets a public cache-control header for anonymous requests', async () => {
			const res = await relativeFetch('api/charts/notes?span=hour&limit=3');
			expect(res.status).toBe(200);
			expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
			const body = (await res.json()) as { local: { total: number[] } };
			expect(body.local.total.length).toBe(3);
		});

		test('charts/instance groups results by the given host', async () => {
			const config = fixtureConfig;
			const host = `chart-${Date.now().toString(36)}.example.com`;
			await createInstanceInDatabase(db, {
				id: genId(),
				host,
				firstRetrievedAt: new Date(),
			});

			const res = await api('charts/instance', { span: 'day', limit: 5, host });
			expect(res.status).toBe(200);
			const body = res.body as { notes: { total: number[] } };
			expect(body.notes.total.length).toBe(5);
		});

		test('charts/user/notes returns a per-user chart scoped to the given userId', async () => {
			const res = await api('charts/user/notes', { span: 'day', limit: 5, userId: alice.id });
			expect(res.status).toBe(200);
			const body = res.body as { total: number[] };
			expect(body.total.length).toBe(5);
		});

		test('charts/user/drive returns a per-user drive chart scoped to the given userId', async () => {
			const res = await api('charts/user/drive', { span: 'day', limit: 5, userId: alice.id });
			expect(res.status).toBe(200);
			const body = res.body as { totalCount: number[]; totalSize: number[] };
			expect(body.totalCount.length).toBe(5);
			expect(body.totalSize.length).toBe(5);
		});

		test('antennas/create creates an antenna, rejects empty keywords, and validates the user list', async () => {
			const suffix = Date.now().toString(36);

			const created = await api(
				'antennas/create',
				{
					name: `antenna-${suffix}`,
					src: 'home',
					keywords: [['hello']],
					excludeKeywords: [[]],
					users: [],
					caseSensitive: false,
					withReplies: false,
					withFile: false,
				},
				alice,
			);
			expect(created.status).toBe(200);
			expect(created.body.name).toBe(`antenna-${suffix}`);
			expect(created.body.src).toBe('home');
			expect(created.body.isActive).toBe(true);

			const empty = await api(
				'antennas/create',
				{
					name: `antenna-empty-${suffix}`,
					src: 'home',
					keywords: [['']],
					excludeKeywords: [['']],
					users: [],
					caseSensitive: false,
					withReplies: false,
					withFile: false,
				},
				alice,
			);
			expect(empty.status).toBe(400);
			expect(castAsError(empty.body as any).error.id).toBe('53ee222e-1ddd-4f9a-92e5-9fb82ddb463a');

			const noSuchList = await api(
				'antennas/create',
				{
					name: `antenna-nolist-${suffix}`,
					src: 'list',
					userListId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz',
					keywords: [['hello']],
					excludeKeywords: [[]],
					users: [],
					caseSensitive: false,
					withReplies: false,
					withFile: false,
				},
				alice,
			);
			expect(noSuchList.status).toBe(400);
			expect(castAsError(noSuchList.body as any).error.id).toBe('95063e93-a283-4b8b-9aa5-bcdb8df69a7f');

			const config = fixtureConfig;
			const userList = await createUserListInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `antenna-list-${suffix}`,
			});
			const withList = await api(
				'antennas/create',
				{
					name: `antenna-list-src-${suffix}`,
					src: 'list',
					userListId: userList.id,
					keywords: [['hello']],
					excludeKeywords: [[]],
					users: [],
					caseSensitive: false,
					withReplies: false,
					withFile: false,
				},
				alice,
			);
			expect(withList.status).toBe(200);
			expect(withList.body.userListId).toBe(userList.id);
		});

		test('antennas/update updates an antenna and rejects foreign or missing antennas', async () => {
			const suffix = Date.now().toString(36);
			const created = await api(
				'antennas/create',
				{
					name: `antenna-upd-${suffix}`,
					src: 'home',
					keywords: [['before']],
					excludeKeywords: [[]],
					users: [],
					caseSensitive: false,
					withReplies: false,
					withFile: false,
				},
				alice,
			);
			expect(created.status).toBe(200);

			const updated = await api(
				'antennas/update',
				{
					antennaId: created.body.id,
					name: `antenna-upd-renamed-${suffix}`,
				},
				alice,
			);
			expect(updated.status).toBe(200);
			expect(updated.body.name).toBe(`antenna-upd-renamed-${suffix}`);

			const emptyKeywordUpdate = await api(
				'antennas/update',
				{
					antennaId: created.body.id,
					keywords: [['']],
					excludeKeywords: [['']],
				},
				alice,
			);
			expect(emptyKeywordUpdate.status).toBe(400);
			expect(castAsError(emptyKeywordUpdate.body as any).error.id).toBe('721aaff6-4e1b-4d88-8de6-877fae9f68c4');

			const foreignUpdate = await api(
				'antennas/update',
				{
					antennaId: created.body.id,
					name: 'hijack',
				},
				bob,
			);
			expect(foreignUpdate.status).toBe(400);
			expect(castAsError(foreignUpdate.body as any).error.id).toBe('10c673ac-8852-48eb-aa1f-f5b67f069290');

			const missingUpdate = await api(
				'antennas/update',
				{
					antennaId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz',
					name: 'missing',
				},
				alice,
			);
			expect(missingUpdate.status).toBe(400);
			expect(castAsError(missingUpdate.body as any).error.id).toBe('10c673ac-8852-48eb-aa1f-f5b67f069290');
		});

		test('antennas/show and antennas/list scope antennas to the caller', async () => {
			const suffix = Date.now().toString(36);
			const created = await api(
				'antennas/create',
				{
					name: `antenna-show-${suffix}`,
					src: 'home',
					keywords: [['x']],
					excludeKeywords: [[]],
					users: [],
					caseSensitive: false,
					withReplies: false,
					withFile: false,
				},
				alice,
			);
			expect(created.status).toBe(200);

			const shown = await api('antennas/show', { antennaId: created.body.id }, alice);
			expect(shown.status).toBe(200);
			expect(shown.body.id).toBe(created.body.id);

			const shownByBob = await api('antennas/show', { antennaId: created.body.id }, bob);
			expect(shownByBob.status).toBe(400);
			expect(castAsError(shownByBob.body as any).error.id).toBe('c06569fb-b025-4f23-b22d-1fcd20d2816b');

			const list = await api('antennas/list', {}, alice);
			expect(list.status).toBe(200);
			expect((list.body as any[]).some((a) => a.id === created.body.id)).toBe(true);
		});

		test('antennas/delete removes an antenna, rejecting foreign or missing antennas', async () => {
			const suffix = Date.now().toString(36);
			const created = await api(
				'antennas/create',
				{
					name: `antenna-del-${suffix}`,
					src: 'home',
					keywords: [['x']],
					excludeKeywords: [[]],
					users: [],
					caseSensitive: false,
					withReplies: false,
					withFile: false,
				},
				alice,
			);
			expect(created.status).toBe(200);

			const foreignDelete = await api('antennas/delete', { antennaId: created.body.id }, bob);
			expect(foreignDelete.status).toBe(400);
			expect(castAsError(foreignDelete.body as any).error.id).toBe('b34dcf9d-348f-44bb-99d0-6c9314cfe2df');

			const deleted = await api('antennas/delete', { antennaId: created.body.id }, alice);
			expect(deleted.status).toBe(204);

			const missingDelete = await api('antennas/delete', { antennaId: created.body.id }, alice);
			expect(missingDelete.status).toBe(400);
			expect(castAsError(missingDelete.body as any).error.id).toBe('b34dcf9d-348f-44bb-99d0-6c9314cfe2df');
		});

		test('antennas/notes returns fanout-timeline notes and antennas/remove-note removes one', async () => {
			const config = fixtureConfig;
			const created = await api(
				'antennas/create',
				{
					name: `antenna-notes-${Date.now().toString(36)}`,
					src: 'home',
					keywords: [['x']],
					excludeKeywords: [[]],
					users: [],
					caseSensitive: false,
					withReplies: false,
					withFile: false,
				},
				alice,
			);
			expect(created.status).toBe(200);
			const antennaId = created.body.id;

			const noteId = genId();
			await createNoteInDatabase(db, {
				id: noteId,
				userId: alice.id,
				text: 'antenna timeline note',
				visibility: 'public',
			});

			const redis = createRedisClient(config);
			try {
				await redis.lpush(`list:antennaTimeline:${antennaId}`, noteId);

				const notes = await api('antennas/notes', { antennaId, limit: 10 }, alice);
				expect(notes.status).toBe(200);
				expect((notes.body as any[]).some((n) => n.id === noteId)).toBe(true);

				const removed = await api('antennas/remove-note', { antennaId, noteId }, alice);
				expect(removed.status).toBe(204);

				const remaining = await redis.lrange(`list:antennaTimeline:${antennaId}`, 0, -1);
				expect(remaining.includes(noteId)).toBe(false);

				const missingAntenna = await api(
					'antennas/remove-note',
					{ antennaId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz', noteId },
					alice,
				);
				expect(missingAntenna.status).toBe(400);
				expect(castAsError(missingAntenna.body as any).error.id).toBe('850926e0-fd3b-49b6-b69a-b28a5dbd82fe');
			} finally {
				await redis.del(`list:antennaTimeline:${antennaId}`);
				await closeRedisConnection(redis);
			}
		});

		test('i/2fa/register and i/2fa/done enable TOTP two-factor authentication', async () => {
			const user = await signup({ username: `twofa${Date.now().toString(36)}` });

			const wrongPassword = await api('i/2fa/register', { password: 'wrong' }, user);
			expect(wrongPassword.status).toBe(400);
			expect(castAsError(wrongPassword.body as any).error.id).toBe('78d6c839-20c9-4c66-b90a-fc0542168b48');

			const registered = await api('i/2fa/register', { password: 'test' }, user);
			expect(registered.status).toBe(200);
			expect(typeof registered.body.secret).toBe('string');
			expect(typeof registered.body.qr).toBe('string');

			// テスト環境では MISSKEY_TEST_CHECK_DUPLICATED_TOTP 未設定時に任意の TOTP トークンが受理される。
			const done = await api('i/2fa/done', { token: '000000' }, user);
			expect(done.status).toBe(200);
			expect((done.body as any).backupCodes.length).toBe(5);

			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, user.id);
			expect(profile.twoFactorEnabled).toBe(true);

			const unregistered = await api('i/2fa/unregister', { password: 'test', token: '000000' }, user);
			expect(unregistered.status).toBe(204);

			const afterUnregister = await fetchUserProfileByUserIdOrFailFromDatabase(db, user.id);
			expect(afterUnregister.twoFactorEnabled).toBe(false);
		});

		test('i/2fa/register-key requires two-factor authentication to already be enabled', async () => {
			const user = await signup({ username: `twofakey${Date.now().toString(36)}` });

			const notEnabled = await api('i/2fa/register-key', { password: 'test' }, user);
			expect(notEnabled.status).toBe(400);
			expect(castAsError(notEnabled.body as any).error.id).toBe('bf32b864-449b-47b8-974e-f9a5468546f1');

			const wrongPassword = await api('i/2fa/register-key', { password: 'wrong' }, user);
			expect(wrongPassword.status).toBe(400);
			expect(castAsError(wrongPassword.body as any).error.id).toBe('38769596-efe2-4faf-9bec-abbb3f2cd9ba');
		});

		test('i/2fa/key-done requires a matching password and two-factor authentication to already be enabled', async () => {
			const user = await signup({ username: `twofakeydone${Date.now().toString(36)}` });

			const wrongPassword = await api(
				'i/2fa/key-done',
				{ password: 'wrong', name: 'my key', credential: {} as never },
				user,
			);
			expect(wrongPassword.status).toBe(400);
			expect(castAsError(wrongPassword.body as any).error.id).toBe('0d7ec6d2-e652-443e-a7bf-9ee9a0cd77b0');

			const notEnabled = await api(
				'i/2fa/key-done',
				{ password: 'test', name: 'my key', credential: {} as never },
				user,
			);
			expect(notEnabled.status).toBe(400);
			expect(castAsError(notEnabled.body as any).error.id).toBe('798d6847-b1ed-4f9c-b1f9-163c42655995');
		});

		test('i/2fa/update-key and i/2fa/remove-key manage an existing security key', async () => {
			const user = await signup({ username: `twofaupdkey${Date.now().toString(36)}` });
			const keyId = `hono-key-${Date.now().toString(36)}`;
			await createUserSecurityKeyInDatabase(db, {
				id: keyId,
				userId: user.id,
				name: 'original name',
				publicKey: 'dummy-public-key',
				counter: 0,
				credentialDeviceType: 'singleDevice',
				credentialBackedUp: false,
				transports: [],
			});

			const noSuchKey = await api(
				'i/2fa/update-key',
				{ name: 'renamed', credentialId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz' },
				user,
			);
			expect(noSuchKey.status).toBe(400);
			expect(castAsError(noSuchKey.body as any).error.id).toBe('f9c5467f-d492-4d3c-9a8g-a70dacc86512');

			const accessDenied = await api('i/2fa/update-key', { name: 'renamed', credentialId: keyId }, alice);
			expect(accessDenied.status).toBe(400);
			expect(castAsError(accessDenied.body as any).error.id).toBe('1fb7cb09-d46a-4fff-b8df-057708cce513');

			const updated = await api('i/2fa/update-key', { name: 'renamed', credentialId: keyId }, user);
			expect(updated.status).toBe(200);
			expect(updated.body).toStrictEqual({});

			const wrongPassword = await api('i/2fa/remove-key', { password: 'wrong', credentialId: keyId }, user);
			expect(wrongPassword.status).toBe(400);
			expect(castAsError(wrongPassword.body as any).error.id).toBe('141c598d-a825-44c8-9173-cfb9d92be493');

			const removed = await api('i/2fa/remove-key', { password: 'test', credentialId: keyId }, user);
			expect(removed.status).toBe(200);
			expect(removed.body).toStrictEqual({});

			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, user.id);
			expect(profile.usePasswordLessLogin).toBe(false);
		});

		test('i/2fa/password-less requires a security key before it can be enabled', async () => {
			const user = await signup({ username: `twofapwless${Date.now().toString(36)}` });

			const noKey = await api('i/2fa/password-less', { value: true }, user);
			expect(noKey.status).toBe(400);
			expect(castAsError(noKey.body as any).error.id).toBe('f9c54d7f-d4c2-4d3c-9a8g-a70daac86512');

			await createUserSecurityKeyInDatabase(db, {
				id: `hono-pwless-key-${Date.now().toString(36)}`,
				userId: user.id,
				name: 'a key',
				publicKey: 'dummy-public-key',
				counter: 0,
				credentialDeviceType: 'singleDevice',
				credentialBackedUp: false,
				transports: [],
			});

			const enabled = await api('i/2fa/password-less', { value: true }, user);
			expect(enabled.status).toBe(204);

			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, user.id);
			expect(profile.usePasswordLessLogin).toBe(true);
		});

		test('pages/create creates a page and rejects missing files or duplicate names', async () => {
			const suffix = Date.now().toString(36);
			const file = await uploadFile(alice);

			const created = await api(
				'pages/create',
				{
					title: `hono page ${suffix}`,
					name: `hono-page-${suffix}`,
					content: [{ id: 'block1', type: 'text', text: 'hello' }],
					variables: [],
					script: '',
					eyeCatchingImageId: file.body!.id,
				},
				alice,
			);
			expect(created.status).toBe(200);
			expect(created.body.name).toBe(`hono-page-${suffix}`);
			expect(created.body.userId).toBe(alice.id);
			expect(created.body.eyeCatchingImageId).toBe(file.body!.id);
			expect(created.body.eyeCatchingImage!.id).toBe(file.body!.id);

			const noSuchFile = await api(
				'pages/create',
				{
					title: 'no file',
					name: `hono-page-nofile-${suffix}`,
					content: [],
					variables: [],
					script: '',
					eyeCatchingImageId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz',
				},
				alice,
			);
			expect(noSuchFile.status).toBe(400);
			expect(castAsError(noSuchFile.body as any).error.id).toBe('b7b97489-0f66-4b12-a5ff-b21bd63f6e1c');

			const duplicateName = await api(
				'pages/create',
				{
					title: 'dup',
					name: `hono-page-${suffix}`,
					content: [],
					variables: [],
					script: '',
				},
				alice,
			);
			expect(duplicateName.status).toBe(400);
			expect(castAsError(duplicateName.body as any).error.id).toBe('4650348e-301c-499a-83c9-6aa988c66bc1');
		});

		test('pages/update updates a page and rejects missing pages, foreign pages, and name conflicts', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36);
			const other = await createPageInDatabase(db, {
				id: genId(),
				updatedAt: new Date(),
				title: `other page ${suffix}`,
				name: `hono-other-page-${suffix}`,
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
			const page = await createPageInDatabase(db, {
				id: genId(),
				updatedAt: new Date(),
				title: `before update ${suffix}`,
				name: `hono-update-page-${suffix}`,
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

			const updated = await api(
				'pages/update',
				{
					pageId: page.id,
					title: `after update ${suffix}`,
				},
				alice,
			);
			expect(updated.status).toBe(204);

			const shown = await api('pages/show', { pageId: page.id }, alice);
			expect(shown.status).toBe(200);
			expect(shown.body.title).toBe(`after update ${suffix}`);

			const missing = await api(
				'pages/update',
				{
					pageId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz',
					title: 'missing',
				},
				alice,
			);
			expect(missing.status).toBe(400);
			expect(castAsError(missing.body as any).error.id).toBe('21149b9e-3616-4778-9592-c4ce89f5a864');

			const foreign = await api(
				'pages/update',
				{
					pageId: page.id,
					title: 'hijack',
				},
				bob,
			);
			expect(foreign.status).toBe(400);
			expect(castAsError(foreign.body as any).error.id).toBe('3c15cd52-3b4b-4274-967d-6456fc4f792b');

			const nameConflict = await api(
				'pages/update',
				{
					pageId: page.id,
					name: other.name,
				},
				alice,
			);
			expect(nameConflict.status).toBe(400);
			expect(castAsError(nameConflict.body as any).error.id).toBe('2298a392-d4a1-44c5-9ebb-ac1aeaa5a9ab');
		});

		test("pages/delete removes a page, rejects foreign pages, and allows moderators to delete others' pages", async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36);
			const page = await createPageInDatabase(db, {
				id: genId(),
				updatedAt: new Date(),
				title: `to delete ${suffix}`,
				name: `hono-delete-page-${suffix}`,
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

			const foreign = await api('pages/delete', { pageId: page.id }, bob);
			expect(foreign.status).toBe(400);
			expect(castAsError(foreign.body as any).error.id).toBe('8b741b3e-2c22-44b3-a15f-29949aa1601e');

			const moderatorRole = await role(alice, { isModerator: true });
			const moderator = await signup({ username: `pagemod${suffix}` });
			await createRoleAssignmentInDatabase(db, {
				id: genId(),
				roleId: moderatorRole.id,
				userId: moderator.id,
			});

			const deleted = await api('pages/delete', { pageId: page.id }, moderator);
			expect(deleted.status).toBe(204);

			const logs = await listModerationLogsFromDatabase(db, { limit: 100, order: 'desc' });
			const log = logs.find(
				(l) => l.userId === moderator.id && l.type === 'deletePage' && (l.info as any).pageId === page.id,
			);
			assert.ok(log);
			expect((log!.info as any).pageUserId).toBe(alice.id);

			const missing = await api('pages/delete', { pageId: page.id }, alice);
			expect(missing.status).toBe(400);
			expect(castAsError(missing.body as any).error.id).toBe('eb0c6e1d-d519-4764-9486-52a7e1c6392a');
		});

		test('pages/show finds a page by id or by name and username, and pages/featured lists liked pages', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36);
			const page = await createPageInDatabase(db, {
				id: genId(),
				updatedAt: new Date(),
				title: `show page ${suffix}`,
				name: `hono-show-page-${suffix}`,
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

			const byId = await api('pages/show', { pageId: page.id });
			expect(byId.status).toBe(200);
			expect(byId.body.id).toBe(page.id);

			const byName = await api('pages/show', { name: page.name, username: alice.username });
			expect(byName.status).toBe(200);
			expect(byName.body.id).toBe(page.id);

			const notFound = await api('pages/show', { pageId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz' });
			expect(notFound.status).toBe(400);
			expect(castAsError(notFound.body as any).error.id).toBe('222120c0-3ead-4528-811b-b96f233388d7');

			const liked = await api('pages/like', { pageId: page.id }, bob);
			expect(liked.status).toBe(204);

			const featured = await api('pages/featured', {});
			expect(featured.status).toBe(200);
			expect((featured.body as any[]).some((p) => p.id === page.id)).toBe(true);
		});

		test("i/pages lists the caller's pages and i/page-likes lists liked pages", async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36);
			const page = await createPageInDatabase(db, {
				id: genId(),
				updatedAt: new Date(),
				title: `i pages ${suffix}`,
				name: `hono-i-page-${suffix}`,
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

			const ownPages = await api('i/pages', {}, alice);
			expect(ownPages.status).toBe(200);
			expect((ownPages.body as any[]).some((p) => p.id === page.id)).toBe(true);

			const liked = await api('pages/like', { pageId: page.id }, bob);
			expect(liked.status).toBe(204);

			const likes = await api('i/page-likes', {}, bob);
			expect(likes.status).toBe(200);
			const likeEntry = (likes.body as any[]).find((l) => l.page.id === page.id);
			assert.ok(likeEntry);
			expect(typeof likeEntry.id).toBe('string');
		});

		test("users/pages lists only a user's public pages without credentials", async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36);
			const publicPage = await createPageInDatabase(db, {
				id: genId(),
				updatedAt: new Date(),
				title: `users pages public ${suffix}`,
				name: `hono-users-page-public-${suffix}`,
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

			const shown = await api('users/pages', { userId: alice.id });
			expect(shown.status).toBe(200);
			expect((shown.body as any[]).some((p) => p.id === publicPage.id)).toBe(true);
		});

		test('users/lists/push adds a member, rejects duplicates, missing lists/users, and blocked users', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36);
			const userList = await createUserListInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `hono-push-list-${suffix}`,
			});
			const blocker = await signup({ username: `pushblocker${suffix}` });
			await createBlockingInDatabase(db, {
				id: genId(),
				blockerId: blocker.id,
				blockeeId: alice.id,
			});

			const noSuchList = await api('users/lists/push', { listId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz', userId: bob.id }, alice);
			expect(noSuchList.status).toBe(400);
			expect(castAsError(noSuchList.body as any).error.id).toBe('2214501d-ac96-4049-b717-91e42272a711');

			const noSuchUser = await api(
				'users/lists/push',
				{ listId: userList.id, userId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz' },
				alice,
			);
			expect(noSuchUser.status).toBe(400);
			expect(castAsError(noSuchUser.body as any).error.id).toBe('a89abd3d-f0bc-4cce-beb1-2f446f4f1e6a');

			const blocked = await api('users/lists/push', { listId: userList.id, userId: blocker.id }, alice);
			expect(blocked.status).toBe(400);
			expect(castAsError(blocked.body as any).error.id).toBe('990232c5-3f9d-4d83-9f3f-ef27b6332a4b');

			const pushed = await api('users/lists/push', { listId: userList.id, userId: bob.id }, alice);
			expect(pushed.status).toBe(204);
			expect(await userListMembershipExistsInDatabase(db, bob.id, userList.id)).toBe(true);

			const duplicate = await api('users/lists/push', { listId: userList.id, userId: bob.id }, alice);
			expect(duplicate.status).toBe(400);
			expect(castAsError(duplicate.body as any).error.id).toBe('1de7c884-1595-49e9-857e-61f12f4d4fc5');
		});

		test('users/lists/pull removes a member and rejects missing lists or users', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36);
			const userList = await createUserListInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `hono-pull-list-${suffix}`,
			});
			await createUserListMembershipInDatabase(db, {
				id: genId(),
				userId: bob.id,
				userListId: userList.id,
				userListUserId: alice.id,
			});

			const noSuchList = await api('users/lists/pull', { listId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz', userId: bob.id }, alice);
			expect(noSuchList.status).toBe(400);
			expect(castAsError(noSuchList.body as any).error.id).toBe('7f44670e-ab16-43b8-b4c1-ccd2ee89cc02');

			const noSuchUser = await api(
				'users/lists/pull',
				{ listId: userList.id, userId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz' },
				alice,
			);
			expect(noSuchUser.status).toBe(400);
			expect(castAsError(noSuchUser.body as any).error.id).toBe('588e7f72-c744-4a61-b180-d354e912bda2');

			const pulled = await api('users/lists/pull', { listId: userList.id, userId: bob.id }, alice);
			expect(pulled.status).toBe(204);
			expect(await userListMembershipExistsInDatabase(db, bob.id, userList.id)).toBe(false);
		});

		test('users/lists/update-membership toggles withReplies for a member', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36);
			const userList = await createUserListInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `hono-membership-list-${suffix}`,
			});
			await createUserListMembershipInDatabase(db, {
				id: genId(),
				userId: bob.id,
				userListId: userList.id,
				userListUserId: alice.id,
				withReplies: false,
			});

			const updated = await api(
				'users/lists/update-membership',
				{ listId: userList.id, userId: bob.id, withReplies: true },
				alice,
			);
			expect(updated.status).toBe(204);

			const memberships = await api('users/lists/get-memberships', { listId: userList.id }, alice);
			expect(memberships.status).toBe(200);
			const membership = (memberships.body as any[]).find((m) => m.userId === bob.id);
			assert.ok(membership);
			expect(membership.withReplies).toBe(true);
			expect(membership.user.id).toBe(bob.id);
		});

		test('users/lists/get-memberships supports forPublic without credentials', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36);
			const userList = await createUserListInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `hono-public-memberships-list-${suffix}`,
				isPublic: true,
			});
			await createUserListMembershipInDatabase(db, {
				id: genId(),
				userId: bob.id,
				userListId: userList.id,
				userListUserId: alice.id,
			});

			const publicMemberships = await api('users/lists/get-memberships', { listId: userList.id, forPublic: true });
			expect(publicMemberships.status).toBe(200);
			expect((publicMemberships.body as any[]).some((m) => m.userId === bob.id)).toBe(true);

			const missing = await api('users/lists/get-memberships', {
				listId: 'zzzzzzzzzzzzzzzzzzzzzzzzzz',
				forPublic: true,
			});
			expect(missing.status).toBe(400);
			expect(castAsError(missing.body as any).error.id).toBe('7bc05c21-1d7a-41ae-88f1-66820f4dc686');
		});

		test('users/lists/create-from-public copies members from an existing public list', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36);
			// alice はこのファイルの他テストでリストを作り続けるので、リスト数上限に達していると
			// ブロック判定より先に TOO_MANY_USERLISTS が返る。コピー元は共有し、コピーする側は専用ユーザーにする
			const copier = await signup({ username: `listcopier${suffix}` });
			const copier2 = await signup({ username: `listcopier2${suffix}` });
			const sourceList = await createUserListInDatabase(db, {
				id: genId(),
				userId: bob.id,
				name: `hono-source-list-${suffix}`,
				isPublic: true,
			});
			await createUserListMembershipInDatabase(db, {
				id: genId(),
				userId: carol.id,
				userListId: sourceList.id,
				userListUserId: bob.id,
			});

			const privateList = await createUserListInDatabase(db, {
				id: genId(),
				userId: bob.id,
				name: `hono-private-source-list-${suffix}`,
				isPublic: false,
			});

			const noSuchList = await api('users/lists/create-from-public', { name: 'copy', listId: privateList.id }, copier);
			expect(noSuchList.status).toBe(400);
			expect(castAsError(noSuchList.body as any).error.id).toBe('9292f798-6175-4f7d-93f4-b6742279667d');

			const copied = await api(
				'users/lists/create-from-public',
				{ name: `hono-copied-list-${suffix}`, listId: sourceList.id },
				copier,
			);
			expect(copied.status).toBe(200);
			expect(copied.body.name).toBe(`hono-copied-list-${suffix}`);
			expect(copied.body.userIds).toStrictEqual([carol.id]);
			expect(await userListMembershipExistsInDatabase(db, carol.id, copied.body.id)).toBe(true);

			const blockedSourceList = await createUserListInDatabase(db, {
				id: genId(),
				userId: bob.id,
				name: `hono-blocked-source-list-${suffix}`,
				isPublic: true,
			});
			await createUserListMembershipInDatabase(db, {
				id: genId(),
				userId: dave.id,
				userListId: blockedSourceList.id,
				userListUserId: bob.id,
			});
			const blocking = await createBlockingInDatabase(db, {
				id: genId(),
				blockerId: dave.id,
				blockeeId: copier.id,
			});
			const blockedCopyName = `hono-blocked-copy-${suffix}`;
			try {
				const blocked = await api(
					'users/lists/create-from-public',
					{ name: blockedCopyName, listId: blockedSourceList.id },
					copier,
				);
				expect(blocked.status).toBe(400);
				expect(castAsError(blocked.body as any).error.id).toBe('a2497f2a-2389-439c-8626-5298540530f4');
				expect(await fetchUserListByNameAndUserIdFromDatabase(db, blockedCopyName, copier.id)).toBe(null);
			} finally {
				await deleteBlockingByIdFromDatabase(db, blocking.id);
			}

			const concurrentSourceList = await createUserListInDatabase(db, {
				id: genId(),
				userId: carol.id,
				name: `hono-concurrent-source-list-${suffix}`,
				isPublic: true,
			});
			await Promise.all(
				[copier.id, bob.id].map((userId) =>
					createUserListMembershipInDatabase(db, {
						id: genId(),
						userId,
						userListId: concurrentSourceList.id,
						userListUserId: carol.id,
					}),
				),
			);
			const [firstCopy, secondCopy] = await Promise.all([
				api(
					'users/lists/create-from-public',
					{ name: `hono-concurrent-first-${suffix}`, listId: concurrentSourceList.id },
					copier,
				),
				api(
					'users/lists/create-from-public',
					{ name: `hono-concurrent-second-${suffix}`, listId: concurrentSourceList.id },
					copier2,
				),
			]);
			expect(firstCopy.status).toBe(200);
			expect(secondCopy.status).toBe(200);
			expect(new Set(firstCopy.body.userIds)).toStrictEqual(new Set([copier.id, bob.id]));
			expect(new Set(secondCopy.body.userIds)).toStrictEqual(new Set([copier.id, bob.id]));
			await Promise.all([
				deleteUserListByIdInDatabase(db, firstCopy.body.id),
				deleteUserListByIdInDatabase(db, copied.body.id),
				deleteUserListByIdInDatabase(db, secondCopy.body.id),
			]);
		});

		test('users/achievements returns profile achievements without credentials', async () => {
			const achievements = [
				{
					name: 'notes1' as const,
					unlockedAt: Date.now(),
				},
			];
			await updateUserProfileInDatabase(db, alice.id, { achievements });

			const res = await api('users/achievements', { userId: alice.id });
			expect(res.status).toBe(200);
			expect(res.body).toStrictEqual(achievements);
		});

		test('i/webhooks list, show, update, and delete are scoped to the caller', async () => {
			const config = fixtureConfig;
			const latestSentAt = new Date('2024-01-02T03:04:05.000Z');
			const webhook = await createWebhookInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: 'hono webhook',
				on: ['mention', 'reply'],
				url: 'https://example.com/hono-webhook',
				secret: 'hono-secret',
				active: true,
				latestSentAt,
				latestStatus: 204,
			});
			const otherWebhook = await createWebhookInDatabase(db, {
				id: genId(),
				userId: bob.id,
				name: 'other webhook',
				on: ['follow'],
				url: 'https://example.com/other-webhook',
				secret: 'other-secret',
				active: false,
			});
			const expected = {
				id: webhook.id,
				userId: alice.id,
				name: webhook.name,
				on: webhook.on,
				url: webhook.url,
				secret: webhook.secret,
				active: webhook.active,
				latestSentAt: latestSentAt.toISOString(),
				latestStatus: webhook.latestStatus,
			};

			const list = await api('i/webhooks/list', {}, alice);
			expect(list.status).toBe(200);
			const listed = (list.body as any[]).find((item) => item.id === webhook.id);
			expect(listed).toStrictEqual(expected);
			expect((list.body as any[]).some((item) => item.id === otherWebhook.id)).toBe(false);

			const show = await api('i/webhooks/show', { webhookId: webhook.id }, alice);
			expect(show.status).toBe(200);
			expect(show.body).toStrictEqual(expected);

			const noSuch = await api('i/webhooks/show', { webhookId: otherWebhook.id }, alice);
			expect(noSuch.status).toBe(400);
			expect(castAsError(noSuch.body as any).error.id).toBe('50f614d9-3047-4f7e-90d8-ad6b2d5fb098');

			const updateOther = await api('i/webhooks/update', { webhookId: otherWebhook.id, name: 'bad update' }, alice);
			expect(updateOther.status).toBe(400);
			expect(castAsError(updateOther.body as any).error.id).toBe('fb0fea69-da18-45b1-828d-bd4fd1612518');

			const update = await api(
				'i/webhooks/update',
				{
					webhookId: webhook.id,
					name: 'hono webhook updated',
					on: ['followed'],
					url: 'https://example.com/hono-webhook-updated',
					secret: null,
					active: false,
				},
				alice,
			);
			expect(update.status).toBe(204);

			const updated = await fetchWebhookByIdAndUserIdFromDatabase(db, webhook.id, alice.id);
			expect(updated?.name).toBe('hono webhook updated');
			expect(updated?.on).toStrictEqual(['followed']);
			expect(updated?.url).toBe('https://example.com/hono-webhook-updated');
			expect(updated?.secret).toBe('');
			expect(updated?.active).toBe(false);

			const deleteOther = await api('i/webhooks/delete', { webhookId: otherWebhook.id }, alice);
			expect(deleteOther.status).toBe(400);
			expect(castAsError(deleteOther.body as any).error.id).toBe('bae73e5a-5522-4965-ae19-3a8688e71d82');

			const deleted = await api('i/webhooks/delete', { webhookId: webhook.id }, alice);
			expect(deleted.status).toBe(204);
			expect(await fetchWebhookByIdAndUserIdFromDatabase(db, webhook.id, alice.id)).toBe(null);
		});

		test('users/lists/delete removes only the caller list and preserves error id', async () => {
			const config = fixtureConfig;
			const userList = await createUserListInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `hono-delete-list-${Date.now()}`,
				isPublic: false,
			});

			const otherUser = await api('users/lists/delete', { listId: userList.id }, bob);
			expect(otherUser.status).toBe(400);
			expect(castAsError(otherUser.body as any).error.id).toBe('78436795-db79-42f5-b1e2-55ea2cf19166');
			expect(await fetchUserListByIdAndUserIdFromDatabase(db, userList.id, alice.id)).not.toBe(null);

			const deleted = await api('users/lists/delete', { listId: userList.id }, alice);
			expect(deleted.status).toBe(204);
			expect(await fetchUserListByIdAndUserIdFromDatabase(db, userList.id, alice.id)).toBe(null);

			const missing = await api('users/lists/delete', { listId: userList.id }, alice);
			expect(missing.status).toBe(400);
			expect(castAsError(missing.body as any).error.id).toBe('78436795-db79-42f5-b1e2-55ea2cf19166');
		});

		test('users/lists list, show, and update preserve visibility and ownership semantics', async () => {
			const config = fixtureConfig;
			const privateList = await createUserListInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `hono-private-list-${Date.now()}`,
				isPublic: false,
			});
			const publicList = await createUserListInDatabase(db, {
				id: genId(),
				userId: alice.id,
				name: `hono-public-list-${Date.now()}`,
				isPublic: true,
			});
			await createUserListInDatabase(db, {
				id: genId(),
				userId: bob.id,
				name: `hono-bob-list-${Date.now()}`,
				isPublic: true,
			});

			const ownList = await api('users/lists/list', {}, alice);
			expect(ownList.status).toBe(200);
			expect((ownList.body as any[]).some((item) => item.id === privateList.id)).toBe(true);
			expect((ownList.body as any[]).some((item) => item.id === publicList.id)).toBe(true);

			const publicOnly = await api('users/lists/list', { userId: alice.id });
			expect(publicOnly.status).toBe(200);
			expect((publicOnly.body as any[]).some((item) => item.id === publicList.id)).toBe(true);
			expect((publicOnly.body as any[]).some((item) => item.id === privateList.id)).toBe(false);

			const invalidAnonymousList = await api('users/lists/list', {});
			expect(invalidAnonymousList.status).toBe(400);
			expect(castAsError(invalidAnonymousList.body as any).error.id).toBe('ab36de0e-29e9-48cb-9732-d82f1281620d');

			const privateShowByOwner = await api('users/lists/show', { listId: privateList.id }, alice);
			expect(privateShowByOwner.status).toBe(200);
			expect(privateShowByOwner.body.id).toBe(privateList.id);

			const privateShowAnonymous = await api('users/lists/show', { listId: privateList.id });
			expect(privateShowAnonymous.status).toBe(400);
			expect(castAsError(privateShowAnonymous.body as any).error.id).toBe('7bc05c21-1d7a-41ae-88f1-66820f4dc686');

			const favorite = await api('users/lists/favorite', { listId: publicList.id }, bob);
			expect(favorite.status).toBe(204);
			const publicShow = await api('users/lists/show', { listId: publicList.id, forPublic: true }, bob);
			expect(publicShow.status).toBe(200);
			expect(publicShow.body.id).toBe(publicList.id);
			expect(publicShow.body.likedCount).toBe(1);
			expect(publicShow.body.isLiked).toBe(true);

			const otherUserUpdate = await api('users/lists/update', { listId: privateList.id, name: 'bad update' }, bob);
			expect(otherUserUpdate.status).toBe(400);
			expect(castAsError(otherUserUpdate.body as any).error.id).toBe('796666fe-3dff-4d39-becb-8a5932c1d5b7');

			const update = await api(
				'users/lists/update',
				{
					listId: privateList.id,
					name: 'hono updated list',
					isPublic: true,
				},
				alice,
			);
			expect(update.status).toBe(200);
			expect(update.body.id).toBe(privateList.id);
			expect(update.body.name).toBe('hono updated list');
			expect(update.body.isPublic).toBe(true);

			const fetched = await fetchUserListByIdAndUserIdFromDatabase(db, privateList.id, alice.id);
			expect(fetched?.name).toBe('hono updated list');
			expect(fetched?.isPublic).toBe(true);
		});

		test('account data endpoints require matching app token permissions', async () => {
			const readAccountToken = await createAppToken(alice, ['read:account']);
			const readDriveToken = await createAppToken(alice, ['read:drive']);
			const config = fixtureConfig;

			for (const [endpoint, params, token] of [
				['drive/files/check-existence', { md5: '0'.repeat(32) }, readAccountToken],
				['drive/folders', {}, readAccountToken],
				['drive/folders/create', { name: 'hono-denied-folder' }, readDriveToken],
				['drive/folders/delete', { folderId: genId() }, readDriveToken],
				['drive/folders/find', { name: 'hono-denied-folder' }, readAccountToken],
				['drive/folders/show', { folderId: genId() }, readAccountToken],
				['drive/folders/update', { folderId: genId(), name: 'hono-denied-folder' }, readDriveToken],
				['notes/drafts/count', {}, readDriveToken],
				['i/webhooks/list', {}, readDriveToken],
				['i/webhooks/show', { webhookId: genId() }, readDriveToken],
				['i/webhooks/delete', { webhookId: genId() }, readAccountToken],
				['i/webhooks/update', { webhookId: genId() }, readAccountToken],
				['users/lists/list', {}, readDriveToken],
				['users/lists/show', { listId: genId() }, readDriveToken],
				['users/lists/delete', { listId: genId() }, readAccountToken],
				['users/lists/update', { listId: genId() }, readAccountToken],
			] as const) {
				const denied = await api(endpoint, params as any, { token });
				expect(denied.status, endpoint).toBe(403);
				expect(castAsError(denied.body as any).error.code, endpoint).toBe('PERMISSION_DENIED');
			}
		});
	});

	describe('i/claim-achievement', () => {
		test('達成を記録しachievementEarned通知を作成、二重取得しない', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hca${suffix}` });

			const res = await api('i/claim-achievement', { name: 'notes1' }, user);
			expect(res.status).toBe(204);

			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, user.id);
			assert.ok(profile.achievements.some((a) => a.name === 'notes1'));

			const redis = createRedisClient(config);
			try {
				await vi.waitFor(async () => {
					const entries = await redis.xrevrange(`notificationTimeline:${user.id}`, '+', '-', 'COUNT', 10);
					const notifications = entries.map(([, values]) => {
						const dataIndex = values.findIndex((value) => value === 'data');
						return JSON.parse(values[dataIndex + 1]!) as { type?: string; achievement?: string };
					});
					assert.ok(notifications.some((n) => n.type === 'achievementEarned' && n.achievement === 'notes1'));
				}, POLL);
			} finally {
				await closeRedisConnection(redis);
			}

			const again = await api('i/claim-achievement', { name: 'notes1' }, user);
			expect(again.status).toBe(204);
			const profileAfter = await fetchUserProfileByUserIdOrFailFromDatabase(db, user.id);
			expect(profileAfter.achievements.filter((a) => a.name === 'notes1').length).toBe(1);
		});
	});

	describe('i/webhooks/create', () => {
		test('webhookを作成しTOO_MANY_WEBHOOKSでscope保護される', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hwc${suffix}` });

			const wrongScopeToken = await createAppToken(user, ['read:account']);
			const scopeDenied = await api(
				'i/webhooks/create',
				{ name: 'hook', url: 'https://example.com/hook', on: ['note'] },
				{ token: wrongScopeToken },
			);
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const created = await api(
				'i/webhooks/create',
				{ name: 'hook', url: 'https://example.com/hook', on: ['note'], secret: 'sh' },
				user,
			);
			expect(created.status).toBe(200);
			expect(created.body.name).toBe('hook');
			expect(created.body.url).toBe('https://example.com/hook');
			expect(created.body.on).toStrictEqual(['note']);
			expect(created.body.secret).toBe('sh');
			expect(created.body.active).toBe(true);
			expect(created.body.userId).toBe(user.id);

			const shown = await api('i/webhooks/show', { webhookId: created.body.id }, user);
			expect(shown.status).toBe(200);
			expect(shown.body.id).toBe(created.body.id);
		});
	});

	describe('i/webhooks/test', () => {
		test('自分のwebhookに各イベント種別をテスト送信でき、他人のwebhookはNO_SUCH_WEBHOOKになる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `hwt${suffix}` });
			const stranger = await signup({ username: `hwts${suffix}` });

			const created = await api(
				'i/webhooks/create',
				{ name: 'test-hook', url: 'https://example.com/test-hook', on: ['note'] },
				owner,
			);
			expect(created.status).toBe(200);

			for (const type of [
				'note',
				'reply',
				'renote',
				'mention',
				'follow',
				'followed',
				'unfollow',
				'reaction',
			] as const) {
				const res = await api('i/webhooks/test', { webhookId: created.body.id, type }, owner);
				expect(res.status, `type=${type} should succeed`).toBe(204);
			}

			const noSuch = await api('i/webhooks/test', { webhookId: created.body.id, type: 'note' }, stranger);
			expect(noSuch.status).toBe(400);
			expect(castAsError(noSuch.body as any).error.code).toBe('NO_SUCH_WEBHOOK');
		});
	});

	describe('i/import-blocking, i/import-following, i/import-muting, i/import-user-lists', () => {
		async function grantImportPolicy(userId: string, suffix: string, policyKey: string) {
			const importRole = await role(
				alice,
				{
					name: `hono import role ${policyKey} ${suffix}`,
				},
				{
					[policyKey]: { priority: 0, useDefault: false, value: true },
				},
			);
			const assign = await api('admin/roles/assign', { roleId: importRole.id, userId }, alice);
			expect(assign.status).toBe(204);
		}

		async function makeDriveFile(userId: string, suffix: string, size: number) {
			const config = fixtureConfig;
			const md5 = createHash('md5').update(`hono-import-${suffix}-${size}`).digest('hex');
			return await createDriveFileInDatabase(db, {
				id: genId(),
				userId,
				userHost: null,
				md5,
				name: `hono-import-${suffix}.csv`,
				type: 'text/csv',
				size,
				blurhash: null,
				properties: {},
				storedInternal: true,
				url: `${origin}/files/${md5}`,
				thumbnailUrl: null,
				comment: null,
				folderId: null,
			});
		}

		test('i/import-blocking はrole policy、ファイル検証、キュー投入を維持する', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hib${suffix}` });

			const deniedBeforeGrant = await api('i/import-blocking', { fileId: genId() }, user);
			expect(deniedBeforeGrant.status).toBe(403);
			expect(castAsError(deniedBeforeGrant.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

			await grantImportPolicy(user.id, suffix, 'canImportBlocking');

			const noSuchFile = await api('i/import-blocking', { fileId: genId() }, user);
			expect(noSuchFile.status).toBe(400);
			expect(castAsError(noSuchFile.body as any).error.code).toBe('NO_SUCH_FILE');

			const emptyFile = await makeDriveFile(user.id, `${suffix}e`, 0);
			const emptyRes = await api('i/import-blocking', { fileId: emptyFile.id }, user);
			expect(emptyRes.status).toBe(400);
			expect(castAsError(emptyRes.body as any).error.code).toBe('EMPTY_FILE');

			const bigFile = await makeDriveFile(user.id, `${suffix}b`, 65 * 1024);
			const bigRes = await api('i/import-blocking', { fileId: bigFile.id }, user);
			expect(bigRes.status).toBe(400);
			expect(castAsError(bigRes.body as any).error.code).toBe('TOO_BIG_FILE');

			const okFile = await makeDriveFile(user.id, `${suffix}o`, 1024);
			const okRes = await api('i/import-blocking', { fileId: okFile.id }, user);
			expect(okRes.status).toBe(204);
		});

		test('i/import-following, i/import-muting, i/import-user-lists はrole policyを維持しファイルがあれば成功する', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hifm${suffix}` });

			await grantImportPolicy(user.id, `${suffix}f`, 'canImportFollowing');
			await grantImportPolicy(user.id, `${suffix}m`, 'canImportMuting');
			await grantImportPolicy(user.id, `${suffix}u`, 'canImportUserLists');

			const followingFile = await makeDriveFile(user.id, `${suffix}f`, 1024);
			const followingRes = await api('i/import-following', { fileId: followingFile.id, withReplies: true }, user);
			expect(followingRes.status).toBe(204);

			const mutingFile = await makeDriveFile(user.id, `${suffix}m`, 1024);
			const mutingRes = await api('i/import-muting', { fileId: mutingFile.id }, user);
			expect(mutingRes.status).toBe(204);

			const userListsFile = await makeDriveFile(user.id, `${suffix}u`, 1024);
			const userListsRes = await api('i/import-user-lists', { fileId: userListsFile.id }, user);
			expect(userListsRes.status).toBe(204);
		});

		// i/import-antennas はファイル内容を自分自身のURL(config.instance.url)からHTTPダウンロードする。
		test('i/import-antennas はrole policy、ファイル検証、ダウンロードしたJSON件数によるantennaLimitを維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hia${suffix}` });

			const deniedBeforeGrant = await api('i/import-antennas', { fileId: genId() }, user);
			expect(deniedBeforeGrant.status).toBe(403);
			expect(castAsError(deniedBeforeGrant.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

			await grantImportPolicy(user.id, suffix, 'canImportAntennas');

			const noSuchFile = await api('i/import-antennas', { fileId: genId() }, user);
			expect(noSuchFile.status).toBe(400);
			expect(castAsError(noSuchFile.body as any).error.code).toBe('NO_SUCH_FILE');

			const emptyFile = await makeDriveFile(user.id, `${suffix}e`, 0);
			const emptyRes = await api('i/import-antennas', { fileId: emptyFile.id }, user);
			expect(emptyRes.status).toBe(400);
			expect(castAsError(emptyRes.body as any).error.code).toBe('EMPTY_FILE');

			// i/import-antennas はファイル内容(DriveFile.url)を実際にHTTPダウンロードするため、
			// admin/emoji/copy のテストと同様にループバックの一時HTTPサーバーでJSONを配信して検証する。
			const antennas = [
				{
					name: `hono-antenna-${suffix}`,
					src: 'all',
					userListAccts: null,
					keywords: [['hono']],
					excludeKeywords: [],
					users: [],
					caseSensitive: false,
					localOnly: false,
					excludeBots: false,
					withReplies: false,
					withFile: false,
					excludeNotesInSensitiveChannel: false,
				},
			];
			const antennasJson = Buffer.from(JSON.stringify(antennas));
			let antennaServer: Server | undefined;
			await new Promise<void>((resolve) => {
				antennaServer = createServer((req, res) => {
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(req.url?.includes('broken') ? Buffer.from('{ this is not json') : antennasJson);
				});
				antennaServer.listen(0, '127.0.0.1', () => resolve());
			});
			const address = antennaServer!.address() as AddressInfo;
			const antennasUrl = `http://127.0.0.1:${address.port}/${suffix}.json`;
			const brokenAntennasUrl = `http://127.0.0.1:${address.port}/${suffix}-broken.json`;

			try {
				// 壊れたファイルは INVALID_ANTENNA_IMPORT_FILE を返し、かつ 1回/時 の実行枠を消費しない
				// (消費してしまうと、ファイルを直してもその1時間は再試行できなくなる)
				const brokenFile = await createDriveFileInDatabase(db, {
					id: genId(),
					userId: user.id,
					userHost: null,
					md5: createHash('md5').update(`hono-import-antennas-broken-${suffix}`).digest('hex'),
					name: `hono-import-antennas-broken-${suffix}.json`,
					type: 'application/json',
					size: 17,
					blurhash: null,
					properties: {},
					storedInternal: false,
					url: brokenAntennasUrl,
					thumbnailUrl: null,
					comment: null,
					folderId: null,
				});
				const brokenRes = await api('i/import-antennas', { fileId: brokenFile.id }, user);
				expect(brokenRes.status, JSON.stringify(brokenRes.body)).toBe(400);
				expect(castAsError(brokenRes.body as any).error.code).toBe('INVALID_ANTENNA_IMPORT_FILE');

				const antennaFile = await createDriveFileInDatabase(db, {
					id: genId(),
					userId: user.id,
					userHost: null,
					md5: createHash('md5').update(`hono-import-antennas-${suffix}`).digest('hex'),
					name: `hono-import-antennas-${suffix}.json`,
					type: 'application/json',
					size: antennasJson.length,
					blurhash: null,
					properties: {},
					storedInternal: false,
					url: antennasUrl,
					thumbnailUrl: null,
					comment: null,
					folderId: null,
				});

				const beforeCount = await countAntennasByUserIdFromDatabase(db, user.id);
				const okRes = await api('i/import-antennas', { fileId: antennaFile.id }, user);
				expect(okRes.status).toBe(204);
				expect(await countAntennasByUserIdFromDatabase(db, user.id)).toBe(beforeCount + 1);

				const zeroLimitRole = await role(
					alice,
					{
						name: `hono import antennas zero limit ${suffix}`,
					},
					{
						antennaLimit: { priority: 1, useDefault: false, value: beforeCount },
					},
				);
				const assignZeroLimit = await api('admin/roles/assign', { roleId: zeroLimitRole.id, userId: user.id }, alice);
				expect(assignZeroLimit.status).toBe(204);

				const antennaFile2 = await createDriveFileInDatabase(db, {
					id: genId(),
					userId: user.id,
					userHost: null,
					md5: createHash('md5').update(`hono-import-antennas-2-${suffix}`).digest('hex'),
					name: `hono-import-antennas-2-${suffix}.json`,
					type: 'application/json',
					size: antennasJson.length,
					blurhash: null,
					properties: {},
					storedInternal: false,
					url: antennasUrl,
					thumbnailUrl: null,
					comment: null,
					folderId: null,
				});
				const tooManyRes = await api('i/import-antennas', { fileId: antennaFile2.id }, user);
				expect(tooManyRes.status).toBe(400);
				expect(castAsError(tooManyRes.body as any).error.code).toBe('TOO_MANY_ANTENNAS');
			} finally {
				await new Promise<void>((resolve, reject) => {
					antennaServer?.close((err) => (err ? reject(err) : resolve()));
				});
			}
		});
	});

	describe('users/relation', () => {
		test('単一userIdは1要素配列、配列userIdは対応する配列で各種関係フラグを返す', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const me = await signup({ username: `hur${suffix}` });
			const stranger = await signup({ username: `hurs${suffix}` });
			const followee = await signup({ username: `hurf${suffix}` });
			const blockee = await signup({ username: `hurb${suffix}` });
			const mutee = await signup({ username: `hurm${suffix}` });
			const renoteMutee = await signup({ username: `hurr${suffix}` });

			await api('following/create', { userId: followee.id }, me);
			await api('blocking/create', { userId: blockee.id }, me);
			await api('mute/create', { userId: mutee.id }, me);
			await api('renote-mute/create', { userId: renoteMutee.id }, me);

			const single = await api('users/relation', { userId: stranger.id }, me);
			expect(single.status).toBe(200);
			assert.ok(Array.isArray(single.body));
			expect(single.body.length).toBe(1);
			expect(getAt(single.body, 0).id).toBe(stranger.id);
			expect(getAt(single.body, 0).isFollowing).toBe(false);
			expect(getAt(single.body, 0).isBlocking).toBe(false);
			expect(getAt(single.body, 0).isMuted).toBe(false);
			expect(getAt(single.body, 0).isRenoteMuted).toBe(false);

			const batch = await api(
				'users/relation',
				{
					userId: [followee.id, blockee.id, mutee.id, renoteMutee.id, stranger.id],
				},
				me,
			);
			expect(batch.status).toBe(200);
			assert.ok(Array.isArray(batch.body));
			expect(batch.body.length).toBe(5);
			const byId = new Map(batch.body.map((r: any) => [r.id, r]));
			expect(byId.get(followee.id).isFollowing).toBe(true);
			expect(byId.get(blockee.id).isBlocking).toBe(true);
			expect(byId.get(mutee.id).isMuted).toBe(true);
			expect(byId.get(renoteMutee.id).isRenoteMuted).toBe(true);
			expect(byId.get(stranger.id).isFollowing).toBe(false);

			const unauthorized = await api('users/relation', { userId: stranger.id });
			expect(unauthorized.status).toBe(401);
			expect(castAsError(unauthorized.body as any).error.code).toBe('CREDENTIAL_REQUIRED');
		});
	});

	describe('users/clips, users/flashs, users/gallery/posts', () => {
		test('users/clips は公開clipのみをページングして返す', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `huc${suffix}` });

			const pub = await api('clips/create', { name: `hono users/clips public ${suffix}`, isPublic: true }, owner);
			expect(pub.status).toBe(200);
			const priv = await api('clips/create', { name: `hono users/clips private ${suffix}`, isPublic: false }, owner);
			expect(priv.status).toBe(200);

			const listed = await api('users/clips', { userId: owner.id, limit: 100 });
			expect(listed.status).toBe(200);
			assert.ok(listed.body.some((c: any) => c.id === pub.body.id));
			assert.ok(!listed.body.some((c: any) => c.id === priv.body.id));
		});

		test('users/flashs は公開flashのみをページングして返す', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `huf${suffix}` });

			const pub = await api(
				'flash/create',
				{
					title: `hono users/flashs public ${suffix}`,
					summary: 's',
					script: '1',
					permissions: [],
					visibility: 'public',
				},
				owner,
			);
			expect(pub.status).toBe(200);
			const priv = await api(
				'flash/create',
				{
					title: `hono users/flashs private ${suffix}`,
					summary: 's',
					script: '1',
					permissions: [],
					visibility: 'private',
				},
				owner,
			);
			expect(priv.status).toBe(200);

			const listed = await api('users/flashs', { userId: owner.id, limit: 100 });
			expect(listed.status).toBe(200);
			assert.ok(listed.body.some((f: any) => f.id === pub.body.id));
			assert.ok(!listed.body.some((f: any) => f.id === priv.body.id));
			expect(listed.body.find((f: any) => f.id === pub.body.id)!.isLiked).toBe(undefined);
		});

		test('users/gallery/posts はページングして投稿を返す', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `hug${suffix}` });
			const fileMd5 = createHash('md5').update(`hono-users-gallery-${suffix}`).digest('hex');
			const file = await createDriveFileInDatabase(db, {
				id: genId(),
				userId: owner.id,
				userHost: null,
				md5: fileMd5,
				name: `hono-users-gallery-${suffix}.png`,
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
					title: `hono users/gallery/posts ${suffix}`,
					fileIds: [file.id],
				},
				owner,
			);
			expect(post.status).toBe(200);

			const listed = await api('users/gallery/posts', { userId: owner.id, limit: 100 });
			expect(listed.status).toBe(200);
			assert.ok(listed.body.some((p: any) => p.id === post.body.id));
		});
	});

	describe('users/search', () => {
		test('users/search はname/username/description一致、origin絞り込み、mute除外、detailスキーマを維持する', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const byName = await signup({ username: `husn${suffix}` });
			await api('i/update', { name: `Search Target ${suffix}` }, byName);

			const byUsername = await signup({ username: `hussrch${suffix}` });

			const byDescription = await signup({ username: `husd${suffix}` });
			await updateUserProfileInDatabase(db, byDescription.id, {
				description: `hono search description marker ${suffix}`,
			});

			const muter = await signup({ username: `husm${suffix}` });
			const muted = await signup({ username: `hussrchmuted${suffix}` });
			const muteRes = await api('mute/create', { userId: muted.id }, muter);
			expect(muteRes.status).toBe(204);

			const byNameResult = await api('users/search', { query: `Search Target ${suffix}` });
			expect(byNameResult.status).toBe(200);
			assert.ok(byNameResult.body.some((u: any) => u.id === byName.id));

			const byUsernameResult = await api('users/search', { query: `@hussrch${suffix}` });
			expect(byUsernameResult.status).toBe(200);
			assert.ok(byUsernameResult.body.some((u: any) => u.id === byUsername.id));

			const byDescriptionResult = await api('users/search', { query: `hono search description marker ${suffix}` });
			expect(byDescriptionResult.status).toBe(200);
			assert.ok(byDescriptionResult.body.some((u: any) => u.id === byDescription.id));

			const mutedIncludedForAnon = await api('users/search', { query: `hussrchmuted${suffix}` });
			expect(mutedIncludedForAnon.status).toBe(200);
			assert.ok(mutedIncludedForAnon.body.some((u: any) => u.id === muted.id));

			const mutedExcludedForMuter = await api('users/search', { query: `hussrchmuted${suffix}` }, muter);
			expect(mutedExcludedForMuter.status).toBe(200);
			assert.ok(!mutedExcludedForMuter.body.some((u: any) => u.id === muted.id));

			const localOnly = await api('users/search', { query: `hussrch${suffix}`, origin: 'local' });
			expect(localOnly.status).toBe(200);
			assert.ok(localOnly.body.some((u: any) => u.id === byUsername.id));

			const remoteOnly = await api('users/search', { query: `hussrch${suffix}`, origin: 'remote' });
			expect(remoteOnly.status).toBe(200);
			assert.ok(!remoteOnly.body.some((u: any) => u.id === byUsername.id));

			const detailed = await api('users/search', { query: `@hussrch${suffix}`, detail: true });
			expect(detailed.status).toBe(200);
			assert.ok(Object.prototype.hasOwnProperty.call(detailed.body[0], 'isLocked'));

			const lite = await api('users/search', { query: `@hussrch${suffix}`, detail: false });
			expect(lite.status).toBe(200);
			assert.ok(!Object.prototype.hasOwnProperty.call(lite.body[0], 'isLocked'));
		});
	});

	describe('users (bare, explorableユーザー一覧)', () => {
		test('isExplorable/isSuspended、origin、hostname、mute除外を維持する', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const explorable = await signup({ username: `hu${suffix}` });

			const notExplorable = await signup({ username: `hune${suffix}` });
			await updateUserInDatabase(db, notExplorable.id, { isExplorable: false });

			const remoteHost = `hono-users-${suffix}.example`;
			const remoteId = genId();
			const remoteUser = await createUserWithProfileAndPublickeyInDatabase(db, {
				user: {
					id: remoteId,
					username: `hurem${suffix}`,
					usernameLower: `hurem${suffix}`,
					host: remoteHost,
					inbox: `https://${remoteHost}/inbox`,
					uri: `https://${remoteHost}/users/${remoteId}`,
					isExplorable: true,
				},
				profile: {
					userId: remoteId,
					userHost: remoteHost,
				},
			});

			const muter = await signup({ username: `hum${suffix}` });
			const muted = await signup({ username: `humt${suffix}` });
			const muteRes = await api('mute/create', { userId: muted.id }, muter);
			expect(muteRes.status).toBe(204);

			// フルスイートでは既存のexplorableユーザーが100件を超えるため、新規作成分を確実に上位に出す
			// sort=+createdAt (id降順) を明示する。
			const all = await api('users', { limit: 100, sort: '+createdAt' });
			expect(all.status).toBe(200);
			assert.ok(all.body.some((u: any) => u.id === explorable.id));
			expect(all.body.some((u: any) => u.id === notExplorable.id)).toBe(false);
			expect(all.body.some((u: any) => u.id === remoteUser.id)).toBe(false);

			const combined = await api('users', { limit: 100, origin: 'combined', sort: '+createdAt' });
			expect(combined.status).toBe(200);
			assert.ok(combined.body.some((u: any) => u.id === remoteUser.id));

			const remoteOnly = await api('users', { limit: 100, origin: 'remote', sort: '+createdAt' });
			expect(remoteOnly.status).toBe(200);
			assert.ok(remoteOnly.body.some((u: any) => u.id === remoteUser.id));
			expect(remoteOnly.body.some((u: any) => u.id === explorable.id)).toBe(false);

			const byHostname = await api('users', { limit: 100, origin: 'combined', hostname: remoteHost });
			expect(byHostname.status).toBe(200);
			assert.ok(byHostname.body.some((u: any) => u.id === remoteUser.id));
			expect(byHostname.body.some((u: any) => u.id === explorable.id)).toBe(false);

			const mutedIncludedForAnon = await api('users', { limit: 100, sort: '+createdAt' });
			assert.ok(mutedIncludedForAnon.body.some((u: any) => u.id === muted.id));

			const mutedExcludedForMuter = await api('users', { limit: 100, sort: '+createdAt' }, muter);
			expect(mutedExcludedForMuter.status).toBe(200);
			expect(mutedExcludedForMuter.body.some((u: any) => u.id === muted.id)).toBe(false);
		});

		test('sort=+followerとstate=aliveを維持する', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			// フルスイートでは既存ユーザーのfollowersCountが不定のため、飛び抜けた値で先頭固定を保証する。
			const popular = await signup({ username: `hup${suffix}` });
			await updateUserInDatabase(db, popular.id, { followersCount: 999999999, updatedAt: new Date() });

			const stale = await signup({ username: `hus${suffix}` });
			await updateUserInDatabase(db, stale.id, { updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10) });

			const sorted = await api('users', { limit: 1, sort: '+follower' });
			expect(sorted.status).toBe(200);
			expect(sorted.body[0]?.id).toBe(popular.id);

			const alive = await api('users', { limit: 100, state: 'alive', sort: '+createdAt' });
			expect(alive.status).toBe(200);
			assert.ok(alive.body.some((u: any) => u.id === popular.id));
			expect(alive.body.some((u: any) => u.id === stale.id)).toBe(false);
		});
	});

	describe('users/search-by-username-and-host', () => {
		test('username/hostによる前方一致検索、ログイン時のフォロー優先、detailスキーマを維持する', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const target = await signup({ username: `hsbuh${suffix}` });
			const otherPrefixed = await signup({ username: `hsbuh${suffix}x` });
			const searcher = await signup({ username: `hsbuhs${suffix}` });
			const remoteHost = `hono-sbuh-${suffix}.example`;
			const remoteId = genId();
			const remoteUser = await createUserWithProfileAndPublickeyInDatabase(db, {
				user: {
					id: remoteId,
					username: `remote${suffix}`,
					usernameLower: `remote${suffix}`,
					host: remoteHost,
					inbox: `https://${remoteHost}/inbox`,
					uri: `https://${remoteHost}/users/${remoteId}`,
				},
				profile: {
					userId: remoteId,
					userHost: remoteHost,
				},
			});

			const byUsername = await api('users/search-by-username-and-host', { username: `hsbuh${suffix}`, limit: 100 });
			expect(byUsername.status).toBe(200);
			assert.ok(byUsername.body.some((u: any) => u.id === target.id));
			assert.ok(byUsername.body.some((u: any) => u.id === otherPrefixed.id));

			const byHost = await api('users/search-by-username-and-host', { host: remoteHost, limit: 100 });
			expect(byHost.status).toBe(200);
			assert.ok(byHost.body.some((u: any) => u.id === remoteUser.id));

			await api('following/create', { userId: target.id }, searcher);
			const followedFirst = await api(
				'users/search-by-username-and-host',
				{ username: `hsbuh${suffix}`, limit: 1 },
				searcher,
			);
			expect(followedFirst.status).toBe(200);
			expect(getAt(followedFirst.body, 0).id).toBe(target.id);

			// @ts-expect-error params must include username or host
			const missingBoth = await api('users/search-by-username-and-host', { limit: 10 });
			expect(missingBoth.status).toBe(400);

			const detailed = await api('users/search-by-username-and-host', { username: `hsbuh${suffix}`, detail: true });
			expect(detailed.status).toBe(200);
			assert.ok(Object.prototype.hasOwnProperty.call(getAt(detailed.body, 0), 'isLocked'));

			const lite = await api('users/search-by-username-and-host', { username: `hsbuh${suffix}`, detail: false });
			expect(lite.status).toBe(200);
			assert.ok(!Object.prototype.hasOwnProperty.call(getAt(lite.body, 0), 'isLocked'));
		});
	});

	describe('users/get-following-users-by-birthday', () => {
		test('単一birthday指定と範囲指定でフォロー中ユーザーを誕生日順に返す', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const me = await signup({ username: `hgfb${suffix}` });
			const followee1 = await signup({ username: `hgfb1${suffix}` });
			const followee2 = await signup({ username: `hgfb2${suffix}` });
			const notFollowed = await signup({ username: `hgfb3${suffix}` });

			await api('i/update', { birthday: '2000-06-15' }, followee1);
			await api('i/update', { birthday: '2000-06-20' }, followee2);
			await api('i/update', { birthday: '2000-06-16' }, notFollowed);

			await api('following/create', { userId: followee1.id }, me);
			await api('following/create', { userId: followee2.id }, me);

			const single = await api(
				'users/get-following-users-by-birthday',
				{
					birthday: { month: 6, day: 15 },
				},
				me,
			);
			expect(single.status).toBe(200);
			expect(single.body.length).toBe(1);
			expect(getAt(single.body, 0).id).toBe(followee1.id);
			expect(getAt(single.body, 0).user.id).toBe(followee1.id);

			const range = await api(
				'users/get-following-users-by-birthday',
				{
					birthday: { begin: { month: 6, day: 14 }, end: { month: 6, day: 21 } },
				},
				me,
			);
			expect(range.status).toBe(200);
			expect(range.body.map((u: any) => u.id)).toStrictEqual([followee1.id, followee2.id]);
			assert.ok(!range.body.some((u: any) => u.id === notFollowed.id));

			const unauthorized = await api('users/get-following-users-by-birthday', { birthday: { month: 6, day: 15 } });
			expect(unauthorized.status).toBe(401);
			expect(castAsError(unauthorized.body as any).error.code).toBe('CREDENTIAL_REQUIRED');
		});
	});

	describe('users/recommendation', () => {
		test('鍵垢/非表示/凍結済み/削除済み/フォロー済み/リモート/自分自身を除外したおすすめユーザーを返す', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const me = await signup({ username: `hur${suffix}` });
			const candidate = await signup({ username: `hurc${suffix}` });
			await updateUserInDatabase(db, candidate.id, { updatedAt: new Date() });
			const lockedUser = await signup({ username: `hurl${suffix}` });
			await updateUserInDatabase(db, lockedUser.id, { isLocked: true, updatedAt: new Date() });
			const notExplorable = await signup({ username: `hurn${suffix}` });
			await updateUserInDatabase(db, notExplorable.id, { isExplorable: false, updatedAt: new Date() });
			const suspendedUser = await signup({ username: `hurs${suffix}` });
			await updateUserInDatabase(db, suspendedUser.id, { isSuspended: true, updatedAt: new Date() });
			const deletedUser = await signup({ username: `hurd${suffix}` });
			await updateUserInDatabase(db, deletedUser.id, { isDeleted: true, updatedAt: new Date() });
			const alreadyFollowed = await signup({ username: `huraf${suffix}` });
			await updateUserInDatabase(db, alreadyFollowed.id, { updatedAt: new Date() });
			await api('following/create', { userId: alreadyFollowed.id }, me);
			const remoteHost = `hono-recommend-${suffix}.example`;
			const remoteId = genId();
			await createUserWithProfileAndPublickeyInDatabase(db, {
				user: {
					id: remoteId,
					username: `hurr${suffix}`,
					usernameLower: `hurr${suffix}`,
					host: remoteHost,
					inbox: `https://${remoteHost}/inbox`,
					uri: `https://${remoteHost}/users/${remoteId}`,
					updatedAt: new Date(),
				},
				profile: {
					userId: remoteId,
					userHost: remoteHost,
				},
			});

			const res = await api('users/recommendation', { limit: 100 }, me);
			expect(res.status).toBe(200);
			const ids = res.body.map((u: any) => u.id);
			assert.ok(ids.includes(candidate.id));
			assert.ok(!ids.includes(lockedUser.id));
			assert.ok(!ids.includes(notExplorable.id));
			assert.ok(!ids.includes(suspendedUser.id));
			assert.ok(!ids.includes(deletedUser.id));
			assert.ok(!ids.includes(alreadyFollowed.id));
			assert.ok(!ids.includes(remoteId));
			assert.ok(!ids.includes(me.id));

			const unauthorized = await api('users/recommendation', {});
			expect(unauthorized.status).toBe(401);
			expect(castAsError(unauthorized.body as any).error.code).toBe('CREDENTIAL_REQUIRED');
		});
	});

	describe('users/get-frequently-replied-users', () => {
		test('返信頻度に応じたweightでユーザーを返し、返信が無い場合は空配列、存在しないユーザーはNO_SUCH_USERになる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hgfr${suffix}` });
			const frequentTarget = await signup({ username: `hgfrf${suffix}` });
			const rareTarget = await signup({ username: `hgfrr${suffix}` });
			const neverReplied = await signup({ username: `hgfrn${suffix}` });

			const frequentNote1 = await post(frequentTarget, { text: 'freq target 1' });
			const frequentNote2 = await post(frequentTarget, { text: 'freq target 2' });
			const rareNote = await post(rareTarget, { text: 'rare target' });

			await post(author, { text: 'reply 1', replyId: frequentNote1.id });
			await post(author, { text: 'reply 2', replyId: frequentNote2.id });
			await post(author, { text: 'reply 3', replyId: rareNote.id });

			const res = await api('users/get-frequently-replied-users', { userId: author.id, limit: 100 });
			expect(res.status).toBe(200);
			const byUserId = new Map(res.body.map((r: any) => [r.user.id, r.weight]));
			expect(byUserId.get(frequentTarget.id)).toBe(1);
			expect(byUserId.get(rareTarget.id)).toBe(0.5);

			const empty = await api('users/get-frequently-replied-users', { userId: neverReplied.id });
			expect(empty.status).toBe(200);
			expect(empty.body).toStrictEqual([]);

			const noSuchUser = await api('users/get-frequently-replied-users', { userId: genId() });
			expect(noSuchUser.status).toBe(400);
			expect(castAsError(noSuchUser.body as any).error.code).toBe('NO_SUCH_USER');
		});
	});

	describe('users/reactions', () => {
		test('公開範囲、リモートユーザー、ブロック、moderatorバイパスを維持する', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `hurx${suffix}` });
			const stranger = await signup({ username: `hurxs${suffix}` });
			const noteAuthor = await signup({ username: `hurxn${suffix}` });
			const note = await post(noteAuthor, { text: 'hono users/reactions target' });
			const reacted = await api('notes/reactions/create', { noteId: note.id, reaction: '🚀' }, owner);
			expect(reacted.status).toBe(204);

			const strangerSeesPublic = await api('users/reactions', { userId: owner.id }, stranger);
			expect(strangerSeesPublic.status).toBe(200);
			expect(strangerSeesPublic.body.length).toBe(1);
			expect(getAt(strangerSeesPublic.body, 0).note.id).toBe(note.id);
			expect(getAt(strangerSeesPublic.body, 0).user.id).toBe(owner.id);

			await api('i/update', { publicReactions: false }, owner);

			const strangerDenied = await api('users/reactions', { userId: owner.id }, stranger);
			expect(strangerDenied.status).toBe(400);
			expect(castAsError(strangerDenied.body as any).error.code).toBe('REACTIONS_NOT_PUBLIC');

			const ownerSeesSelf = await api('users/reactions', { userId: owner.id }, owner);
			expect(ownerSeesSelf.status).toBe(200);
			expect(ownerSeesSelf.body.length).toBe(1);

			const moderatorRole = await role(alice, { name: `hono users/reactions moderator ${suffix}`, isModerator: true });
			await createRoleAssignmentInDatabase(db, {
				id: genId(),
				roleId: moderatorRole.id,
				userId: stranger.id,
				expiresAt: null,
			});
			const moderatorSees = await api('users/reactions', { userId: owner.id }, stranger);
			expect(moderatorSees.status).toBe(200);
			expect(moderatorSees.body.length).toBe(1);

			const remoteHost = `hono-reactions-${suffix}.example`;
			const remoteId = genId();
			await createUserWithProfileAndPublickeyInDatabase(db, {
				user: {
					id: remoteId,
					username: `hurxr${suffix}`,
					usernameLower: `hurxr${suffix}`,
					host: remoteHost,
					inbox: `https://${remoteHost}/inbox`,
					uri: `https://${remoteHost}/users/${remoteId}`,
					updatedAt: new Date(),
				},
				profile: {
					userId: remoteId,
					userHost: remoteHost,
				},
			});
			const nonModeratorRemote = await signup({ username: `hurxnm${suffix}` });
			const remoteDenied = await api('users/reactions', { userId: remoteId }, nonModeratorRemote);
			expect(remoteDenied.status).toBe(400);
			expect(castAsError(remoteDenied.body as any).error.code).toBe('IS_REMOTE_USER');

			const blocker = await signup({ username: `hurxb${suffix}` });
			await api('i/update', { publicReactions: true }, blocker);
			const blockerReacted = await api('notes/reactions/create', { noteId: note.id, reaction: '👍' }, blocker);
			expect(blockerReacted.status).toBe(204);
			const blockedViewer = await signup({ username: `hurxbv${suffix}` });
			const nonBlockedView = await api('users/reactions', { userId: blocker.id }, blockedViewer);
			expect(nonBlockedView.status).toBe(200);
			expect(nonBlockedView.body.length).toBe(1);
			await api('blocking/create', { userId: blockedViewer.id }, blocker);
			const blockedResult = await api('users/reactions', { userId: blocker.id }, blockedViewer);
			expect(blockedResult.status).toBe(200);
			expect(blockedResult.body).toStrictEqual([]);
		});
	});

	describe('users/featured-notes', () => {
		const FEATURED_EPOCH = new Date('2023-01-01T00:00:00Z').getTime();
		const PER_USER_NOTES_RANKING_WINDOW = 1000 * 60 * 60 * 24 * 7;

		function currentFeaturedWindow() {
			return Math.floor((Date.now() - FEATURED_EPOCH) / PER_USER_NOTES_RANKING_WINDOW);
		}

		// ランキング書き込みは確率的に行われるため、Redis ZSETに直接書き込んで
		// 読み取りロジックだけを決定的に検証する。
		test('per-userランキングに載ったノートをid降順で返し、untilId絞り込み、ブロックによる早期returnを維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const owner = await signup({ username: `hufn${suffix}` });
			const noteOld = await post(owner, { text: 'hono featured old' });
			const noteNew = await post(owner, { text: 'hono featured new' });

			const redis = createRedisClient(config);
			try {
				const key = `featuredPerUserNotesRanking:${owner.id}:${currentFeaturedWindow()}`;
				await redis.zadd(key, 5, noteOld.id);
				await redis.zadd(key, 3, noteNew.id);

				const res = await api('users/featured-notes', { userId: owner.id, limit: 100 });
				expect(res.status).toBe(200);
				const ids = res.body.map((n: any) => n.id);
				assert.ok(ids.includes(noteOld.id));
				assert.ok(ids.includes(noteNew.id));
				assert.ok(ids.indexOf(noteNew.id) < ids.indexOf(noteOld.id));

				const untilFiltered = await api('users/featured-notes', { userId: owner.id, untilId: noteNew.id, limit: 100 });
				expect(untilFiltered.status).toBe(200);
				assert.ok(!untilFiltered.body.some((n: any) => n.id === noteNew.id));

				const blocker = await signup({ username: `hufnb${suffix}` });
				const blockerNote = await post(blocker, { text: 'hono featured blocker note' });
				const blockerKey = `featuredPerUserNotesRanking:${blocker.id}:${currentFeaturedWindow()}`;
				await redis.zadd(blockerKey, 1, blockerNote.id);
				const blockedViewer = await signup({ username: `hufnbv${suffix}` });
				await api('blocking/create', { userId: blockedViewer.id }, blocker);
				const blockedResult = await api('users/featured-notes', { userId: blocker.id }, blockedViewer);
				expect(blockedResult.status).toBe(200);
				expect(blockedResult.body).toStrictEqual([]);
			} finally {
				await closeRedisConnection(redis);
			}
		});
	});

	describe('users/notes', () => {
		test('可視性フィルタとwithFiles/withRenotesフィルタを維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hun${suffix}` });
			const stranger = await signup({ username: `huns${suffix}` });
			const file = await uploadFile(author);

			const publicNoteId = genId();
			await createNoteInDatabase(db, {
				id: publicNoteId,
				text: 'users/notes public',
				userId: author.id,
				userHost: null,
				visibility: 'public',
			});
			const specifiedNoteId = genId();
			await createNoteInDatabase(db, {
				id: specifiedNoteId,
				text: 'users/notes specified',
				userId: author.id,
				userHost: null,
				visibility: 'specified',
				visibleUserIds: [stranger.id],
			});

			const asAnon = await api('users/notes', { userId: author.id, limit: 100 });
			expect(asAnon.status).toBe(200);
			assert.ok(asAnon.body.some((n: any) => n.id === publicNoteId));
			expect(asAnon.body.some((n: any) => n.id === specifiedNoteId)).toBe(false);

			const asVisibleUser = await api('users/notes', { userId: author.id, limit: 100 }, stranger);
			expect(asVisibleUser.status).toBe(200);
			assert.ok(asVisibleUser.body.some((n: any) => n.id === specifiedNoteId));

			const fileNoteId = genId();
			await createNoteInDatabase(db, {
				id: fileNoteId,
				text: null,
				userId: author.id,
				userHost: null,
				visibility: 'public',
				fileIds: [file.body!.id],
			});
			const withFiles = await api('users/notes', { userId: author.id, withFiles: true, limit: 100 });
			expect(withFiles.status).toBe(200);
			assert.ok(withFiles.body.some((n: any) => n.id === fileNoteId));
			expect(withFiles.body.some((n: any) => n.id === publicNoteId)).toBe(false);

			const pureRenoteId = genId();
			await createNoteInDatabase(db, {
				id: pureRenoteId,
				text: null,
				userId: author.id,
				userHost: null,
				visibility: 'public',
				renoteId: publicNoteId,
			});
			const withoutRenotes = await api('users/notes', { userId: author.id, withRenotes: false, limit: 100 });
			expect(withoutRenotes.status).toBe(200);
			expect(withoutRenotes.body.some((n: any) => n.id === pureRenoteId)).toBe(false);
			assert.ok(withoutRenotes.body.some((n: any) => n.id === publicNoteId));
		});

		test('withChannelNotesとミュート済みチャンネルの除外を維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hunc${suffix}` });
			const viewer = await signup({ username: `huncv${suffix}` });

			const channel = await createChannelInDatabase(db, {
				id: genId(),
				userId: author.id,
				name: `${suffix}-channel`,
			});
			const channelNoteId = genId();
			await createNoteInDatabase(db, {
				id: channelNoteId,
				text: 'users/notes channel note',
				userId: author.id,
				userHost: null,
				visibility: 'public',
				channelId: channel.id,
			});

			const withoutChannelNotes = await api('users/notes', { userId: author.id, limit: 100 });
			expect(withoutChannelNotes.status).toBe(200);
			expect(withoutChannelNotes.body.some((n: any) => n.id === channelNoteId)).toBe(false);

			const withChannelNotes = await api('users/notes', { userId: author.id, withChannelNotes: true, limit: 100 });
			expect(withChannelNotes.status).toBe(200);
			assert.ok(withChannelNotes.body.some((n: any) => n.id === channelNoteId));

			await createChannelMutingInDatabase(db, {
				id: genId(),
				userId: viewer.id,
				channelId: channel.id,
				expiresAt: null,
			});
			const asMutingViewer = await api(
				'users/notes',
				{ userId: author.id, withChannelNotes: true, limit: 100 },
				viewer,
			);
			expect(asMutingViewer.status).toBe(200);
			expect(asMutingViewer.body.some((n: any) => n.id === channelNoteId)).toBe(false);
		});

		test('BOTH_WITH_REPLIES_AND_WITH_FILESと、対象からブロックされている場合は空配列を維持する', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hunb${suffix}` });
			const blockedViewer = await signup({ username: `hunbv${suffix}` });

			const bothError = await api('users/notes', { userId: author.id, withReplies: true, withFiles: true });
			expect(bothError.status).toBe(400);
			expect(castAsError(bothError.body as any).error.code).toBe('BOTH_WITH_REPLIES_AND_WITH_FILES');
			expect(castAsError(bothError.body as any).error.id).toBe('91c8cb9f-36ed-46e7-9ca2-7df96ed6e222');

			await api('blocking/create', { userId: blockedViewer.id }, author);
			const asBlockedViewer = await api('users/notes', { userId: author.id, limit: 100 }, blockedViewer);
			expect(asBlockedViewer.status).toBe(200);
			expect(asBlockedViewer.body).toStrictEqual([]);
		});

		test('sinceId/untilIdによるページネーションを維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hunp${suffix}` });

			const oldNoteId = genId();
			await createNoteInDatabase(db, {
				id: oldNoteId,
				text: 'users/notes pagination old',
				userId: author.id,
				userHost: null,
				visibility: 'public',
			});
			const newNoteId = genId();
			await createNoteInDatabase(db, {
				id: newNoteId,
				text: 'users/notes pagination new',
				userId: author.id,
				userHost: null,
				visibility: 'public',
			});

			const afterOld = await api('users/notes', { userId: author.id, sinceId: oldNoteId, limit: 100 });
			expect(afterOld.status).toBe(200);
			assert.ok(afterOld.body.some((n: any) => n.id === newNoteId));
			expect(afterOld.body.some((n: any) => n.id === oldNoteId)).toBe(false);

			const beforeNew = await api('users/notes', { userId: author.id, untilId: newNoteId, limit: 100 });
			expect(beforeNew.status).toBe(200);
			assert.ok(beforeNew.body.some((n: any) => n.id === oldNoteId));
			expect(beforeNew.body.some((n: any) => n.id === newNoteId)).toBe(false);
		});

		test('withReplies指定に応じて他人へのリプライの包含が切り替わる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hunr${suffix}` });
			const other = await signup({ username: `hunro${suffix}` });
			const rootNote = await post(other, { text: 'users/notes withReplies root', visibility: 'public' });
			// author の userTimeline (Redis) を空にしないための通常投稿。空だとDBフォールバックになり、
			// DB フォールバック経路ではリプライを除外しない。
			const normalNoteId = (await post(author, { text: 'users/notes withReplies normal', visibility: 'public' })).id;
			const replyNoteId = (
				await post(author, { text: 'users/notes withReplies reply', visibility: 'public', replyId: rootNote.id })
			).id;

			const withRepliesFalse = await api('users/notes', { userId: author.id, withReplies: false, limit: 100 });
			expect(withRepliesFalse.status).toBe(200);
			assert.ok(withRepliesFalse.body.some((n: any) => n.id === normalNoteId));
			expect(withRepliesFalse.body.some((n: any) => n.id === replyNoteId)).toBe(false);

			const withRepliesTrue = await api('users/notes', { userId: author.id, withReplies: true, limit: 100 });
			expect(withRepliesTrue.status).toBe(200);
			assert.ok(withRepliesTrue.body.some((n: any) => n.id === replyNoteId));
		});
	});

	describe('i/update', () => {
		test('アカウント設定を更新できる', async () => {
			const myName = '大室櫻子';
			const myLocation = '七森中';
			const myBirthday = '2000-09-07';

			const res = await api(
				'i/update',
				{
					name: myName,
					location: myLocation,
					birthday: myBirthday,
				},
				alice,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
			expect(res.body.name).toBe(myName);
			expect(res.body.location).toBe(myLocation);
			expect(res.body.birthday).toBe(myBirthday);
		});

		test('名前を空白のみにした場合nullになる', async () => {
			const res = await api(
				'i/update',
				{
					name: ' ',
				},
				alice,
			);
			expect(res.status).toBe(200);
			expect(res.body.name).toBe(null);
		});

		test('名前の前後に空白（ホワイトスペース）を入れてもトリムされる', async () => {
			const res = await api(
				'i/update',
				{
					// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#white_space
					name: ' あ い う \u0009\u000b\u000c\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\ufeff',
				},
				alice,
			);
			expect(res.status).toBe(200);
			expect(res.body.name).toBe('あ い う');
		});

		test('誕生日の設定を削除できる', async () => {
			await api(
				'i/update',
				{
					birthday: '2000-09-07',
				},
				alice,
			);

			const res = await api(
				'i/update',
				{
					birthday: null,
				},
				alice,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
			expect(res.body.birthday).toBe(null);
		});

		test('不正な誕生日の形式で怒られる', async () => {
			const res = await api(
				'i/update',
				{
					birthday: '2000/09/07',
				},
				alice,
			);
			expect(res.status).toBe(400);
		});
	});

	describe('users/show', () => {
		test('ユーザーが取得できる', async () => {
			const res = await api(
				'users/show',
				{
					userId: alice.id,
				},
				alice,
			);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
			expect((res.body as unknown as { id: string }).id).toBe(alice.id);
		});

		test('ユーザーが存在しなかったら怒る', async () => {
			const res = await api('users/show', {
				userId: '000000000000000000000000',
			});
			expect(res.status).toBe(404);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('users/show', {
				userId: 'kyoppie',
			});
			expect(res.status).toBe(404);
		});
	});

	describe('users/followers', () => {
		test('フォロワーが取得できる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const followee = await signup({ username: `hnflwee${suffix}` });
			const follower = await signup({ username: `hnflwer${suffix}` });
			await api('following/create', { userId: followee.id }, follower);

			const res = await api('users/followers', { userId: followee.id }, followee);

			expect(res.status).toBe(200);
			expect(res.body.length).toBe(1);
			expect(getAt(res.body, 0).followerId).toBe(follower.id);
		});

		test('ユーザーが存在しなかったら怒る', async () => {
			const res = await api('users/followers', { userId: '000000000000000000000000' });
			expect(res.status).toBe(400);
			expect(castAsError(res.body as unknown as Record<string, unknown>).error.code).toBe('NO_SUCH_USER');
		});
	});

	describe('users/following', () => {
		test('フォロー中のユーザーが取得できる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const followee = await signup({ username: `hnflge${suffix}` });
			const follower = await signup({ username: `hnflgr${suffix}` });
			await api('following/create', { userId: followee.id }, follower);

			const res = await api('users/following', { userId: follower.id }, follower);

			expect(res.status).toBe(200);
			expect(res.body.length).toBe(1);
			expect(getAt(res.body, 0).followeeId).toBe(followee.id);
		});

		test('不正なbirthday形式で怒られる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const follower = await signup({ username: `hnflgb${suffix}` });

			const res = await api('users/following', { userId: follower.id, birthday: 'not-a-date' });

			expect(res.status).toBe(400);
		});

		test('birthdayでフォロー中ユーザーを絞り込める', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const follower = await signup({ username: `hnflgbd${suffix}` });
			const matchingFollowee = await signup({ username: `hnflgbdm${suffix}` });
			const otherFollowee = await signup({ username: `hnflgbdo${suffix}` });

			await api('i/update', { birthday: '2000-06-15' }, matchingFollowee);
			await api('i/update', { birthday: '2000-07-20' }, otherFollowee);
			await api('following/create', { userId: matchingFollowee.id }, follower);
			await api('following/create', { userId: otherFollowee.id }, follower);

			const res = await api('users/following', { userId: follower.id, birthday: '2024-06-15' }, follower);

			expect(res.status).toBe(200);
			expect(res.body.length).toBe(1);
			expect(getAt(res.body, 0).followeeId).toBe(matchingFollowee.id);
		});

		test('ユーザーが存在しなかったら怒る', async () => {
			const res = await api('users/following', { userId: '000000000000000000000000' });
			expect(res.status).toBe(400);
			expect(castAsError(res.body as unknown as Record<string, unknown>).error.code).toBe('NO_SUCH_USER');
		});
	});

	describe('users/lists/create', () => {
		test('リストが作成できる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnlstc${suffix}` });

			const res = await api('users/lists/create', { name: 'my list' }, user);

			expect(res.status).toBe(200);
			expect(res.body.name).toBe('my list');
			expect(res.body.userIds).toStrictEqual([]);
		});

		test('空文字列の名前で怒られる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnlstc2${suffix}` });

			const res = await api('users/lists/create', { name: '' }, user);

			expect(res.status).toBe(400);
		});
	});

	describe('i/pin, i/unpin', () => {
		test('ノートをピン留めできる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnpin${suffix}` });
			const note = await post(user, { text: 'test' });

			const res = await api('i/pin', { noteId: note.id }, user);

			expect(res.status).toBe(200);
			const pinings = await listUserNotePiningsByUserIdFromDatabase(db, user.id);
			expect(pinings.length).toBe(1);
			expect(getAt(pinings, 0).noteId).toBe(note.id);
		});

		test('同じノートを二重にピン留めできない', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnpin2${suffix}` });
			const note = await post(user, { text: 'test' });
			await api('i/pin', { noteId: note.id }, user);

			const res = await api('i/pin', { noteId: note.id }, user);

			expect(res.status).toBe(400);
			expect(castAsError(res.body).error.code).toBe('ALREADY_PINNED');
		});

		test('存在しないノートはピン留めできない', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnpin3${suffix}` });

			const res = await api('i/pin', { noteId: '000000000000000000000000' }, user);

			expect(res.status).toBe(400);
			expect(castAsError(res.body).error.code).toBe('NO_SUCH_NOTE');
		});

		test('ピン留めを解除できる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnunpin${suffix}` });
			const note = await post(user, { text: 'test' });
			await api('i/pin', { noteId: note.id }, user);

			const res = await api('i/unpin', { noteId: note.id }, user);

			expect(res.status).toBe(200);
			const pinings = await listUserNotePiningsByUserIdFromDatabase(db, user.id);
			expect(pinings.length).toBe(0);
		});
	});

	describe('i/notifications', () => {
		test('includeTypesで指定したtypeの通知のみ返る', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const followee = await signup({ username: `hnnfie${suffix}` });
			const follower = await signup({ username: `hnnfir${suffix}` });
			await api('following/create', { userId: followee.id }, follower);
			const res = await vi.waitFor(async () => {
				const found = await api('i/notifications', { includeTypes: ['follow'] }, followee);
				expect(found.status).toBe(200);
				expect(found.body.length).toBe(1);
				return found;
			}, POLL);

			expect(getAt(res.body, 0).type).toBe('follow');
		});

		test('excludeTypesで指定したtypeの通知が除外される', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const followee = await signup({ username: `hnnexe${suffix}` });
			const follower = await signup({ username: `hnnexr${suffix}` });
			await api('following/create', { userId: followee.id }, follower);
			// 通知が作られる前に読むと、除外されたのか未作成なのか区別できず素通りする
			await vi.waitFor(async () => {
				const created = await api('i/notifications', { includeTypes: ['follow'] }, followee);
				expect(created.body.length).toBe(1);
			}, POLL);

			const res = await api('i/notifications', { excludeTypes: ['follow'] }, followee);

			expect(res.status).toBe(200);
			expect(res.body.length).toBe(0);
		});

		test('includeTypesが空配列の場合、空配列が返る', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const followee = await signup({ username: `hnniee${suffix}` });
			const follower = await signup({ username: `hnnier${suffix}` });
			await api('following/create', { userId: followee.id }, follower);
			// 通知が作られる前に読むと、空配列指定が効いたのか未作成なのか区別できず素通りする
			await vi.waitFor(async () => {
				const created = await api('i/notifications', { includeTypes: ['follow'] }, followee);
				expect(created.body.length).toBe(1);
			}, POLL);

			const res = await api('i/notifications', { includeTypes: [] }, followee);

			expect(res.status).toBe(200);
			expect(res.body.length).toBe(0);
		});
	});

	describe('i/notifications-grouped', () => {
		test('同じノートへの複数のリアクション通知がまとめられる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hngra${suffix}` });
			const reactor1 = await signup({ username: `hngr1${suffix}` });
			const reactor2 = await signup({ username: `hngr2${suffix}` });
			const note = await post(author, { text: 'hi' });
			await api('notes/reactions/create', { noteId: note.id, reaction: '🚀' }, reactor1);
			await api('notes/reactions/create', { noteId: note.id, reaction: '👍' }, reactor2);
			const grouped = await vi.waitFor(async () => {
				const res = await api('i/notifications-grouped', {}, author);
				expect(res.status).toBe(200);
				const found = res.body.filter((n: any) => n.type === 'reaction:grouped') as any[];
				expect(found.length).toBe(1);
				expect(found[0].reactions.length).toBe(2);
				return found;
			}, POLL);

			const userIds = grouped[0].reactions.map((r: any) => r.user.id);
			assert.ok(userIds.includes(reactor1.id));
			assert.ok(userIds.includes(reactor2.id));
		});

		test('同じノートへの複数のリノート通知がまとめられる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const author = await signup({ username: `hngna${suffix}` });
			const renoter1 = await signup({ username: `hngn1${suffix}` });
			const renoter2 = await signup({ username: `hngn2${suffix}` });
			const note = await post(author, { text: 'hi' });
			await post(renoter1, { renoteId: note.id });
			await post(renoter2, { renoteId: note.id });
			const grouped = await vi.waitFor(async () => {
				const res = await api('i/notifications-grouped', {}, author);
				expect(res.status).toBe(200);
				const found = res.body.filter((n: any) => n.type === 'renote:grouped') as any[];
				expect(found.length).toBe(1);
				expect(found[0].users.length).toBe(2);
				return found;
			}, POLL);

			const userIds = grouped[0].users.map((u: any) => u.id);
			assert.ok(userIds.includes(renoter1.id));
			assert.ok(userIds.includes(renoter2.id));
		});
	});

	describe('i/favorites', () => {
		test('お気に入りに登録したノートが取得できる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnfav${suffix}` });
			const note = await post(user, { text: 'test' });
			await api('notes/favorites/create', { noteId: note.id }, user);

			const res = await api('i/favorites', {}, user);

			expect(res.status).toBe(200);
			expect(res.body.length).toBe(1);
			expect(getAt(res.body, 0).noteId).toBe(note.id);
			expect(getAt(res.body, 0).note.id).toBe(note.id);
		});

		test('お気に入りがない場合は空配列が返る', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnfav2${suffix}` });

			const res = await api('i/favorites', {}, user);

			expect(res.status).toBe(200);
			expect(res.body).toStrictEqual([]);
		});
	});

	describe('i/change-password', () => {
		test('パスワードを変更できる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hncp${suffix}`, password: 'oldpassword' });

			const res = await api('i/change-password', { currentPassword: 'oldpassword', newPassword: 'newpassword' }, user);
			expect(res.status).toBe(204);

			const relogged = await api('signin-flow', {
				username: user.username,
				password: 'newpassword',
				'g-recaptcha-response': null,
				'hcaptcha-response': null,
			});
			expect(relogged.status).toBe(200);
			expect(relogged.body.finished).toBe(true);
		});

		test('現在のパスワードが間違っていると失敗する', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hncp2${suffix}`, password: 'oldpassword' });

			const res = await api(
				'i/change-password',
				{ currentPassword: 'wrongpassword', newPassword: 'newpassword' },
				user,
			);
			expect(res.status).not.toBe(204);
		});
	});

	describe('i/regenerate-token', () => {
		test('トークンを再生成できる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnrt${suffix}`, password: 'password' });
			const before = await api('i', {}, user);

			const res = await api('i/regenerate-token', { password: 'password' }, user);
			expect(res.status).toBe(204);

			const withOldToken = await api('i', {}, user);
			expect(withOldToken.status).toBe(401);

			expect(before.status).toBe(200);
		});
	});

	describe('i/update-email', () => {
		test('メールアドレスを更新できる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnue${suffix}`, password: 'password' });

			const res = await api('i/update-email', { password: 'password', email: `hnue${suffix}@example.com` }, user);

			expect(res.status).toBe(200);
			expect(res.body.email).toBe(`hnue${suffix}@example.com`);
			expect(res.body.emailVerified).toBe(false);
		});

		test('パスワードが間違っていると失敗する', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnue2${suffix}`, password: 'password' });

			const res = await api('i/update-email', { password: 'wrongpassword', email: `hnue2${suffix}@example.com` }, user);

			expect(res.status).toBe(400);
			expect(castAsError(res.body).error.code).toBe('INCORRECT_PASSWORD');
		});
	});

	describe('i/delete-account', () => {
		test('アカウントを削除できる', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnda${suffix}`, password: 'password' });

			const res = await api('i/delete-account', { password: 'password' }, user);
			expect(res.status).toBe(204);

			const deletedUser = await fetchUserByIdOrFailFromDatabase(db, user.id);
			expect(deletedUser.isDeleted).toBe(true);
		});

		test('パスワードが間違っていると失敗する', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnda2${suffix}`, password: 'password' });

			const res = await api('i/delete-account', { password: 'wrongpassword' }, user);
			expect(res.status).not.toBe(204);

			const notDeletedUser = await fetchUserByIdOrFailFromDatabase(db, user.id);
			expect(notDeletedUser.isDeleted).toBe(false);
		});
	});
});
