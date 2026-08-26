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
	let db: TestDatabase;
	let relationshipQueue: Bull.Queue<RelationshipJobData> | undefined;
	let context: EndpointsContext;

	beforeAll(async () => {
		context = await createEndpointsContext();
		({ alice, db, relationshipQueue } = context);
	}, 1000 * 60 * 2);

	afterAll(async () => {
		await context.close();
	});

	describe('federation endpoints', () => {
		test('instances, show-instance, and stats return packed federation instances', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const alpha = await createInstanceInDatabase(db, {
				id: genId(now),
				host: `hono-fed-alpha-${now}.example`,
				firstRetrievedAt: new Date(now),
				usersCount: 1000001,
				notesCount: 2000001,
				followingCount: 3000001,
				followersCount: 4000001,
				latestRequestReceivedAt: new Date(now + 1000),
				isNotResponding: false,
				suspensionState: 'none',
				softwareName: 'misskey',
				softwareVersion: '2024.5.0',
				openRegistrations: true,
				name: 'Hono Federation Alpha',
				description: 'Hono federation endpoint test instance',
				maintainerName: 'hono maintainer',
				maintainerEmail: 'hono@example.com',
				iconUrl: 'https://example.com/icon.png',
				faviconUrl: null,
				themeColor: '#86b300',
				infoUpdatedAt: new Date(now + 2000),
				moderationNote: 'hidden moderation note',
			});
			const beta = await createInstanceInDatabase(db, {
				id: genId(now + 1),
				host: `hono-fed-beta-${now}.example`,
				firstRetrievedAt: new Date(now + 1),
				usersCount: 1000002,
				notesCount: 2000002,
				followingCount: 5000001,
				followersCount: 3000001,
				latestRequestReceivedAt: null,
				isNotResponding: true,
				suspensionState: 'none',
				softwareName: 'mastodon',
				softwareVersion: '4.3.0',
				openRegistrations: false,
				name: 'Hono Federation Beta',
				description: null,
				maintainerName: null,
				maintainerEmail: null,
				iconUrl: null,
				faviconUrl: 'https://example.com/favicon.ico',
				themeColor: null,
				infoUpdatedAt: null,
				moderationNote: '',
			});

			const instancesQuery = new URLSearchParams({
				limit: '10',
				host: `hono-fed-alpha-${now}`,
				sort: '+followers',
			});
			const instances = await relativeFetch(`api/federation/instances?${instancesQuery.toString()}`);
			expect(instances.status).toBe(200);
			expect(instances.headers.get('cache-control')).toBe('public, max-age=3600');

			const instancesBody = (await instances.json()) as {
				id?: unknown;
				host?: unknown;
				name?: unknown;
				followersCount?: unknown;
				isSuspended?: unknown;
				suspensionState?: unknown;
				softwareName?: unknown;
				infoUpdatedAt?: unknown;
				latestRequestReceivedAt?: unknown;
				moderationNote?: unknown;
			}[];
			const listedAlpha = instancesBody.find((instance) => instance.id === alpha.id);
			assert.ok(listedAlpha);
			expect(listedAlpha.host).toBe(alpha.host);
			expect(listedAlpha.name).toBe(alpha.name);
			expect(listedAlpha.followersCount).toBe(alpha.followersCount);
			expect(listedAlpha.isSuspended).toBe(false);
			expect(listedAlpha.suspensionState).toBe('none');
			expect(listedAlpha.softwareName).toBe(alpha.softwareName);
			expect(listedAlpha.infoUpdatedAt).toBe(alpha.infoUpdatedAt?.toISOString());
			expect(listedAlpha.latestRequestReceivedAt).toBe(alpha.latestRequestReceivedAt?.toISOString());
			expect(listedAlpha.moderationNote).toBe(null);

			const shown = await api('federation/show-instance', { host: alpha.host.toUpperCase() });
			expect(shown.status).toBe(200);
			expect(shown.body?.id).toBe(alpha.id);
			expect(shown.body?.host).toBe(alpha.host);

			const stats = await relativeFetch('api/federation/stats?limit=1');
			expect(stats.status).toBe(200);
			expect(stats.headers.get('cache-control')).toBe('public, max-age=3600');

			const statsBody = (await stats.json()) as {
				topSubInstances?: { id?: unknown }[];
				topPubInstances?: { id?: unknown }[];
				otherFollowersCount?: unknown;
				otherFollowingCount?: unknown;
			};
			expect(statsBody.topSubInstances?.[0]?.id).toBe(alpha.id);
			expect(statsBody.topPubInstances?.[0]?.id).toBe(beta.id);
			expect(typeof statsBody.otherFollowersCount).toBe('number');
			expect(typeof statsBody.otherFollowingCount).toBe('number');
		});

		test('admin/federation/update-instance は suspension、moderationNote、token scope、role、ログを維持する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const host = `hono-admin-fed-${suffix}.example`;
			const instance = await createInstanceInDatabase(db, {
				id: genId(now),
				host,
				firstRetrievedAt: new Date(now),
				suspensionState: 'none',
				moderationNote: 'before update',
			});

			const suspended = await api(
				'admin/federation/update-instance',
				{
					host: host.toUpperCase(),
					isSuspended: true,
					moderationNote: `updated note ${suffix}`,
				},
				alice,
			);
			expect(suspended.status).toBe(204);

			let after = await fetchInstanceByHostFromDatabase(db, host);
			assert.ok(after);
			expect(after.suspensionState).toBe('manuallySuspended');
			expect(after.moderationNote).toBe(`updated note ${suffix}`);

			await vi.waitFor(async () => {
				const [suspendLogs, noteLogs] = await Promise.all([
					listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type: 'suspendRemoteInstance',
						search: instance.id,
					}),
					listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type: 'updateRemoteInstanceNote',
						search: instance.id,
					}),
				]);
				expect(suspendLogs.length).toBeGreaterThan(0);
				expect(noteLogs.length).toBeGreaterThan(0);
				expect(suspendLogs.some((log) => (log.info as any).host === host)).toBe(true);
				expect(
					noteLogs.some(
						(log) =>
							(log.info as any).before === 'before update' && (log.info as any).after === `updated note ${suffix}`,
					),
				).toBe(true);
			}, POLL);

			const token = await createAppToken(alice, ['write:admin:federation']);
			const unsuspended = await api(
				'admin/federation/update-instance',
				{
					host,
					isSuspended: false,
				},
				{ token },
			);
			expect(unsuspended.status).toBe(204);
			after = await fetchInstanceByHostFromDatabase(db, host);
			assert.ok(after);
			expect(after.suspensionState).toBe('none');
			expect(after.moderationNote).toBe(`updated note ${suffix}`);

			const wrongScopeToken = await createAppToken(alice, ['write:admin:user-note']);
			const scopeDenied = await api('admin/federation/update-instance', { host }, { token: wrongScopeToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `haf${suffix}` });
			const roleDenied = await api('admin/federation/update-instance', { host }, normalUser);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
		});

		test('admin/federation/refresh-remote-instance-metadata は即時応答、token scope、roleを維持する', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const host = `hono-refresh-fed-${suffix}.invalid`;
			await createInstanceInDatabase(db, {
				id: genId(now),
				host,
				firstRetrievedAt: new Date(now),
			});

			const refreshed = await api(
				'admin/federation/refresh-remote-instance-metadata',
				{
					host: host.toUpperCase(),
				},
				alice,
			);
			expect(refreshed.status).toBe(204);

			const token = await createAppToken(alice, ['write:admin:federation']);
			const refreshedByToken = await api(
				'admin/federation/refresh-remote-instance-metadata',
				{
					host,
				},
				{ token },
			);
			expect(refreshedByToken.status).toBe(204);

			const wrongScopeToken = await createAppToken(alice, ['write:admin:user-note']);
			const scopeDenied = await api(
				'admin/federation/refresh-remote-instance-metadata',
				{ host },
				{ token: wrongScopeToken },
			);
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `harf${suffix}` });
			const roleDenied = await api('admin/federation/refresh-remote-instance-metadata', { host }, normalUser);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
		});

		test('admin/federation/remove-all-following は remote follower の unfollow job を作る', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const host = `hono-remove-following-${suffix}.example`;
			const follower = await signup({ username: `hafr${suffix}` });
			const followee = await signup({ username: `haft${suffix}` });
			const following = await createFollowingInDatabase(db, {
				id: genId(),
				followerId: follower.id,
				followeeId: followee.id,
				followerHost: host,
			});

			const removed = await api('admin/federation/remove-all-following', { host }, alice);
			expect(removed.status).toBe(204);

			let job: Bull.Job<RelationshipJobData> | undefined;
			await vi.waitFor(async () => {
				const jobs = await relationshipQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
				job = jobs.find(
					(job) =>
						job.name === 'unfollow' &&
						job.data.from.id === following.followerId &&
						job.data.to.id === following.followeeId &&
						job.data.silent === true,
				);
				expect(job).toBeDefined();
			}, POLL);
			assert.ok(job);
			await job.remove();

			const wrongScopeToken = await createAppToken(alice, ['write:admin:user-note']);
			const scopeDenied = await api('admin/federation/remove-all-following', { host }, { token: wrongScopeToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');
		});

		test('federation/users はhostでフィルタしUserDetailedNotMeを返す', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const host = `hono-fed-users-${suffix}.example`;
			const remoteId = genId(now);
			const remoteUser = await createUserWithProfileAndPublickeyInDatabase(db, {
				user: {
					id: remoteId,
					username: `hfu${suffix}`,
					usernameLower: `hfu${suffix}`,
					host,
					inbox: `https://${host}/inbox`,
					uri: `https://${host}/users/${remoteId}`,
				},
				profile: {
					userId: remoteId,
					userHost: host,
				},
			});

			const users = await api('federation/users', { host });
			expect(users.status).toBe(200);
			expect(users.body.length).toBe(1);
			expect(getAt(users.body, 0).id).toBe(remoteUser.id);
			expect(getAt(users.body, 0).host).toBe(host);
			expect('email' in getAt(users.body, 0)).toBe(false);

			const empty = await api('federation/users', { host: `hono-fed-users-none-${suffix}.example` });
			expect(empty.status).toBe(200);
			expect(empty.body.length).toBe(0);
		});

		test('federation/followers と federation/following はhostでフィルタしFollowingを返す', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const remoteFollowerHost = `hono-fed-follower-${suffix}.example`;
			const remoteFolloweeHost = `hono-fed-followee-${suffix}.example`;
			const follower = await signup({ username: `hff${suffix}` });
			const followee = await signup({ username: `hffe${suffix}` });

			await createFollowingInDatabase(db, {
				id: genId(),
				followerId: follower.id,
				followeeId: followee.id,
				followeeHost: remoteFolloweeHost,
			});
			await createFollowingInDatabase(db, {
				id: genId(),
				followerId: followee.id,
				followeeId: follower.id,
				followerHost: remoteFollowerHost,
			});

			const followers = await api('federation/followers', { host: remoteFolloweeHost });
			expect(followers.status).toBe(200);
			expect(followers.body.length).toBe(1);
			expect(followers.body[0]!.followerId).toBe(follower.id);
			expect(followers.body[0]!.followeeId).toBe(followee.id);
			expect(followers.body[0]!.followee!.id).toBe(followee.id);

			const following = await api('federation/following', { host: remoteFollowerHost });
			expect(following.status).toBe(200);
			expect(following.body.length).toBe(1);
			expect(following.body[0]!.followerId).toBe(followee.id);
			expect(following.body[0]!.followeeId).toBe(follower.id);
			expect(following.body[0]!.followee!.id).toBe(follower.id);
		});
	});


	describe('ap/get', () => {
		test('管理者かつread:federationスコープでのみ呼べ、ローカルNote/UserをActivityPubオブジェクトとして解決できる', async () => {
			const config = fixtureConfig;

			const note = await post(alice, { text: 'ap/get resolve target' });
			const noteUri = `${config.instance.url}/notes/${note.id}`;

			const noteRes = await api('ap/get', { uri: noteUri }, alice);
			expect(noteRes.status).toBe(200);
			expect(noteRes.body['type']).toBe('Note');
			expect(noteRes.body['id']).toBe(noteUri);
			const content: unknown = Reflect.get(noteRes.body, 'content');
			if (typeof content !== 'string') throw new Error('ActivityPub Note content is missing');
			assert.ok(content.includes('ap/get resolve target'));

			const userUri = `${config.instance.url}/users/${alice.id}`;
			const userRes = await api('ap/get', { uri: userUri }, alice);
			expect(userRes.status).toBe(200);
			expect(userRes.body['type']).toBe('Person');
			expect(userRes.body['id']).toBe(userUri);
			expect(userRes.body['preferredUsername']).toBe(alice.username);

			const scopeDeniedToken = await createAppToken(alice, ['read:account']);
			const scopeDenied = await api('ap/get', { uri: noteUri }, { token: scopeDeniedToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `honoapget${Date.now().toString(36)}` });
			const roleDenied = await api('ap/get', { uri: noteUri }, normalUser);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
		});

		test('questions/likes/followsのローカルURIも解決できる', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const suffix = now.toString(36);

			const pollNoteId = genId(now);
			await createNoteInDatabase(db, {
				id: pollNoteId,
				text: 'ap/get poll question',
				userId: alice.id,
				userHost: null,
				visibility: 'public',
				hasPoll: true,
			});
			await createPollInDatabase(db, {
				noteId: pollNoteId,
				expiresAt: null,
				multiple: false,
				choices: ['a', 'b'],
				votes: [1, 2],
				noteVisibility: 'public',
				userId: alice.id,
				userHost: null,
			});
			const questionUri = `${config.instance.url}/questions/${pollNoteId}`;
			const questionRes = await api('ap/get', { uri: questionUri }, alice);
			expect(questionRes.status).toBe(200);
			expect(questionRes.body['type']).toBe('Question');
			expect(questionRes.body['id']).toBe(questionUri);
			const choices: unknown = Reflect.get(questionRes.body, 'oneOf');
			if (!Array.isArray(choices)) throw new Error('ActivityPub Question choices are missing');
			expect(
				choices.map((choice: unknown) => {
					assert.ok(typeof choice === 'object' && choice != null);
					return Reflect.get(choice, 'name');
				}),
			).toStrictEqual(['a', 'b']);

			const likeNote = await post(alice, { text: 'ap/get like target' });
			const reactionId = genId(now + 1);
			await createNoteReactionInDatabase(db, {
				id: reactionId,
				noteId: likeNote.id,
				userId: alice.id,
				reaction: '👍',
			});
			const likeUri = `${config.instance.url}/likes/${reactionId}`;
			const likeRes = await api('ap/get', { uri: likeUri }, alice);
			expect(likeRes.status).toBe(200);
			expect(likeRes.body['type']).toBe('Like');
			expect(likeRes.body['id']).toBe(likeUri);
			expect(likeRes.body['object']).toBe(`${config.instance.url}/notes/${likeNote.id}`);

			const remoteHost = `ap-get-remote-${suffix}.example`;
			const remoteFolloweeId = genId(now + 2);
			const remoteFollowee = await createUserWithProfileAndPublickeyInDatabase(db, {
				user: {
					id: remoteFolloweeId,
					username: `apgetremote${suffix}`,
					usernameLower: `apgetremote${suffix}`,
					host: remoteHost,
					uri: `https://${remoteHost}/users/remote`,
					isExplorable: false,
				},
				profile: {
					userId: remoteFolloweeId,
					userHost: remoteHost,
				},
			});
			const followRequest = await createFollowRequestInDatabase(db, {
				id: genId(now + 3),
				followerId: alice.id,
				followeeId: remoteFollowee.id,
			});
			const followUri = `${config.instance.url}/follows/${followRequest.id}`;
			const followRes = await api('ap/get', { uri: followUri }, alice);
			expect(followRes.status).toBe(200);
			expect(followRes.body['type']).toBe('Follow');
			expect(followRes.body['id']).toBe(followUri);
			expect(followRes.body['actor']).toBe(`${config.instance.url}/users/${alice.id}`);
			expect(followRes.body['object']).toBe(remoteFollowee.uri);
		});
	});


	describe('federation/update-remote-user', () => {
		test('リモートアクターを再フェッチしてプロフィールを更新する', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const suffix = now.toString(36);

			let actorServer: Server | undefined;
			let actorUri = '';
			// このVPS環境では slacc (署名用ネイティブモジュール) が壊れており RsaKeyPair.sign が
			// 常に失敗するため (Hono移植とは無関係、Node単体でrequire('slacc')するだけで再現する
			// 環境固有の問題)、signToActivityPubGet を無効化して署名なしGETの経路を検証する。
			// meta はプロセス内にキャッシュされているため、DB直接更新ではなく admin/update-meta 経由で
			// 変更してキャッシュ無効化イベントを発行させる。
			const originalMeta = await fetchMetaFromDatabase(db);
			const disableSigning = await api('admin/update-meta', { signToActivityPubGet: false }, alice);
			expect(disableSigning.status).toBe(204);
			const onePixelPng = Buffer.from(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
				'base64',
			);
			try {
				actorServer = createServer((req, res) => {
					if (req.url === '/avatar.png') {
						res.writeHead(200, { 'Content-Type': 'image/png' });
						res.end(onePixelPng);
						return;
					}
					if (req.url?.endsWith('/following') || req.url?.endsWith('/followers')) {
						res.writeHead(200, { 'Content-Type': 'application/activity+json' });
						res.end(
							JSON.stringify({
								'@context': 'https://www.w3.org/ns/activitystreams',
								id: `${actorUri}${req.url.endsWith('/following') ? '/following' : '/followers'}`,
								type: 'OrderedCollection',
								totalItems: 0,
								orderedItems: [],
							}),
						);
						return;
					}
					res.writeHead(200, { 'Content-Type': 'application/activity+json' });
					res.end(
						JSON.stringify({
							'@context': 'https://www.w3.org/ns/activitystreams',
							id: actorUri,
							type: 'Person',
							preferredUsername: `updateremote${suffix}`,
							inbox: `${actorUri}/inbox`,
							following: `${actorUri}/following`,
							followers: `${actorUri}/followers`,
							icon: { type: 'Image', url: `${actorUri}/avatar.png` },
							name: 'Updated Remote Name',
							summary: '<p>updated bio</p>',
							manuallyApprovesFollowers: true,
						}),
					);
				});
				await new Promise<void>((resolve, reject) => {
					actorServer!.once('error', reject);
					actorServer!.listen(0, '127.0.0.1', () => {
						actorServer!.off('error', reject);
						resolve();
					});
				});
				const address = actorServer.address() as AddressInfo;
				const host = `127.0.0.1:${address.port}`;
				actorUri = `http://${host}/users/updateremote${suffix}`;

				const remoteUserId = genId(now);
				const remoteUser = await createUserWithProfileAndPublickeyInDatabase(db, {
					user: {
						id: remoteUserId,
						username: `updateremote${suffix}`,
						usernameLower: `updateremote${suffix}`,
						host,
						inbox: `${actorUri}/inbox`,
						uri: actorUri,
						name: 'Old Name',
						isLocked: false,
						isExplorable: false,
					},
					profile: {
						userId: remoteUserId,
						userHost: host,
					},
				});

				const res = await api('federation/update-remote-user', { userId: remoteUser.id });
				expect(res.status, JSON.stringify(res.body)).toBe(204);

				const updated = await fetchUserByIdOrFailFromDatabase(db, remoteUser.id);
				expect(updated.name).toBe('Updated Remote Name');
				expect(updated.isLocked).toBe(true);
				assert.ok(updated.avatarId != null);
				assert.ok(updated.avatarUrl != null);

				const profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, remoteUser.id);
				expect(profile.description).toBe('updated bio');
				expect(profile.followingVisibility).toBe('public');
				expect(profile.followersVisibility).toBe('public');
			} finally {
				actorServer?.close();
				await api('admin/update-meta', { signToActivityPubGet: originalMeta.signToActivityPubGet }, alice);
			}
		});

		test('存在しないuserIdは500ではなくNO_SUCH_USERを返す', async () => {
			const res = await api('federation/update-remote-user', { userId: '000000000000000000000000' });
			expect(res.status, JSON.stringify(res.body)).toBe(400);
			expect(castAsError(res.body as any).error.code).toBe('NO_SUCH_USER');
		});

		test('ローカルユーザーを指定すると500ではなくNOT_REMOTE_USERを返す', async () => {
			const res = await api('federation/update-remote-user', { userId: alice.id });
			expect(res.status, JSON.stringify(res.body)).toBe(400);
			expect(castAsError(res.body as any).error.code).toBe('NOT_REMOTE_USER');
		});
	});


	describe('ap/show', () => {
		test('ローカルのユーザー/ノートをtype付きで返す', async () => {
			const config = fixtureConfig;

			const userRes = await api('ap/show', { uri: `${config.instance.url}/users/${alice.id}` }, alice);
			expect(userRes.status).toBe(200);
			expect(userRes.body.type).toBe('User');
			expect(userRes.body.object.id).toBe(alice.id);

			const note = await post(alice, { text: 'ap/show local note target' });
			const noteRes = await api('ap/show', { uri: `${config.instance.url}/notes/${note.id}` }, alice);
			expect(noteRes.status).toBe(200);
			expect(noteRes.body.type).toBe('Note');
			expect(noteRes.body.object.id).toBe(note.id);
		});

		test('連合が許可されていないホストはFEDERATION_NOT_ALLOWEDを維持する', async () => {
			const config = fixtureConfig;
			const blockedHost = `ap-show-blocked-${Date.now().toString(36)}.example`;

			const before = await api('admin/meta', {}, alice);
			await api('admin/update-meta', { blockedHosts: [...before.body.blockedHosts, blockedHost] }, alice);
			try {
				const res = await api('ap/show', { uri: `https://${blockedHost}/users/someone` }, alice);
				expect(res.status).toBe(400);
				expect(castAsError(res.body as any).error.code).toBe('FEDERATION_NOT_ALLOWED');
				expect(castAsError(res.body as any).error.id).toBe('974b799e-1a29-4889-b706-18d4dd93e266');
			} finally {
				await api('admin/update-meta', { blockedHosts: before.body.blockedHosts }, alice);
			}
		});

		test('フラグメント付きURIはURI_INVALIDを維持する', async () => {
			const res = await api('ap/show', { uri: 'https://ap-show-fragment-test.example/users/someone#fragment' }, alice);
			expect(res.status).toBe(400);
			expect(castAsError(res.body as any).error.code).toBe('URI_INVALID');
			expect(castAsError(res.body as any).error.id).toBe('1a5eab56-e47b-48c2-8d5e-217b897d70db');
		});

		test('未知のリモートUser/Noteを新規作成して返す', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36);

			const originalMeta = await fetchMetaFromDatabase(db);
			const disableSigning = await api('admin/update-meta', { signToActivityPubGet: false }, alice);
			expect(disableSigning.status).toBe(204);

			let server: Server | undefined;
			let actorUri = '';
			let noteUri = '';
			try {
				server = createServer((req, res) => {
					if (req.url === `/notes/note${suffix}`) {
						res.writeHead(200, { 'Content-Type': 'application/activity+json' });
						res.end(
							JSON.stringify({
								'@context': 'https://www.w3.org/ns/activitystreams',
								id: noteUri,
								type: 'Note',
								attributedTo: actorUri,
								content: '<p>ap/show remote note</p>',
								to: ['https://www.w3.org/ns/activitystreams#Public'],
							}),
						);
						return;
					}
					res.writeHead(200, { 'Content-Type': 'application/activity+json' });
					res.end(
						JSON.stringify({
							'@context': 'https://www.w3.org/ns/activitystreams',
							id: actorUri,
							type: 'Person',
							preferredUsername: `apshowremote${suffix}`,
							inbox: `${actorUri}/inbox`,
							name: 'ap/show Remote Actor',
						}),
					);
				});
				await new Promise<void>((resolve, reject) => {
					server!.once('error', reject);
					server!.listen(0, '127.0.0.1', () => {
						server!.off('error', reject);
						resolve();
					});
				});
				const address = server.address() as AddressInfo;
				const host = `127.0.0.1:${address.port}`;
				actorUri = `http://${host}/users/apshowremote${suffix}`;
				noteUri = `http://${host}/notes/note${suffix}`;

				const userRes = await api('ap/show', { uri: actorUri }, alice);
				expect(userRes.status, JSON.stringify(userRes.body)).toBe(200);
				assert.strictEqual(userRes.body.type, 'User');
				expect(userRes.body.object.username).toBe(`apshowremote${suffix}`);
				expect(userRes.body.object.host).toBe(host);

				const noteRes = await api('ap/show', { uri: noteUri }, alice);
				expect(noteRes.status).toBe(200);
				assert.strictEqual(noteRes.body.type, 'Note');
				assert.ok((noteRes.body.object.text as string)?.includes('ap/show remote note'));
				expect(noteRes.body.object.user.username).toBe(`apshowremote${suffix}`);

				const createdNote = await fetchNoteByIdFromDatabase(db, noteRes.body.object.id);
				expect(createdNote?.uri).toBe(noteUri);
				expect(createdNote?.visibility).toBe('public');
			} finally {
				server?.close();
				await api('admin/update-meta', { signToActivityPubGet: originalMeta.signToActivityPubGet }, alice);
			}
		});
	});


	describe('fetch-external-resources endpoint', () => {
		let resourceServer: Server | undefined;
		let resourceUrl: string;
		const data = 'line 1\r\nline 2';

		beforeAll(async () => {
			resourceServer = createServer((req, res) => {
				const responseBody =
					req.url === '/invalid'
						? JSON.stringify({ type: 'text/plain' })
						: JSON.stringify({ type: 'text/plain', data });

				res.writeHead(200, {
					'Content-Type': 'application/json; charset=utf-8',
				});
				res.end(responseBody);
			});
			await new Promise<void>((resolve, reject) => {
				resourceServer!.once('error', reject);
				resourceServer!.listen(0, '127.0.0.1', () => {
					resourceServer!.off('error', reject);
					resolve();
				});
			});
			const address = resourceServer.address() as AddressInfo;
			resourceUrl = `http://127.0.0.1:${address.port}`;
		});

		afterAll(async () => {
			await new Promise<void>((resolve, reject) => {
				if (resourceServer == null || !resourceServer.listening) {
					resolve();
					return;
				}

				resourceServer.close((error) => (error ? reject(error) : resolve()));
			});
		});

		test('fetches, validates, and returns hashed external resources', async () => {
			const hash = createHash('sha512').update(data.replace(/\r\n/g, '\n')).digest('hex');

			const res = await api(
				'fetch-external-resources',
				{
					url: `${resourceUrl}/valid`,
					hash,
				},
				alice,
			);

			expect(res.status).toBe(200);
			expect(res.body).toStrictEqual({
				type: 'text/plain',
				data,
			});
		});

		test('rejects third-party app tokens and mismatched resources', async () => {
			const appToken = await createAppToken(alice, ['read:account']);
			const appDenied = await api(
				'fetch-external-resources',
				{
					url: `${resourceUrl}/valid`,
					hash: 'bad',
				},
				{ token: appToken },
			);
			expect(appDenied.status).toBe(400);
			expect(castAsError(appDenied.body as any).error.code).toBe('ACCESS_DENIED');

			const mismatched = await api(
				'fetch-external-resources',
				{
					url: `${resourceUrl}/valid`,
					hash: 'bad',
				},
				alice,
			);
			expect(mismatched.status).toBe(400);
			expect(castAsError(mismatched.body as any).error.code).toBe('EXT_RESOURCE_HASH_DIDNT_MATCH');

			const invalid = await api(
				'fetch-external-resources',
				{
					url: `${resourceUrl}/invalid`,
					hash: 'bad',
				},
				alice,
			);
			expect(invalid.status).toBe(400);
			expect(castAsError(invalid.body as any).error.code).toBe('EXT_RESOURCE_RETURNED_INVALID_SCHEMA');
		});
	});


	describe('URL preview', () => {
		test('Error from summaly becomes HTTP 422', async () => {
			const res = await simpleGet('/url?url=https://e:xample.com');
			expect(res.status).toBe(422);
			expect(res.body.error.code).toBe('URL_PREVIEW_FAILED');
		});
	});

});
