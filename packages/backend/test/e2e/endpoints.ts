/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';

import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as assert from 'assert';
import * as Bull from 'bullmq';
import { describe, beforeAll, afterAll, test, expect } from 'vitest';
import { toXListId } from '@/server/rest/notification.js';
import { parseId } from '@/misc/id/parse-id.js';
import { baseQueueOptions, QUEUE } from '@/queue/const.js';
import type { DbQueue } from '@/core/queues.js';
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
	post,
	relativeFetch,
	role,
	signup,
	simpleGet,
	uploadFile,
} from '../utils.js';
import type * as misskey from 'misskey-js';
/*
 * アサーションは vitest の expect に寄せているが、判別可能ユニオンの分岐を確定させる箇所だけ
 * node:assert を使う。expect の matcher は `asserts` 述語を持たないため、判別子を検査しても
 * 後続のプロパティアクセスが型エラーになる。
 */


const bunPassword = Bun!.password;

function getAt<T>(values: readonly T[], index: number): T {
	const value = values[index];
	assert.ok(value != null);
	return value;
}

function getDefined<T>(value: T | undefined): T {
	assert.ok(value !== undefined);
	return value;
}

describe('Endpoints', () => {
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let carol: misskey.entities.SignupResponse;
	let dave: misskey.entities.SignupResponse;
	let db: TestDatabase;
	let dbQueue: Bull.Queue<DbJobData<'importCustomEmojis' | 'deleteAccount'>> | undefined;
	let deliverQueue: Bull.Queue<DeliverJobData> | undefined;
	let inboxQueue: Bull.Queue<InboxJobData> | undefined;
	let relationshipQueue: Bull.Queue<RelationshipJobData> | undefined;
	let objectStorageQueue: Bull.Queue<ObjectStorageJobData> | undefined;
	let systemWebhookDeliverQueue: Bull.Queue<SystemWebhookDeliverJobData> | undefined;
	let postScheduledNoteQueue: Bull.Queue<PostScheduledNoteJobData> | undefined;

	beforeAll(
		async () => {
			const config = fixtureConfig;
			db = openTestDatabase();
			dbQueue = new Bull.Queue<DbJobData<'importCustomEmojis' | 'deleteAccount'>>(
				QUEUE.DB,
				baseQueueOptions(config, QUEUE.DB),
			);
			deliverQueue = new Bull.Queue<DeliverJobData>(QUEUE.DELIVER, baseQueueOptions(config, QUEUE.DELIVER));
			inboxQueue = new Bull.Queue<InboxJobData>(QUEUE.INBOX, baseQueueOptions(config, QUEUE.INBOX));
			relationshipQueue = new Bull.Queue<RelationshipJobData>(
				QUEUE.RELATIONSHIP,
				baseQueueOptions(config, QUEUE.RELATIONSHIP),
			);
			objectStorageQueue = new Bull.Queue<ObjectStorageJobData>(
				QUEUE.OBJECT_STORAGE,
				baseQueueOptions(config, QUEUE.OBJECT_STORAGE),
			);
			systemWebhookDeliverQueue = new Bull.Queue<SystemWebhookDeliverJobData>(
				QUEUE.SYSTEM_WEBHOOK_DELIVER,
				baseQueueOptions(config, QUEUE.SYSTEM_WEBHOOK_DELIVER),
			);
			postScheduledNoteQueue = new Bull.Queue<PostScheduledNoteJobData>(
				QUEUE.POST_SCHEDULED_NOTE,
				baseQueueOptions(config, QUEUE.POST_SCHEDULED_NOTE),
			);
			alice = await signup({ username: 'alice' });
			bob = await signup({ username: 'bob' });
			carol = await signup({ username: 'carol' });
			dave = await signup({ username: 'dave' });
			await api('admin/update-meta', { federation: 'all' }, alice as misskey.entities.SignupResponse);
		},
		1000 * 60 * 2,
	);

	afterAll(async () => {
		await dbQueue?.close();
		await deliverQueue?.close();
		await inboxQueue?.close();
		await relationshipQueue?.close();
		await objectStorageQueue?.close();
		await systemWebhookDeliverQueue?.close();
		await postScheduledNoteQueue?.close();
		await db.close();
	});

	describe('signup', () => {
		test('不正なユーザー名でアカウントが作成できない', async () => {
			const res = await api('signup', {
				username: 'test.',
				password: 'test',
			});
			expect(res.status).toBe(400);
		});

		test('空のパスワードでアカウントが作成できない', async () => {
			const res = await api('signup', {
				username: 'test',
				password: '',
			});
			expect(res.status).toBe(400);
		});

		test('正しくアカウントが作成できる', async () => {
			const me = {
				username: 'test1',
				password: 'test1',
			};

			const res = await api('signup', me);

			expect(res.status).toBe(200);
			expect(typeof res.body === 'object' && !Array.isArray(res.body)).toBe(true);
			expect(res.body.username).toBe(me.username);
		});

		test('同じユーザー名のアカウントは作成できない', async () => {
			const res = await api('signup', {
				username: 'test1',
				password: 'test1',
			});

			expect(res.status).toBe(400);
		});

		test('同じリモートユーザー名の並行作成は一方だけ成功する', async () => {
			const params = {
				username: `remote${Date.now().toString(36).slice(-8)}`,
				password: 'test',
				host: 'remote.example.com',
			};
			const results = await Promise.all([api('signup', params), api('signup', params)]);
			expect(results.filter((result) => result.status === 200).length).toBe(1);
			const duplicated = results.find((result) => result.status === 400);
			assert.ok(duplicated);
			expect(castAsError(duplicated.body as any).error.code).toBe('DUPLICATED_USERNAME');
		});

		test('異なるホストでも使用済みユーザー名を並行作成できない', async () => {
			const username = `used${Date.now().toString(36).slice(-8)}`;
			const results = await Promise.all([
				api('signup', { username, password: 'test', host: 'remote-a.example.com' }),
				api('signup', { username, password: 'test', host: 'remote-b.example.com' }),
			]);
			expect(results.filter((result) => result.status === 200).length).toBe(1);
			const used = results.find((result) => result.status === 400);
			assert.ok(used);
			expect(castAsError(used.body as any).error.code).toBe('USED_USERNAME');
		});

		test('stale root claim does not roll back a valid signup after another process claimed root', async () => {
			const before = await fetchMetaFromDatabase(db);
			assert.ok(before.rootUserId);
			const staleMeta = { ...before, rootUserId: null, rootUser: null };
			const suffix = Date.now().toString(36).slice(-8);
			const requiredUsername = `requiredroot${suffix}`;
			await assert.rejects(
				createLocalSignupAccount(db, staleMeta, {
					username: requiredUsername,
					host: null,
					passwordHash: null,
					rootClaim: 'required',
				}),
				(error) => error instanceof RootUserAlreadyAssignedError,
			);
			expect(await fetchLocalUserByUsernameFromDatabase(db, requiredUsername)).toBe(null);

			const result = await createLocalSignupAccount(db, staleMeta, {
				username: `staleroot${suffix}`,
				host: null,
				passwordHash: null,
			});

			expect(result.account.username).toBe(`staleroot${suffix}`);
			expect((await fetchMetaFromDatabase(db)).rootUserId).toBe(before.rootUserId);

			await assert.rejects(
				createLocalSignupAccount(db, staleMeta, {
					username: 'admin',
					host: null,
					passwordHash: null,
				}),
				{ code: 'USED_USERNAME' },
			);
		});
	});

	describe('signup-pending', () => {
		test('pending user can complete signup and sign in', async () => {
			const config = fixtureConfig;
			const password = 'pending-password';
			const pending = await createUserPendingInDatabase(db, {
				id: genId(),
				code: 'pending-signup-test',
				username: 'pendinguser',
				email: 'pending@example.test',
				password: await bunPassword.hash(password, { algorithm: 'bcrypt', cost: 8 }),
			});

			const res = await api('signup-pending', {
				code: pending.code,
			});

			expect(res.status).toBe(200);
			const body = res.body as misskey.entities.SigninFlowResponse & { finished: true };
			expect(body.finished).toBe(true);
			expect(typeof body.i).toBe('string');

			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, body.id);
			expect(profile.email).toBe(pending.email);
			expect(profile.emailVerified).toBe(true);
		});
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
			if (res.body == null) assert.fail('endpoint metadata is missing');
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
			if (detailedBody.features == null) assert.fail('detailed meta features are missing');
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

	describe('admin/meta', () => {
		test('admin/meta は設定値、proxy account、scope、管理者権限を維持する', async () => {
			const meta = await fetchMetaFromDatabase(db);
			const res = await api('admin/meta', {}, alice);

			expect(res.status).toBe(200);
			expect(res.body.uri).toBe(origin);
			expect(typeof res.body.version).toBe('string');
			expect(res.body.emailRequiredForSignup).toBe(meta.emailRequiredForSignup);
			expect(res.body.signupRateLimitMinIntervalSeconds).toBe(meta.signupRateLimitMinIntervalSeconds);
			expect(res.body.signupRateLimitMaxPerHour).toBe(meta.signupRateLimitMaxPerHour);
			expect(res.body.translatorProvider).toBe(meta.translatorProvider);
			expect(res.body.libreTranslateApiUrl).toBe(meta.libreTranslateApiUrl);
			expect(res.body.federation).toBe(meta.federation);
			expect(res.body.urlPreviewSensitiveList).toStrictEqual(meta.urlPreviewSensitiveList);
			expect(typeof res.body.proxyAccountId).toBe('string');
			expect((res.body.policies as { canPublicNote?: boolean }).canPublicNote).toBe(true);

			const readToken = await createAppToken(alice, ['read:admin:meta']);
			const byToken = await api('admin/meta', {}, { token: readToken });
			expect(byToken.status).toBe(200);
			expect(byToken.body.proxyAccountId).toBe(res.body.proxyAccountId);

			const wrongScopeToken = await createAppToken(alice, ['read:admin:drive']);
			const scopeDenied = await api('admin/meta', {}, { token: wrongScopeToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const roleDenied = await api('admin/meta', {}, bob);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
		});

		test('admin/update-meta は設定変換、scope、管理者権限、ログを維持する', async () => {
			const before = await fetchMetaFromDatabase(db);
			const now = Date.now().toString(36);
			const updatedName = `hono meta ${now}`;

			const wrongScopeToken = await createAppToken(alice, ['read:admin:meta']);
			const scopeDenied = await api('admin/update-meta', { name: updatedName }, { token: wrongScopeToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const roleDenied = await api('admin/update-meta', { name: updatedName }, bob);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

			try {
				const writeToken = await createAppToken(alice, ['write:admin:meta']);
				const updated = await api(
					'admin/update-meta',
					{
						name: updatedName,
						disableRegistration: null,
						signupRateLimitMinIntervalSeconds: 15,
						signupRateLimitMaxPerHour: 20,
						translatorProvider: 'libreTranslate',
						libreTranslateApiUrl: 'https://translate.example/base',
						libreTranslateApiKey: 'test-key',
						pinnedUsers: ['@alice', ''],
						hiddenTags: [`hono-meta-${now}`, ''],
						blockedHosts: ['Blocked.Example', ''],
						silencedHosts: ['zzz.example', 'aaa.example', 'aaa.example', 'Blocked.Example', ''],
						mediaSilencedHosts: ['media.example', 'media.example', 'Blocked.Example', ''],
						langs: ['ja-JP', ''],
						mcaptchaSiteKey: `mcaptcha-${now}`,
						googleAnalyticsMeasurementId: '',
						sensitiveMediaDetectionApiUrl: '',
						deeplAuthKey: '',
						truemailInstance: '',
						tosUrl: `https://example.com/tos-${now}`,
						repositoryUrl: 'not a url',
						urlPreviewSummaryProxyUrl: ` https://example.com/summary-${now} `,
						urlPreviewSensitiveList: [`  example.com ${now}  `, '   ', `/preview-${now}/`],
						clientOptions: {
							entrancePageStyle: 'simple',
							showTimelineForVisitor: false,
						},
						federationHosts: ['Remote.Example', ''],
					},
					{ token: writeToken },
				);
				expect(updated.status).toBe(204);

				const after = await fetchMetaFromDatabase(db);
				expect(after.name).toBe(updatedName);
				expect(after.disableRegistration).toBe(before.disableRegistration);
				expect(after.signupRateLimitMinIntervalSeconds).toBe(15);
				expect(after.signupRateLimitMaxPerHour).toBe(20);
				expect(after.translatorProvider).toBe('libreTranslate');
				expect(after.libreTranslateApiUrl).toBe('https://translate.example/base');
				expect(after.libreTranslateApiKey).toBe('test-key');
				expect(after.pinnedUsers).toStrictEqual(['@alice']);
				expect(after.hiddenTags).toStrictEqual([`hono-meta-${now}`]);
				expect(after.blockedHosts).toStrictEqual(['blocked.example']);
				expect(after.silencedHosts).toStrictEqual(['Blocked.Example', 'aaa.example', 'zzz.example']);
				expect(after.mediaSilencedHosts).toStrictEqual(['Blocked.Example', 'media.example']);
				expect(after.langs).toStrictEqual(['ja-JP']);
				expect(after.mcaptchaSitekey).toBe(`mcaptcha-${now}`);
				expect(after.googleAnalyticsMeasurementId).toBe(null);
				expect(after.sensitiveMediaDetectionApiUrl).toBe(null);
				expect(after.deeplAuthKey).toBe(null);
				expect(after.truemailInstance).toBe(null);
				expect(after.termsOfServiceUrl).toBe(`https://example.com/tos-${now}`);
				expect(after.repositoryUrl).toBe(null);
				expect(after.urlPreviewSummaryProxyUrl).toBe(`https://example.com/summary-${now}`);
				expect(after.urlPreviewSensitiveList).toStrictEqual([`example.com ${now}`, `/preview-${now}/`]);
				const adminMeta = await api('admin/meta', {}, alice);
				expect(adminMeta.status).toBe(200);
				expect(adminMeta.body.urlPreviewSensitiveList).toStrictEqual(after.urlPreviewSensitiveList);
				expect(after.clientOptions.entrancePageStyle).toBe('simple');
				expect(after.clientOptions.showTimelineForVisitor).toBe(false);
				expect(after.clientOptions.showActivitiesForVisitor).toBe(before.clientOptions.showActivitiesForVisitor);
				expect(after.federationHosts).toStrictEqual(['remote.example']);

				const logs = await listModerationLogsFromDatabase(db, {
					limit: 10,
					order: 'desc',
					type: 'updateServerSettings',
					userId: alice.id,
					search: updatedName,
				});
				assert.ok(logs.length > 0);
			} finally {
				await api(
					'admin/update-meta',
					{
						name: before.name,
						signupRateLimitMinIntervalSeconds: before.signupRateLimitMinIntervalSeconds,
						signupRateLimitMaxPerHour: before.signupRateLimitMaxPerHour,
						translatorProvider: before.translatorProvider,
						libreTranslateApiUrl: before.libreTranslateApiUrl,
						libreTranslateApiKey: before.libreTranslateApiKey,
						pinnedUsers: before.pinnedUsers,
						hiddenTags: before.hiddenTags,
						blockedHosts: before.blockedHosts,
						silencedHosts: before.silencedHosts,
						mediaSilencedHosts: before.mediaSilencedHosts,
						langs: before.langs,
						mcaptchaSiteKey: before.mcaptchaSitekey,
						googleAnalyticsMeasurementId: before.googleAnalyticsMeasurementId,
						sensitiveMediaDetectionApiUrl: before.sensitiveMediaDetectionApiUrl,
						deeplAuthKey: before.deeplAuthKey,
						truemailInstance: before.truemailInstance,
						tosUrl: before.termsOfServiceUrl,
						repositoryUrl: before.repositoryUrl,
						urlPreviewSummaryProxyUrl: before.urlPreviewSummaryProxyUrl,
						urlPreviewSensitiveList: before.urlPreviewSensitiveList,
						clientOptions: before.clientOptions,
						federationHosts: before.federationHosts,
					},
					alice,
				);
			}
		});
	});

	describe('admin/update-proxy-account', () => {
		test('admin/update-proxy-account は description 更新、scope、権限、ログを維持する', async () => {
			const description = `hono proxy account ${Date.now().toString(36)}`;

			const wrongScopeToken = await createAppToken(alice, ['read:admin:account']);
			const scopeDenied = await api('admin/update-proxy-account', { description }, { token: wrongScopeToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const roleDenied = await api('admin/update-proxy-account', { description }, bob);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

			try {
				const updated = await api('admin/update-proxy-account', { description }, alice);
				expect(updated.status).toBe(200);
				expect(typeof updated.body.id).toBe('string');
				expect(updated.body.description).toBe(description);

				const profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, updated.body.id);
				expect(profile.description).toBe(description);

				const logs = await listModerationLogsFromDatabase(db, {
					limit: 5,
					order: 'desc',
					type: 'updateProxyAccountDescription',
					userId: alice.id,
				});
				assert.ok(logs.some((log) => (log.info as { after?: string | null }).after === description));
			} finally {
				await api('admin/update-proxy-account', { description: null }, alice);
			}
		});
	});

	describe('admin account deletion', () => {
		test('存在しないユーザーの削除はNO_SUCH_USERを返す', async () => {
			const missingUserId = 'zzzzzzzzzzzzzzzzzzzzzzzzzz';
			const missingFromAccountsDelete = await api('admin/accounts/delete', { userId: missingUserId }, alice);
			expect(missingFromAccountsDelete.status).toBe(400);
			expect(castAsError(missingFromAccountsDelete.body as any).error.id).toBe('f26ff6c4-278d-4c07-af5a-224c9d1e53f3');

			const missingFromDeleteAccount = await api('admin/delete-account', { userId: missingUserId }, alice);
			expect(missingFromDeleteAccount.status).toBe(400);
			expect(castAsError(missingFromDeleteAccount.body as any).error.id).toBe('7ccf53b8-f359-45a7-b376-5f05a7bdfa93');
		});

		test('admin/accounts/delete と admin/delete-account は削除状態、job、scope、roleを維持する', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const accountDeleteTarget = await signup({ username: `haad${suffix}` });
			const accountTokenTarget = await signup({ username: `haat${suffix}` });
			const deleteAccountTarget = await signup({ username: `hada${suffix}` });
			const untouchedTarget = await signup({ username: `haua${suffix}` });
			const targetIds = [accountDeleteTarget.id, accountTokenTarget.id, deleteAccountTarget.id, untouchedTarget.id];
			const getDeleteAccountJobs = async (userId: string) => {
				const jobs = await dbQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
				return jobs.filter((job) => job.name === 'deleteAccount' && job.data.user.id === userId);
			};
			const waitDeleteAccountJob = async (userId: string) => {
				for (let i = 0; i < 10; i++) {
					// outbox のディスパッチャはジョブキュー側プロセスの担当で e2e のサーバーでは動いていないため、
					// 配送待ちを挟むコーディネータ経由の発行を進めるにはテスト側から回す必要がある
					await dispatchQueueOutbox(db, dbQueue as unknown as DbQueue, deliverQueue!);
					const jobs = await getDeleteAccountJobs(userId);
					if (jobs[0] != null) return jobs[0];
					await new Promise((resolve) => setTimeout(resolve, 100));
				}
				assert.fail(`deleteAccount job was not found for ${userId}`);
			};
			const removeDeleteAccountJobs = async () => {
				const jobs = await dbQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
				await Promise.all(
					jobs
						.filter((job) => job.name === 'deleteAccount' && targetIds.includes(job.data.user.id))
						.map((job) => job.remove()),
				);
			};

			try {
				const deletedByNative = await api('admin/accounts/delete', { userId: accountDeleteTarget.id }, alice);
				expect(deletedByNative.status).toBe(204);
				expect((await fetchUserByIdOrFailFromDatabase(db, accountDeleteTarget.id)).isDeleted).toBe(true);
				const nativeJob = await waitDeleteAccountJob(accountDeleteTarget.id);
				expect((nativeJob.data as DbJobData<'deleteAccount'>).soft).toBe(false);

				const accountToken = await createAppToken(alice, ['write:admin:account']);
				const deletedByToken = await api(
					'admin/accounts/delete',
					{ userId: accountTokenTarget.id },
					{ token: accountToken },
				);
				expect(deletedByToken.status).toBe(204);
				expect((await fetchUserByIdOrFailFromDatabase(db, accountTokenTarget.id)).isDeleted).toBe(true);
				const tokenJob = await waitDeleteAccountJob(accountTokenTarget.id);
				expect((tokenJob.data as DbJobData<'deleteAccount'>).soft).toBe(false);

				const deleteAccountToken = await createAppToken(alice, ['write:admin:delete-account']);
				const deletedByDeleteAccount = await api(
					'admin/delete-account',
					{ userId: deleteAccountTarget.id },
					{ token: deleteAccountToken },
				);
				expect(deletedByDeleteAccount.status).toBe(204);
				expect((await fetchUserByIdOrFailFromDatabase(db, deleteAccountTarget.id)).isDeleted).toBe(true);
				const deleteAccountJob = await waitDeleteAccountJob(deleteAccountTarget.id);
				expect((deleteAccountJob.data as DbJobData<'deleteAccount'>).soft).toBe(false);

				const alreadyDeleted = await api('admin/delete-account', { userId: deleteAccountTarget.id }, alice);
				expect(alreadyDeleted.status).toBe(204);
				expect((await getDeleteAccountJobs(deleteAccountTarget.id)).length).toBe(1);

				const wrongAccountScope = await createAppToken(alice, ['read:admin:account']);
				const accountScopeDenied = await api(
					'admin/accounts/delete',
					{ userId: untouchedTarget.id },
					{ token: wrongAccountScope },
				);
				expect(accountScopeDenied.status).toBe(403);
				expect(castAsError(accountScopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

				const wrongDeleteAccountScope = await createAppToken(alice, ['write:admin:account']);
				const deleteAccountScopeDenied = await api(
					'admin/delete-account',
					{ userId: untouchedTarget.id },
					{ token: wrongDeleteAccountScope },
				);
				expect(deleteAccountScopeDenied.status).toBe(403);
				expect(castAsError(deleteAccountScopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

				const accountRoleDenied = await api('admin/accounts/delete', { userId: untouchedTarget.id }, bob);
				expect(accountRoleDenied.status).toBe(403);
				expect(castAsError(accountRoleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

				const deleteAccountRoleDenied = await api('admin/delete-account', { userId: untouchedTarget.id }, bob);
				expect(deleteAccountRoleDenied.status).toBe(403);
				expect(castAsError(deleteAccountRoleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
			} finally {
				await removeDeleteAccountJobs();
			}
		});
	});

	describe('admin/accounts/create', () => {
		test('root native token のみアカウント作成でき、external token と非rootは拒否される', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const created = await api(
				'admin/accounts/create',
				{
					username: `hacreate${suffix}`,
					password: 'test',
					setupPassword: null,
				},
				alice,
			);
			expect(created.status).toBe(200);
			expect(created.body.username).toBe(`hacreate${suffix}`);
			expect(typeof (created.body as { token?: unknown }).token).toBe('string');

			const user = await fetchUserByIdOrFailFromDatabase(db, created.body.id);
			expect(user.username).toBe(`hacreate${suffix}`);
			expect(user.host).toBe(null);

			const token = await createAppToken(alice, ['write:admin:account']);
			const appDenied = await api(
				'admin/accounts/create',
				{
					username: `hacreatet${suffix}`,
					password: 'test',
					setupPassword: null,
				},
				{ token },
			);
			expect(appDenied.status).toBe(400);
			expect(castAsError(appDenied.body as any).error.code).toBe('ACCESS_DENIED');
			expect(castAsError(appDenied.body as any).error.id).toBe('1fb7cb09-d46a-4fff-b8df-057708cce513');

			const nonRootDenied = await api(
				'admin/accounts/create',
				{
					username: `hacreateb${suffix}`,
					password: 'test',
					setupPassword: null,
				},
				bob,
			);
			expect(nonRootDenied.status).toBe(400);
			expect(castAsError(nonRootDenied.body as any).error.code).toBe('ACCESS_DENIED');
		});

		test('同じユーザー名の並行作成は一方だけ成功する', async () => {
			const username = `haconcurrent${Date.now().toString(36).slice(-8)}`;
			const results = await Promise.all([
				api('admin/accounts/create', { username, password: 'test', setupPassword: null }, alice),
				api('admin/accounts/create', { username, password: 'test', setupPassword: null }, alice),
			]);
			const successful = results.filter((result) => result.status === 200);
			const duplicated = results.filter((result) => result.status === 400);

			expect(successful.length).toBe(1);
			expect(duplicated.length).toBe(1);
			expect(castAsError(duplicated[0]!.body as any).error.code).toBe('DUPLICATED_USERNAME');
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

	describe('admin/accounts/find-by-email', () => {
		test('admin/accounts/find-by-email はemail検索、admin権限、token scopeを維持する', async () => {
			const now = Date.now();
			const target = await signup({ username: `honoemail${now.toString(36)}` });
			const email = `honoemail-${now}@example.test`;
			await updateUserProfileInDatabase(db, target.id, {
				email,
				emailVerified: true,
			});

			const found = await api('admin/accounts/find-by-email', { email }, alice);
			expect(found.status).toBe(200);
			expect(found.body.id).toBe(target.id);
			expect(found.body.username).toBe(target.username);

			const missing = await api('admin/accounts/find-by-email', { email: `missing-${now}@example.test` }, alice);
			expect(missing.status).toBe(400);
			expect(castAsError(missing.body as any).error.code).toBe('USER_NOT_FOUND');
			expect(castAsError(missing.body as any).error.id).toBe('cb865949-8af5-4062-a88c-ef55e8786d1d');

			const readToken = await createAppToken(alice, ['read:admin:account']);
			const foundWithToken = await api('admin/accounts/find-by-email', { email }, { token: readToken });
			expect(foundWithToken.status).toBe(200);
			expect(foundWithToken.body.id).toBe(target.id);

			const deniedToken = await createAppToken(alice, ['read:admin:queue']);
			const scopeDenied = await api('admin/accounts/find-by-email', { email }, { token: deniedToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `hoem${now.toString(36)}` });
			const roleDenied = await api('admin/accounts/find-by-email', { email }, normalUser);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
		});
	});

	describe('emoji endpoints', () => {
		test('emojis and emoji return packed local emoji data', async () => {
			const config = fixtureConfig;
			const emoji = await insertEmojiInDatabase(db, {
				id: genId(),
				name: 'hono_emoji',
				host: null,
				category: 'frameworks',
				originalUrl: 'https://example.com/original.png',
				publicUrl: 'https://example.com/public.png',
				aliases: ['hono'],
				license: 'example license',
				localOnly: true,
				isSensitive: true,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});

			const list = await relativeFetch('api/emojis');
			expect(list.status).toBe(200);
			expect(list.headers.get('cache-control')).toBe('public, max-age=3600');

			const listBody = (await list.json()) as {
				emojis?: {
					name?: unknown;
					url?: unknown;
					category?: unknown;
					aliases?: unknown;
					localOnly?: unknown;
					isSensitive?: unknown;
				}[];
			};
			const listedEmoji = listBody.emojis?.find((item) => item.name === emoji.name);
			assert.ok(listedEmoji);
			expect(listedEmoji.url).toBe(emoji.publicUrl);
			expect(listedEmoji.category).toBe(emoji.category);
			expect(listedEmoji.aliases).toStrictEqual(emoji.aliases);
			expect(listedEmoji.localOnly).toBe(true);
			expect(listedEmoji.isSensitive).toBe(true);

			const detail = await api('emoji', {
				name: emoji.name,
			});
			expect(detail.status).toBe(200);
			expect(detail.body.id).toBe(emoji.id);
			expect(detail.body.name).toBe(emoji.name);
			expect(detail.body.host).toBe(null);
			expect(detail.body.url).toBe(emoji.publicUrl);
			expect(detail.body.license).toBe(emoji.license);
			expect(detail.body.localOnly).toBe(true);
			expect(detail.body.isSensitive).toBe(true);

			const detailByGet = await relativeFetch(`api/emoji?name=${emoji.name}`);
			expect(detailByGet.status).toBe(200);
			expect(detailByGet.headers.get('cache-control')).toBe('public, max-age=3600');

			const missing = await api('emoji', { name: `missing_${Date.now().toString(36)}` });
			expect(missing.status).toBe(404);
			expect(castAsError(missing.body as any).error.id).toBe('e2785b66-dca3-4087-9cac-b93c541cc425');
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
			for (let i = 0; i < 20; i++) {
				missing = await api('drive/files/delete', { fileId: file.id }, alice);
				if (missing.status === 400) break;
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
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

	describe('avatar decoration endpoints', () => {
		test('get-avatar-decorations filters unavailable role ids', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const createdRole = await createRoleInDatabase(db, {
				id: genId(now),
				updatedAt: new Date(now),
				lastUsedAt: new Date(now),
				name: `Hono avatar decoration role ${now}`,
				description: 'Hono avatar decoration endpoint test',
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
				policies: {},
			});
			const decoration = await createAvatarDecorationInDatabase(db, {
				id: genId(now + 1),
				name: `Hono decoration ${now}`,
				description: 'Hono avatar decoration',
				url: 'https://example.com/avatar-decoration.png',
				roleIdsThatCanBeUsedThisDecoration: [createdRole.id, 'missing-role-id'],
				category: 'hono',
			});

			const res = await api('get-avatar-decorations', {});
			expect(res.status).toBe(200);
			const listed = res.body.find((item) => item.id === decoration.id);
			assert.ok(listed);
			expect(listed.name).toBe(decoration.name);
			expect(listed.description).toBe(decoration.description);
			expect(listed.url).toBe(decoration.url);
			expect(listed.roleIdsThatCanBeUsedThisDecoration).toStrictEqual([createdRole.id]);
			expect(listed.category).toBe(decoration.category);
		});
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

			for (let i = 0; i < 10; i++) {
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
				if (suspendLogs.length > 0 && noteLogs.length > 0) {
					expect(suspendLogs.some((log) => (log.info as any).host === host)).toBe(true);
					expect(noteLogs.some(
							(log) =>
								(log.info as any).before === 'before update' && (log.info as any).after === `updated note ${suffix}`,
						)).toBe(true);
					break;
				}
				await new Promise((resolve) => setTimeout(resolve, 100));
				if (i === 9) assert.fail('remote instance moderation logs were not found');
			}

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
			for (let i = 0; i < 10; i++) {
				const jobs = await relationshipQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
				job = jobs.find(
					(job) =>
						job.name === 'unfollow' &&
						job.data.from.id === following.followerId &&
						job.data.to.id === following.followeeId &&
						job.data.silent === true,
				);
				if (job != null) break;
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
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
			expect(choices.map((choice: unknown) => {
					assert.ok(typeof choice === 'object' && choice != null);
					return Reflect.get(choice, 'name');
				})).toStrictEqual(['a', 'b']);

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

	describe('admin/drive', () => {
		test('admin/drive/files は filter、pagination、DriveFile packing、token scopeを維持する', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const fileType = 'application/x-hono-admin-drive';
			const remoteHost = `hono-admin-drive-${suffix}.remote`;
			const folder = await createDriveFolderInDatabase(db, {
				id: genId(now - 2500),
				userId: bob.id,
				name: `hono-admin-drive-folder-${suffix}`,
				parentId: null,
			});
			const firstMd5 = createHash('md5').update(`hono-admin-drive-list-first-${suffix}`).digest('hex');
			const firstLocal = await createDriveFileInDatabase(db, {
				id: genId(now - 2000),
				userId: bob.id,
				userHost: null,
				md5: firstMd5,
				name: `hono-admin-drive-list-first-${suffix}.bin`,
				type: fileType,
				size: 101,
				blurhash: null,
				properties: { width: 30, height: 40, orientation: 6 },
				storedInternal: true,
				url: `${origin}/files/${firstMd5}`,
				thumbnailUrl: `${origin}/files/${firstMd5}.thumbnail`,
				comment: `first local ${suffix}`,
				folderId: folder.id,
			});
			const secondMd5 = createHash('md5').update(`hono-admin-drive-list-second-${suffix}`).digest('hex');
			const secondLocal = await createDriveFileInDatabase(db, {
				id: genId(now - 1000),
				userId: bob.id,
				userHost: null,
				md5: secondMd5,
				name: `hono-admin-drive-list-second-${suffix}.bin`,
				type: fileType,
				size: 202,
				storedInternal: true,
				url: `${origin}/files/${secondMd5}`,
			});
			const remoteMd5 = createHash('md5').update(`hono-admin-drive-list-remote-${suffix}`).digest('hex');
			const remote = await createDriveFileInDatabase(db, {
				id: genId(now),
				userId: null,
				userHost: remoteHost,
				md5: remoteMd5,
				name: `hono-admin-drive-list-remote-${suffix}.bin`,
				type: fileType,
				size: 303,
				storedInternal: false,
				url: `https://${remoteHost}/files/${remoteMd5}`,
			});

			const listed = await api(
				'admin/drive/files',
				{
					limit: 10,
					sinceDate: now - 3000,
					type: fileType,
				},
				alice,
			);
			expect(listed.status).toBe(200);
			const localFiles = listed.body as any[];
			expect(localFiles.map((file) => file.id)).toStrictEqual([firstLocal.id, secondLocal.id]);
			expect(typeof localFiles[0].createdAt).toBe('string');
			expect(localFiles[0].name).toBe(firstLocal.name);
			expect(localFiles[0].type).toBe(fileType);
			expect(localFiles[0].md5).toBe(firstMd5);
			expect(localFiles[0].size).toBe(101);
			expect(localFiles[0].isSensitive).toBe(false);
			expect(localFiles[0].blurhash).toBe(null);
			expect(localFiles[0].properties).toStrictEqual({ width: 30, height: 40, orientation: 6 });
			expect(localFiles[0].url).toBe(firstLocal.url);
			expect(localFiles[0].thumbnailUrl).toBe(firstLocal.thumbnailUrl);
			expect(localFiles[0].comment).toBe(`first local ${suffix}`);
			expect(localFiles[0].folderId).toBe(folder.id);
			expect(localFiles[0].folder.id).toBe(folder.id);
			expect(localFiles[0].folder.name).toBe(folder.name);
			expect(localFiles[0].folder.filesCount).toBe(1);
			expect(localFiles[0].userId).toBe(bob.id);
			expect(localFiles[0].user.id).toBe(bob.id);

			const byUser = await api(
				'admin/drive/files',
				{
					limit: 10,
					sinceDate: now - 3000,
					type: fileType,
					userId: bob.id,
				},
				alice,
			);
			expect(byUser.status).toBe(200);
			expect((byUser.body as any[]).map((file) => file.id)).toStrictEqual([firstLocal.id, secondLocal.id]);

			const remoteFiles = await api(
				'admin/drive/files',
				{
					limit: 10,
					sinceDate: now - 3000,
					type: fileType,
					origin: 'remote',
					hostname: remoteHost,
				},
				alice,
			);
			expect(remoteFiles.status).toBe(200);
			expect((remoteFiles.body as any[]).map((file) => file.id)).toStrictEqual([remote.id]);
			expect((remoteFiles.body as any[])[0].userId).toBe(null);
			expect((remoteFiles.body as any[])[0].user).toBe(null);

			const token = await createAppToken(alice, ['read:admin:drive']);
			const listedByToken = await api(
				'admin/drive/files',
				{
					limit: 1,
					untilId: remote.id,
					type: fileType,
					origin: 'combined',
				},
				{ token },
			);
			expect(listedByToken.status).toBe(200);
			expect((listedByToken.body as any[])[0].id).toBe(secondLocal.id);

			const wrongScopeToken = await createAppToken(alice, ['read:drive']);
			const scopeDenied = await api('admin/drive/files', {}, { token: wrongScopeToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');
		});

		test('admin/drive/show-file は fileId/url、秘匿 header、token scope、role、404を維持する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const bobMd5 = createHash('md5').update(`hono-admin-drive-bob-${suffix}`).digest('hex');
			const bobFile = await createDriveFileInDatabase(db, {
				id: genId(),
				userId: bob.id,
				userHost: null,
				md5: bobMd5,
				name: `hono-admin-drive-bob-${suffix}.png`,
				type: 'image/png',
				size: 123,
				comment: `admin drive show ${suffix}`,
				blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
				properties: { width: 10, height: 20 },
				storedInternal: true,
				url: `${origin}/files/${bobMd5}`,
				thumbnailUrl: `${origin}/files/${bobMd5}.thumbnail`,
				webpublicUrl: `${origin}/files/${bobMd5}.webpublic`,
				accessKey: `access-${suffix}`,
				thumbnailAccessKey: `thumbnail-${suffix}`,
				webpublicAccessKey: `webpublic-${suffix}`,
				webpublicType: 'image/webp',
				uri: `https://remote.example/files/${bobMd5}`,
				src: `https://source.example/files/${bobMd5}`,
				isSensitive: true,
				maybeSensitive: true,
				maybePorn: false,
				isLink: true,
				requestIp: '192.0.2.10',
				requestHeaders: { authorization: 'secret', 'user-agent': 'test-agent' },
			});
			const aliceMd5 = createHash('md5').update(`hono-admin-drive-alice-${suffix}`).digest('hex');
			const aliceFile = await createDriveFileInDatabase(db, {
				id: genId(),
				userId: alice.id,
				userHost: null,
				md5: aliceMd5,
				name: `hono-admin-drive-alice-${suffix}.png`,
				type: 'image/png',
				size: 456,
				storedInternal: true,
				url: `${origin}/files/${aliceMd5}`,
				requestIp: '192.0.2.11',
				requestHeaders: { authorization: 'root-secret' },
			});

			const shown = await api('admin/drive/show-file', { fileId: bobFile.id }, alice);
			expect(shown.status).toBe(200);
			expect(shown.body.id).toBe(bobFile.id);
			expect(typeof shown.body.createdAt).toBe('string');
			expect(shown.body.userId).toBe(bob.id);
			expect(shown.body.md5).toBe(bobMd5);
			expect(shown.body.name).toBe(bobFile.name);
			expect(shown.body.type).toBe(bobFile.type);
			expect(shown.body.size).toBe(bobFile.size);
			expect(shown.body.comment).toBe(bobFile.comment);
			expect(shown.body.blurhash).toBe(bobFile.blurhash);
			expect(shown.body.properties).toStrictEqual({ width: 10, height: 20 });
			expect(shown.body.storedInternal).toBe(true);
			expect(shown.body.url).toBe(bobFile.url);
			expect(shown.body.thumbnailUrl).toBe(bobFile.thumbnailUrl);
			expect(shown.body.webpublicUrl).toBe(bobFile.webpublicUrl);
			expect(shown.body.accessKey).toBe(bobFile.accessKey);
			expect(shown.body.thumbnailAccessKey).toBe(bobFile.thumbnailAccessKey);
			expect(shown.body.webpublicAccessKey).toBe(bobFile.webpublicAccessKey);
			expect((shown.body as any).webpublicType).toBe(bobFile.webpublicType);
			expect(shown.body.uri).toBe(bobFile.uri);
			expect(shown.body.src).toBe(bobFile.src);
			expect(shown.body.isSensitive).toBe(true);
			expect(shown.body.maybeSensitive).toBe(true);
			expect(shown.body.maybePorn).toBe(false);
			expect(shown.body.isLink).toBe(true);
			expect(shown.body.requestIp).toBe('192.0.2.10');
			expect(shown.body.requestHeaders).toStrictEqual({ authorization: 'secret', 'user-agent': 'test-agent' });

			const shownByUrl = await api('admin/drive/show-file', { url: bobFile.url }, alice);
			expect(shownByUrl.status).toBe(200);
			expect(shownByUrl.body.id).toBe(bobFile.id);

			const ownedByModerator = await api('admin/drive/show-file', { fileId: aliceFile.id }, alice);
			expect(ownedByModerator.status).toBe(200);
			expect(ownedByModerator.body.requestIp).toBe('192.0.2.11');
			expect(ownedByModerator.body.requestHeaders).toBe(null);

			const token = await createAppToken(alice, ['read:admin:drive']);
			const shownByToken = await api('admin/drive/show-file', { fileId: bobFile.id }, { token });
			expect(shownByToken.status).toBe(200);
			expect(shownByToken.body.id).toBe(bobFile.id);

			const wrongScopeToken = await createAppToken(alice, ['read:drive']);
			const scopeDenied = await api('admin/drive/show-file', { fileId: bobFile.id }, { token: wrongScopeToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `hads${suffix}` });
			const roleDenied = await api('admin/drive/show-file', { fileId: bobFile.id }, normalUser);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

			const missing = await api('admin/drive/show-file', { fileId: '000000000000000000000000' }, alice);
			expect(missing.status).toBe(400);
			expect(castAsError(missing.body as any).error.code).toBe('NO_SUCH_FILE');
			expect(castAsError(missing.body as any).error.id).toBe('caf3ca38-c6e5-472e-a30c-b05377dcc240');
		});

		test('admin/drive/clean-remote-files は objectStorage queue job と権限を維持する', async () => {
			const cleaned = await api('admin/drive/clean-remote-files', {}, alice);
			expect(cleaned.status).toBe(204);

			let job: Bull.Job<ObjectStorageJobData> | undefined;
			for (let i = 0; i < 10; i++) {
				const jobs = await objectStorageQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
				job = jobs.find((job) => job.name === 'cleanRemoteFiles');
				if (job != null) break;
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
			assert.ok(job);
			await job.remove();

			const token = await createAppToken(alice, ['write:admin:drive']);
			const cleanedByToken = await api('admin/drive/clean-remote-files', {}, { token });
			expect(cleanedByToken.status).toBe(204);
			const tokenJobs = await objectStorageQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
			await Promise.all(tokenJobs.filter((job) => job.name === 'cleanRemoteFiles').map((job) => job.remove()));

			const wrongScopeToken = await createAppToken(alice, ['read:admin:drive']);
			const scopeDenied = await api('admin/drive/clean-remote-files', {}, { token: wrongScopeToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');
		});

		test('admin drive deletion endpoints は DB削除、objectStorage job、scope、roleを維持する', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const remoteHost = `hono-drive-delete-${suffix}.remote`;
			const makeFile = async (params: { seed: string; userId: string | null; userHost: string | null }) => {
				const md5 = createHash('md5').update(`hono-drive-delete-${params.seed}-${suffix}`).digest('hex');
				return await createDriveFileInDatabase(db, {
					id: genId(),
					userId: params.userId,
					userHost: params.userHost,
					md5,
					name: `hono-drive-delete-${params.seed}-${suffix}.bin`,
					type: 'application/octet-stream',
					size: 256,
					comment: null,
					blurhash: null,
					properties: {},
					storedInternal: false,
					url: `${origin}/files/hono-drive-delete-${params.seed}-${suffix}`,
					thumbnailUrl: null,
					webpublicUrl: null,
					webpublicType: null,
					accessKey: `hono-drive-delete-${params.seed}-${suffix}`,
					thumbnailAccessKey: null,
					webpublicAccessKey: null,
					uri: null,
					src: null,
					folderId: null,
					isSensitive: false,
					maybeSensitive: false,
					maybePorn: false,
					isLink: false,
					requestHeaders: null,
					requestIp: null,
				});
			};

			const orphan = await makeFile({ seed: 'orphan', userId: null, userHost: null });
			const userFile = await makeFile({ seed: 'user', userId: bob.id, userHost: null });
			const remoteFile = await makeFile({ seed: 'remote', userId: null, userHost: remoteHost });
			const targetIds = [orphan.id, userFile.id, remoteFile.id];
			const targetKeys = [orphan.accessKey!, userFile.accessKey!, remoteFile.accessKey!];
			const waitDeleted = async (fileId: string) => {
				for (let i = 0; i < 10; i++) {
					if ((await fetchDriveFileByIdFromDatabase(db, fileId)) == null) return;
					await new Promise((resolve) => setTimeout(resolve, 100));
				}
				assert.fail(`drive file was not deleted: ${fileId}`);
			};
			const waitDeleteObjectStorageJob = async (key: string) => {
				for (let i = 0; i < 10; i++) {
					const jobs = await objectStorageQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
					const job = jobs.find((job) => job.name === 'deleteFile' && (job.data as { key: string }).key === key);
					if (job != null) return job;
					await new Promise((resolve) => setTimeout(resolve, 100));
				}
				assert.fail(`deleteFile objectStorage job was not found: ${key}`);
			};
			const removeObjectStorageJobs = async () => {
				const jobs = await objectStorageQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
				await Promise.all(
					jobs
						.filter((job) => job.name === 'deleteFile' && targetKeys.includes((job.data as { key: string }).key))
						.map((job) => job.remove()),
				);
			};

			try {
				const cleaned = await api('admin/drive/cleanup', {}, alice);
				expect(cleaned.status).toBe(204);
				const userDeleted = await api('admin/delete-all-files-of-a-user', { userId: bob.id }, alice);
				expect(userDeleted.status).toBe(204);
				const remoteDeleted = await api('admin/federation/delete-all-files', { host: remoteHost }, alice);
				expect(remoteDeleted.status).toBe(204);

				await Promise.all(targetIds.map(waitDeleted));
				const jobs = await Promise.all(targetKeys.map(waitDeleteObjectStorageJob));
				expect(jobs.map((job) => job.data.key).sort()).toStrictEqual(targetKeys.sort());

				const driveToken = await createAppToken(alice, ['write:admin:drive']);
				const cleanupByToken = await api('admin/drive/cleanup', {}, { token: driveToken });
				expect(cleanupByToken.status).toBe(204);

				const deleteFilesToken = await createAppToken(alice, ['write:admin:delete-all-files-of-a-user']);
				const userDeleteByToken = await api(
					'admin/delete-all-files-of-a-user',
					{ userId: bob.id },
					{ token: deleteFilesToken },
				);
				expect(userDeleteByToken.status).toBe(204);

				const federationToken = await createAppToken(alice, ['write:admin:federation']);
				const federationDeleteByToken = await api(
					'admin/federation/delete-all-files',
					{ host: remoteHost },
					{ token: federationToken },
				);
				expect(federationDeleteByToken.status).toBe(204);

				const driveScopeDeniedToken = await createAppToken(alice, ['read:admin:drive']);
				const cleanupScopeDenied = await api('admin/drive/cleanup', {}, { token: driveScopeDeniedToken });
				expect(cleanupScopeDenied.status).toBe(403);
				expect(castAsError(cleanupScopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

				const userDeleteScopeDeniedToken = await createAppToken(alice, ['write:admin:account']);
				const userDeleteScopeDenied = await api(
					'admin/delete-all-files-of-a-user',
					{ userId: bob.id },
					{ token: userDeleteScopeDeniedToken },
				);
				expect(userDeleteScopeDenied.status).toBe(403);
				expect(castAsError(userDeleteScopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

				const federationScopeDeniedToken = await createAppToken(alice, ['write:admin:user-note']);
				const federationScopeDenied = await api(
					'admin/federation/delete-all-files',
					{ host: remoteHost },
					{ token: federationScopeDeniedToken },
				);
				expect(federationScopeDenied.status).toBe(403);
				expect(castAsError(federationScopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

				const cleanupRoleDenied = await api('admin/drive/cleanup', {}, bob);
				expect(cleanupRoleDenied.status).toBe(403);
				expect(castAsError(cleanupRoleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

				const userDeleteRoleDenied = await api('admin/delete-all-files-of-a-user', { userId: bob.id }, bob);
				expect(userDeleteRoleDenied.status).toBe(403);
				expect(castAsError(userDeleteRoleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

				const federationRoleDenied = await api('admin/federation/delete-all-files', { host: remoteHost }, bob);
				expect(federationRoleDenied.status).toBe(403);
				expect(castAsError(federationRoleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
			} finally {
				await removeObjectStorageJobs();
			}
		});
	});

	describe('admin/emoji', () => {
		test('admin/emoji/list と list-remote は filter、pagination、packing、scope、role policyを維持する', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const manager = await signup({ username: `haem${suffix}` });
			const emojiRole = await role(
				alice,
				{
					name: `hono emoji manager ${suffix}`,
				},
				{
					canManageCustomEmojis: { priority: 0, useDefault: false, value: true },
				},
			);
			const assign = await api(
				'admin/roles/assign',
				{
					roleId: emojiRole.id,
					userId: manager.id,
				},
				alice,
			);
			expect(assign.status).toBe(204);

			const localFirst = await insertEmojiInDatabase(db, {
				id: genId(now - 2000),
				name: `honoemoji_first_${suffix}`,
				host: null,
				aliases: [`alias_${suffix}`],
				category: `category_${suffix}`,
				originalUrl: `${origin}/emoji/${suffix}/first-original.webp`,
				publicUrl: '',
				license: `license ${suffix}`,
				isSensitive: true,
				localOnly: true,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});
			const localSecond = await insertEmojiInDatabase(db, {
				id: genId(now - 1000),
				name: `honoemoji_second_${suffix}`,
				host: null,
				aliases: [],
				category: null,
				originalUrl: `${origin}/emoji/${suffix}/second-original.webp`,
				publicUrl: `${origin}/emoji/${suffix}/second-public.webp`,
				license: null,
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});
			const remoteHost = `hono-emoji-${suffix}.example`;
			const remoteOlder = await insertEmojiInDatabase(db, {
				id: genId(now - 1500),
				name: `remote_old_${suffix}`,
				host: remoteHost,
				aliases: [],
				category: `remote_${suffix}`,
				originalUrl: `https://${remoteHost}/emoji/old.webp`,
				publicUrl: '',
				license: null,
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});
			const remoteNewer = await insertEmojiInDatabase(db, {
				id: genId(now - 500),
				name: `remote_new_${suffix}`,
				host: remoteHost,
				aliases: [],
				category: `remote_${suffix}`,
				originalUrl: `https://${remoteHost}/emoji/new-original.webp`,
				publicUrl: `https://${remoteHost}/emoji/new-public.webp`,
				license: `remote license ${suffix}`,
				isSensitive: true,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});

			try {
				const listed = await api(
					'admin/emoji/list',
					{
						limit: 10,
						query: suffix,
						sinceDate: now - 3000,
					},
					manager,
				);
				expect(listed.status).toBe(200);
				const localEmojis = listed.body as any[];
				expect(localEmojis.map((emoji) => emoji.id)).toStrictEqual([localFirst.id, localSecond.id]);
				expect(localEmojis[0].name).toBe(localFirst.name);
				expect(localEmojis[0].aliases).toStrictEqual([`alias_${suffix}`]);
				expect(localEmojis[0].category).toBe(`category_${suffix}`);
				expect(localEmojis[0].url).toBe(localFirst.originalUrl);
				expect(localEmojis[0].license).toBe(`license ${suffix}`);
				expect(localEmojis[0].isSensitive).toBe(true);
				expect(localEmojis[0].localOnly).toBe(true);
				expect(localEmojis[0].roleIdsThatCanBeUsedThisEmojiAsReaction).toStrictEqual([]);
				expect(localEmojis[1].url).toBe(localSecond.publicUrl);

				const listedByColonQuery = await api(
					'admin/emoji/list',
					{
						limit: 10,
						query: `:${localFirst.name}:`,
						sinceDate: now - 3000,
					},
					manager,
				);
				expect(listedByColonQuery.status).toBe(200);
				expect((listedByColonQuery.body as any[]).map((emoji) => emoji.id)).toStrictEqual([localFirst.id]);

				const remoteListed = await api(
					'admin/emoji/list-remote',
					{
						limit: 10,
						query: 'remote_',
						host: remoteHost.toUpperCase(),
						sinceDate: now - 3000,
					},
					manager,
				);
				expect(remoteListed.status).toBe(200);
				const remoteEmojis = remoteListed.body as any[];
				expect(remoteEmojis.map((emoji) => emoji.id)).toStrictEqual([remoteNewer.id, remoteOlder.id]);
				expect(remoteEmojis[0].host).toBe(remoteHost);
				expect(remoteEmojis[0].url).toBe(remoteNewer.publicUrl);
				expect(remoteEmojis[0].license).toBe(`remote license ${suffix}`);
				expect(remoteEmojis[0].isSensitive).toBe(true);

				const readToken = await createAppToken(manager, ['read:admin:emoji']);
				const byToken = await api(
					'admin/emoji/list-remote',
					{
						limit: 1,
						query: 'remote_',
						host: remoteHost,
					},
					{ token: readToken },
				);
				expect(byToken.status).toBe(200);
				expect((byToken.body as any[]).map((emoji) => emoji.id)).toStrictEqual([remoteNewer.id]);

				const wrongScopeToken = await createAppToken(manager, ['read:admin:meta']);
				const scopeDenied = await api('admin/emoji/list', {}, { token: wrongScopeToken });
				expect(scopeDenied.status).toBe(403);
				expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

				const roleDenied = await api('admin/emoji/list', {}, bob);
				expect(roleDenied.status).toBe(403);
				expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
			} finally {
				await api(
					'admin/roles/unassign',
					{
						roleId: emojiRole.id,
						userId: manager.id,
					},
					alice,
				);
				await api(
					'admin/roles/delete',
					{
						roleId: emojiRole.id,
					},
					alice,
				);
			}
		});

		test('v2/admin/emoji/list はquery、hostType、pagination、count/allCount/allPages、role policyを維持する', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const manager = await signup({ username: `hav2${suffix}` });
			const emojiRole = await role(
				alice,
				{
					name: `hono v2 emoji manager ${suffix}`,
				},
				{
					canManageCustomEmojis: { priority: 0, useDefault: false, value: true },
				},
			);
			const assign = await api(
				'admin/roles/assign',
				{
					roleId: emojiRole.id,
					userId: manager.id,
				},
				alice,
			);
			expect(assign.status).toBe(204);

			const localFirst = await insertEmojiInDatabase(db, {
				id: genId(now - 3000),
				name: `hv2emoji${suffix}a`,
				host: null,
				aliases: [],
				category: null,
				originalUrl: `${origin}/emoji/${suffix}/v2-a-original.webp`,
				publicUrl: '',
				license: null,
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});
			const localSecond = await insertEmojiInDatabase(db, {
				id: genId(now - 2000),
				name: `hv2emoji${suffix}b`,
				host: null,
				aliases: [],
				category: null,
				originalUrl: `${origin}/emoji/${suffix}/v2-b-original.webp`,
				publicUrl: `${origin}/emoji/${suffix}/v2-b-public.webp`,
				license: null,
				isSensitive: true,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});
			const remoteHost = `hono-v2-emoji-${suffix}.example`;
			const remoteEmoji = await insertEmojiInDatabase(db, {
				id: genId(now - 1000),
				name: `hv2emoji${suffix}c`,
				host: remoteHost,
				aliases: [],
				category: null,
				originalUrl: `https://${remoteHost}/emoji/v2-c.webp`,
				publicUrl: '',
				license: null,
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});

			try {
				const listed = await api(
					'v2/admin/emoji/list',
					{
						query: { name: `hv2emoji${suffix}`, hostType: 'local' },
						limit: 10,
						sortKeys: ['+id'],
					},
					manager,
				);
				expect(listed.status).toBe(200);
				expect(listed.body.emojis.map((e: any) => e.id)).toStrictEqual([localFirst.id, localSecond.id]);
				expect(listed.body.count).toBe(2);
				expect(listed.body.allCount).toBe(2);
				expect(listed.body.allPages).toBe(1);
				expect(getAt(listed.body.emojis, 0).originalUrl).toBe(localFirst.originalUrl);
				expect(getAt(listed.body.emojis, 1).publicUrl).toBe(localSecond.publicUrl);
				expect(getAt(listed.body.emojis, 1).isSensitive).toBe(true);

				const remoteListed = await api(
					'v2/admin/emoji/list',
					{
						query: { name: `hv2emoji${suffix}`, hostType: 'remote' },
						limit: 10,
					},
					manager,
				);
				expect(remoteListed.status).toBe(200);
				expect(remoteListed.body.emojis.map((e: any) => e.id)).toStrictEqual([remoteEmoji.id]);
				expect(getAt(remoteListed.body.emojis, 0).host).toBe(remoteHost);

				const paged = await api(
					'v2/admin/emoji/list',
					{
						query: { name: `hv2emoji${suffix}` },
						limit: 1,
						page: 2,
						sortKeys: ['+id'],
					},
					manager,
				);
				expect(paged.status).toBe(200);
				expect(paged.body.emojis.map((e: any) => e.id)).toStrictEqual([localSecond.id]);
				expect(paged.body.count).toBe(1);
				expect(paged.body.allCount).toBe(3);
				expect(paged.body.allPages).toBe(3);

				const roleDenied = await api('v2/admin/emoji/list', {}, bob);
				expect(roleDenied.status).toBe(403);
				expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

				const wrongScopeToken = await createAppToken(manager, ['read:admin:meta']);
				const scopeDenied = await api('v2/admin/emoji/list', {}, { token: wrongScopeToken });
				expect(scopeDenied.status).toBe(403);
				expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');
			} finally {
				await api(
					'admin/roles/unassign',
					{
						roleId: emojiRole.id,
						userId: manager.id,
					},
					alice,
				);
				await api(
					'admin/roles/delete',
					{
						roleId: emojiRole.id,
					},
					alice,
				);
			}
		});

		test('admin/emoji/add と update はDB更新、moderation log、scope、role policyを維持する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const manager = await signup({ username: `haemw${suffix}` });
			const emojiRole = await role(
				alice,
				{
					name: `hono emoji write manager ${suffix}`,
				},
				{
					canManageCustomEmojis: { priority: 0, useDefault: false, value: true },
				},
			);
			const assign = await api(
				'admin/roles/assign',
				{
					roleId: emojiRole.id,
					userId: manager.id,
				},
				alice,
			);
			expect(assign.status).toBe(204);

			const addMd5 = createHash('md5').update(`hono-emoji-add-${suffix}`).digest('hex');
			const addFile = await createDriveFileInDatabase(db, {
				id: genId(now - 1000),
				userId: manager.id,
				userHost: null,
				md5: addMd5,
				name: `hono-emoji-add-${suffix}.png`,
				type: 'image/png',
				size: 101,
				storedInternal: true,
				url: `${origin}/files/${addMd5}`,
			});
			const updateMd5 = createHash('md5').update(`hono-emoji-update-${suffix}`).digest('hex');
			const updateFile = await createDriveFileInDatabase(db, {
				id: genId(now),
				userId: manager.id,
				userHost: null,
				md5: updateMd5,
				name: `hono-emoji-update-${suffix}.png`,
				type: 'image/png',
				size: 202,
				storedInternal: true,
				url: `${origin}/files/${updateMd5}`,
			});

			try {
				const wrongScopeToken = await createAppToken(manager, ['read:admin:emoji']);
				const scopeDenied = await api(
					'admin/emoji/add',
					{
						name: `honoemoji_scope_${suffix}`,
						fileId: addFile.id,
					},
					{ token: wrongScopeToken },
				);
				expect(scopeDenied.status).toBe(403);
				expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

				const added = await api(
					'admin/emoji/add',
					{
						name: `honoemoji_add_${suffix}`,
						fileId: addFile.id,
						category: `write_${suffix}`,
						aliases: [`alias_${suffix}`],
						license: `license ${suffix}`,
						isSensitive: true,
						localOnly: true,
						roleIdsThatCanBeUsedThisEmojiAsReaction: [],
					},
					manager,
				);
				expect(added.status).toBe(200);
				expect(added.body.name).toBe(`honoemoji_add_${suffix}`);
				expect(added.body.url).toBe(addFile.url);
				expect(added.body.category).toBe(`write_${suffix}`);
				expect(added.body.aliases).toStrictEqual([`alias_${suffix}`]);
				expect(added.body.license).toBe(`license ${suffix}`);
				expect(added.body.isSensitive).toBe(true);
				expect(added.body.localOnly).toBe(true);

				const duplicate = await api(
					'admin/emoji/add',
					{
						name: `honoemoji_add_${suffix}`,
						fileId: addFile.id,
					},
					manager,
				);
				expect(duplicate.status).toBe(400);
				expect(castAsError(duplicate.body as any).error.code).toBe('DUPLICATE_NAME');

				const roleDenied = await api(
					'admin/emoji/update',
					{
						id: added.body.id,
						category: `denied_${suffix}`,
					},
					bob,
				);
				expect(roleDenied.status).toBe(403);
				expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

				const updated = await api(
					'admin/emoji/update',
					{
						id: added.body.id,
						name: `honoemoji_updated_${suffix}`,
						fileId: updateFile.id,
						category: null,
						aliases: [`updated_${suffix}`],
						license: null,
						isSensitive: false,
						localOnly: false,
						roleIdsThatCanBeUsedThisEmojiAsReaction: [],
					},
					manager,
				);
				expect(updated.status).toBe(204);

				const after = await fetchEmojiByIdOrFailFromDatabase(db, added.body.id);
				expect(after.name).toBe(`honoemoji_updated_${suffix}`);
				expect(after.category).toBe(null);
				expect(after.aliases).toStrictEqual([`updated_${suffix}`]);
				expect(after.license).toBe(null);
				expect(after.isSensitive).toBe(false);
				expect(after.localOnly).toBe(false);
				expect(after.originalUrl).toBe(updateFile.url);
				expect(after.publicUrl).toBe(updateFile.url);
				expect(after.type).toBe(updateFile.type);
				assert.ok(after.updatedAt);

				const renamedDuplicate = await api(
					'admin/emoji/update',
					{
						id: after.id,
						name: after.name,
					},
					manager,
				);
				expect(renamedDuplicate.status).toBe(204);

				const logs = await listModerationLogsFromDatabase(db, {
					limit: 20,
					order: 'desc',
					userId: manager.id,
					search: suffix,
				});
				assert.ok(logs.some((log) => log.type === 'addCustomEmoji'));
				assert.ok(logs.some((log) => log.type === 'updateCustomEmoji'));
			} finally {
				await api(
					'admin/roles/unassign',
					{
						roleId: emojiRole.id,
						userId: manager.id,
					},
					alice,
				);
				await api(
					'admin/roles/delete',
					{
						roleId: emojiRole.id,
					},
					alice,
				);
			}
		});

		test('admin/emoji/copy は remote emoji を Drive に取り込み、local emoji、log、scope、role policyを維持する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const manager = await signup({ username: `haemc${suffix}` });
			const emojiRole = await role(
				alice,
				{
					name: `hono emoji copy manager ${suffix}`,
				},
				{
					canManageCustomEmojis: { priority: 0, useDefault: false, value: true },
				},
			);
			const assign = await api(
				'admin/roles/assign',
				{
					roleId: emojiRole.id,
					userId: manager.id,
				},
				alice,
			);
			expect(assign.status).toBe(204);

			const png = Buffer.from(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
				'base64',
			);
			let imageServer: Server | undefined;
			await new Promise<void>((resolve) => {
				imageServer = createServer((_req, res) => {
					res.writeHead(200, {
						'Content-Type': 'image/png',
						'Content-Disposition': `inline; filename="honoemoji_copy_${suffix}.png"`,
					});
					res.end(png);
				});
				imageServer.listen(0, '127.0.0.1', () => resolve());
			});
			const address = imageServer!.address() as AddressInfo;
			const imageUrl = `http://127.0.0.1:${address.port}/honoemoji_copy_${suffix}.png`;

			const remote = await insertEmojiInDatabase(db, {
				id: genId(now),
				name: `honoemoji_copy_${suffix}`,
				host: `copy-${suffix}.remote`,
				aliases: [`copy_alias_${suffix}`],
				category: `copy_category_${suffix}`,
				originalUrl: imageUrl,
				publicUrl: '',
				license: `copy license ${suffix}`,
				isSensitive: true,
				localOnly: true,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});

			try {
				const wrongScopeToken = await createAppToken(manager, ['read:admin:emoji']);
				const scopeDenied = await api('admin/emoji/copy', { emojiId: remote.id }, { token: wrongScopeToken });
				expect(scopeDenied.status).toBe(403);
				expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

				const roleDenied = await api('admin/emoji/copy', { emojiId: remote.id }, bob);
				expect(roleDenied.status).toBe(403);
				expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

				const copied = await api('admin/emoji/copy', { emojiId: remote.id }, manager);
				expect(copied.status).toBe(200);
				const copiedBody = copied.body as any;
				expect(copiedBody.name).toBe(remote.name);
				expect(copiedBody.host).toBe(null);
				expect(copiedBody.aliases).toStrictEqual([`copy_alias_${suffix}`]);
				expect(copiedBody.category).toBe(`copy_category_${suffix}`);
				expect(copiedBody.license).toBe(`copy license ${suffix}`);
				expect(copiedBody.isSensitive).toBe(true);
				expect(copiedBody.localOnly).toBe(true);

				const copiedEmoji = await fetchEmojiByIdOrFailFromDatabase(db, copiedBody.id);
				expect(copiedEmoji.host).toBe(null);
				expect(copiedEmoji.name).toBe(remote.name);
				expect(copiedEmoji.originalUrl).not.toBe(remote.originalUrl);
				expect(copiedEmoji.publicUrl).toBe(copiedEmoji.originalUrl);
				expect(copiedEmoji.type).toBe('image/png');

				const driveFile = await fetchDriveFileByUrlFromDatabase(db, copiedEmoji.originalUrl);
				assert.ok(driveFile);
				expect(driveFile.userId).toBe(null);
				expect(driveFile.userHost).toBe(null);
				expect(driveFile.src).toBe(imageUrl);
				expect(driveFile.type).toBe('image/png');

				const logs = await listModerationLogsFromDatabase(db, {
					limit: 10,
					order: 'desc',
					type: 'addCustomEmoji',
					userId: manager.id,
					search: suffix,
				});
				assert.ok(logs.some((log) => (log.info as any).emojiId === copiedEmoji.id));

				const duplicate = await api('admin/emoji/copy', { emojiId: remote.id }, manager);
				expect(duplicate.status).toBe(400);
				expect(castAsError(duplicate.body as any).error.code).toBe('DUPLICATE_NAME');
			} finally {
				await new Promise<void>((resolve, reject) => {
					imageServer?.close((err) => (err ? reject(err) : resolve()));
				});
				await api(
					'admin/roles/unassign',
					{
						roleId: emojiRole.id,
						userId: manager.id,
					},
					alice,
				);
				await api(
					'admin/roles/delete',
					{
						roleId: emojiRole.id,
					},
					alice,
				);
			}
		});

		test('admin/emoji bulk metadata 更新は aliases、category、license、scope、role policyを維持する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const manager = await signup({ username: `haemb${suffix}` });
			const emojiRole = await role(
				alice,
				{
					name: `hono emoji bulk manager ${suffix}`,
				},
				{
					canManageCustomEmojis: { priority: 0, useDefault: false, value: true },
				},
			);
			const assign = await api(
				'admin/roles/assign',
				{
					roleId: emojiRole.id,
					userId: manager.id,
				},
				alice,
			);
			expect(assign.status).toBe(204);

			const first = await insertEmojiInDatabase(db, {
				id: genId(now - 1000),
				name: `honoemoji_bulk_first_${suffix}`,
				host: null,
				aliases: [`base_${suffix}`],
				category: null,
				originalUrl: `${origin}/emoji/${suffix}/bulk-first.webp`,
				publicUrl: '',
				license: null,
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});
			const second = await insertEmojiInDatabase(db, {
				id: genId(now),
				name: `honoemoji_bulk_second_${suffix}`,
				host: null,
				aliases: [],
				category: null,
				originalUrl: `${origin}/emoji/${suffix}/bulk-second.webp`,
				publicUrl: '',
				license: null,
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});

			try {
				const missing = await api(
					'admin/emoji/set-category-bulk',
					{
						ids: [first.id, 'zzzzzzzzzzzzzzzzzzzzzzzzzz'],
						category: `must_rollback_${suffix}`,
					},
					manager,
				);
				expect(missing.status).toBe(400);
				expect(castAsError(missing.body as any).error.id).toBe('756e37b2-8e81-421c-9d18-740a6932d57f');
				expect((await fetchEmojiByIdOrFailFromDatabase(db, first.id)).category).toBe(null);

				const addAliases = await api(
					'admin/emoji/add-aliases-bulk',
					{
						ids: [first.id, second.id],
						aliases: [`added_${suffix}`, `base_${suffix}`],
					},
					manager,
				);
				expect(addAliases.status).toBe(204);

				let afterFirst = await fetchEmojiByIdOrFailFromDatabase(db, first.id);
				let afterSecond = await fetchEmojiByIdOrFailFromDatabase(db, second.id);
				expect(afterFirst.aliases).toStrictEqual([`base_${suffix}`, `added_${suffix}`]);
				expect(afterSecond.aliases).toStrictEqual([`added_${suffix}`, `base_${suffix}`]);

				const removeAliases = await api(
					'admin/emoji/remove-aliases-bulk',
					{
						ids: [first.id],
						aliases: [`base_${suffix}`],
					},
					manager,
				);
				expect(removeAliases.status).toBe(204);
				afterFirst = await fetchEmojiByIdOrFailFromDatabase(db, first.id);
				expect(afterFirst.aliases).toStrictEqual([`added_${suffix}`]);

				const setAliases = await api(
					'admin/emoji/set-aliases-bulk',
					{
						ids: [second.id],
						aliases: [`final_${suffix}`],
					},
					manager,
				);
				expect(setAliases.status).toBe(204);

				const setCategory = await api(
					'admin/emoji/set-category-bulk',
					{
						ids: [first.id, second.id],
						category: `bulk_category_${suffix}`,
					},
					manager,
				);
				expect(setCategory.status).toBe(204);

				const setLicense = await api(
					'admin/emoji/set-license-bulk',
					{
						ids: [first.id, second.id],
						license: `bulk license ${suffix}`,
					},
					manager,
				);
				expect(setLicense.status).toBe(204);

				const resetLicense = await api(
					'admin/emoji/set-license-bulk',
					{
						ids: [second.id],
						license: null,
					},
					manager,
				);
				expect(resetLicense.status).toBe(204);

				afterFirst = await fetchEmojiByIdOrFailFromDatabase(db, first.id);
				afterSecond = await fetchEmojiByIdOrFailFromDatabase(db, second.id);
				expect(afterFirst.aliases).toStrictEqual([`added_${suffix}`]);
				expect(afterSecond.aliases).toStrictEqual([`final_${suffix}`]);
				expect(afterFirst.category).toBe(`bulk_category_${suffix}`);
				expect(afterSecond.category).toBe(`bulk_category_${suffix}`);
				expect(afterFirst.license).toBe(`bulk license ${suffix}`);
				expect(afterSecond.license).toBe(null);
				assert.ok(afterFirst.updatedAt);
				assert.ok(afterSecond.updatedAt);

				const token = await createAppToken(manager, ['write:admin:emoji']);
				const tokenUpdated = await api(
					'admin/emoji/set-category-bulk',
					{
						ids: [first.id],
						category: null,
					},
					{ token },
				);
				expect(tokenUpdated.status).toBe(204);
				afterFirst = await fetchEmojiByIdOrFailFromDatabase(db, first.id);
				expect(afterFirst.category).toBe(null);

				const wrongScopeToken = await createAppToken(manager, ['read:admin:emoji']);
				const scopeDenied = await api(
					'admin/emoji/set-aliases-bulk',
					{
						ids: [first.id],
						aliases: [],
					},
					{ token: wrongScopeToken },
				);
				expect(scopeDenied.status).toBe(403);
				expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

				const roleDenied = await api(
					'admin/emoji/set-category-bulk',
					{
						ids: [first.id],
						category: `denied_${suffix}`,
					},
					bob,
				);
				expect(roleDenied.status).toBe(403);
				expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
			} finally {
				await api(
					'admin/roles/unassign',
					{
						roleId: emojiRole.id,
						userId: manager.id,
					},
					alice,
				);
				await api(
					'admin/roles/delete',
					{
						roleId: emojiRole.id,
					},
					alice,
				);
			}
		});

		test('admin/emoji/delete と delete-bulk はDB削除、moderation log、scope、role policyを維持する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const manager = await signup({ username: `haemd${suffix}` });
			const emojiRole = await role(
				alice,
				{
					name: `hono emoji delete manager ${suffix}`,
				},
				{
					canManageCustomEmojis: { priority: 0, useDefault: false, value: true },
				},
			);
			const assign = await api(
				'admin/roles/assign',
				{
					roleId: emojiRole.id,
					userId: manager.id,
				},
				alice,
			);
			expect(assign.status).toBe(204);

			const single = await insertEmojiInDatabase(db, {
				id: genId(now - 2000),
				name: `honoemoji_delete_single_${suffix}`,
				host: null,
				aliases: [],
				category: `delete_${suffix}`,
				originalUrl: `${origin}/emoji/${suffix}/delete-single.webp`,
				publicUrl: '',
				license: null,
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});
			const bulkFirst = await insertEmojiInDatabase(db, {
				id: genId(now - 1000),
				name: `honoemoji_delete_bulk_first_${suffix}`,
				host: null,
				aliases: [],
				category: `delete_${suffix}`,
				originalUrl: `${origin}/emoji/${suffix}/delete-bulk-first.webp`,
				publicUrl: '',
				license: null,
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});
			const bulkSecond = await insertEmojiInDatabase(db, {
				id: genId(now),
				name: `honoemoji_delete_bulk_second_${suffix}`,
				host: null,
				aliases: [],
				category: `delete_${suffix}`,
				originalUrl: `${origin}/emoji/${suffix}/delete-bulk-second.webp`,
				publicUrl: '',
				license: null,
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});

			try {
				const deleted = await api('admin/emoji/delete', { id: single.id }, manager);
				expect(deleted.status).toBe(204);
				expect(await fetchEmojiByIdFromDatabase(db, single.id)).toBe(null);
				const deletedAgain = await api('admin/emoji/delete', { id: single.id }, manager);
				expect(deletedAgain.status).toBe(400);
				expect(castAsError(deletedAgain.body as any).error.id).toBe('be83669b-773a-44b7-b1f8-e5e5170ac3c2');

				const deletedBulk = await api(
					'admin/emoji/delete-bulk',
					{
						ids: [bulkFirst.id, bulkSecond.id],
					},
					manager,
				);
				expect(deletedBulk.status).toBe(204);
				expect(await fetchEmojiByIdFromDatabase(db, bulkFirst.id)).toBe(null);
				expect(await fetchEmojiByIdFromDatabase(db, bulkSecond.id)).toBe(null);

				for (let i = 0; i < 10; i++) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type: 'deleteCustomEmoji',
						search: suffix,
					});
					if (logs.length >= 3) {
						expect(logs.some((log) => (log.info as any).emojiId === single.id)).toBe(true);
						expect(logs.some((log) => (log.info as any).emojiId === bulkFirst.id)).toBe(true);
						expect(logs.some((log) => (log.info as any).emojiId === bulkSecond.id)).toBe(true);
						break;
					}
					await new Promise((resolve) => setTimeout(resolve, 100));
					if (i === 9) assert.fail('deleteCustomEmoji moderation logs were not found');
				}

				const tokenTarget = await insertEmojiInDatabase(db, {
					id: genId(now + 1000),
					name: `honoemoji_delete_token_${suffix}`,
					host: null,
					aliases: [],
					category: null,
					originalUrl: `${origin}/emoji/${suffix}/delete-token.webp`,
					publicUrl: '',
					license: null,
					isSensitive: false,
					localOnly: false,
					roleIdsThatCanBeUsedThisEmojiAsReaction: [],
				});
				const token = await createAppToken(manager, ['write:admin:emoji']);
				const deletedByToken = await api('admin/emoji/delete', { id: tokenTarget.id }, { token });
				expect(deletedByToken.status).toBe(204);
				expect(await fetchEmojiByIdFromDatabase(db, tokenTarget.id)).toBe(null);

				const wrongScopeToken = await createAppToken(manager, ['read:admin:emoji']);
				const scopeDenied = await api(
					'admin/emoji/delete-bulk',
					{
						ids: [tokenTarget.id],
					},
					{ token: wrongScopeToken },
				);
				expect(scopeDenied.status).toBe(403);
				expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

				const roleDenied = await api('admin/emoji/delete', { id: tokenTarget.id }, bob);
				expect(roleDenied.status).toBe(403);
				expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
			} finally {
				await api(
					'admin/roles/unassign',
					{
						roleId: emojiRole.id,
						userId: manager.id,
					},
					alice,
				);
				await api(
					'admin/roles/delete',
					{
						roleId: emojiRole.id,
					},
					alice,
				);
			}
		});

		test('admin/emoji/import-zip は import job、secure credential、role policyを維持する', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const manager = await signup({ username: `haemi${suffix}` });
			const emojiRole = await role(
				alice,
				{
					name: `hono emoji import manager ${suffix}`,
				},
				{
					canManageCustomEmojis: { priority: 0, useDefault: false, value: true },
				},
			);
			const assign = await api(
				'admin/roles/assign',
				{
					roleId: emojiRole.id,
					userId: manager.id,
				},
				alice,
			);
			expect(assign.status).toBe(204);

			const fileId = genId(now);
			const removeImportJobs = async () => {
				const jobs = await dbQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
				await Promise.all(
					jobs
						.filter(
							(job) =>
								job.name === 'importCustomEmojis' && (job.data as DbJobData<'importCustomEmojis'>).fileId === fileId,
						)
						.map((job) => job.remove()),
				);
			};

			try {
				const imported = await api('admin/emoji/import-zip', { fileId }, manager);
				expect(imported.status).toBe(204);

				let job: Bull.Job<DbJobData<'importCustomEmojis' | 'deleteAccount'>> | undefined;
				for (let i = 0; i < 10; i++) {
					const jobs = await dbQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
					job = jobs.find(
						(job) =>
							job.name === 'importCustomEmojis' &&
							(job.data as DbJobData<'importCustomEmojis'>).fileId === fileId &&
							job.data.user.id === manager.id,
					);
					if (job != null) break;
					await new Promise((resolve) => setTimeout(resolve, 100));
				}
				assert.ok(job);
				expect(job.data as DbJobData<'importCustomEmojis'>).toStrictEqual({
					user: { id: manager.id },
					fileId,
				});

				const token = await createAppToken(manager, ['write:admin:emoji']);
				const appDenied = await api('admin/emoji/import-zip', { fileId: genId(now + 1) }, { token });
				expect(appDenied.status).toBe(400);
				expect(castAsError(appDenied.body as any).error.code).toBe('ACCESS_DENIED');

				const roleDenied = await api('admin/emoji/import-zip', { fileId: genId(now + 2) }, bob);
				expect(roleDenied.status).toBe(403);
				expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
			} finally {
				await removeImportJobs();
				await api(
					'admin/roles/unassign',
					{
						roleId: emojiRole.id,
						userId: manager.id,
					},
					alice,
				);
				await api(
					'admin/roles/delete',
					{
						roleId: emojiRole.id,
					},
					alice,
				);
			}
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

	describe('signin-flow', () => {
		test('間違ったパスワードでサインインできない', async () => {
			const res = await api('signin-flow', {
				username: alice.username,
				password: 'bar',
			});

			expect(res.status).toBe(403);
			expect(castAsError(res.body as any).error.code).toBe('AUTHENTICATION_FAILED');
			expect(castAsError(res.body as any).error.kind).toBe('permission');
		});

		test('クエリをインジェクションできない', async () => {
			const res = await api('signin-flow', {
				username: alice.username,
				// @ts-expect-error password must be string
				password: {
					$gt: '',
				},
			});

			expect(res.status).toBe(400);
			expect(castAsError(res.body as any).error.code).toBe('INVALID_PARAM');
			expect(castAsError(res.body as any).error.kind).toBe('client');
		});

		test('正しい情報でサインインできる', async () => {
			const res = await api('signin-flow', {
				username: 'test1',
				password: 'test1',
			});

			expect(res.status).toBe(200);
		});
	});

	describe('signin-with-passkey', () => {
		test('パスキーサインインの challenge を開始できる', async () => {
			const res = await api('signin-with-passkey', {});

			expect(res.status).toBe(200);
			expect(typeof res.body.context).toBe('string');
			expect(typeof res.body.option.challenge).toBe('string');
		});
	});

	describe('signin history endpoints', () => {
		test('i/signin-history returns own signin records', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const older = await createSigninInDatabase(db, {
				id: genId(now - 2000),
				userId: alice.id,
				ip: '192.0.2.10',
				headers: { 'user-agent': 'hono-signin-history-older' },
				success: true,
			});
			const newer = await createSigninInDatabase(db, {
				id: genId(now - 1000),
				userId: alice.id,
				ip: '192.0.2.11',
				headers: { 'user-agent': 'hono-signin-history-newer' },
				success: false,
			});
			const otherUser = await createSigninInDatabase(db, {
				id: genId(now),
				userId: bob.id,
				ip: '192.0.2.12',
				headers: { 'user-agent': 'hono-signin-history-other' },
				success: true,
			});

			const history = await api('i/signin-history', { limit: 20 }, alice);
			expect(history.status).toBe(200);
			const newerIndex = history.body.findIndex((item) => item.id === newer.id);
			const olderIndex = history.body.findIndex((item) => item.id === older.id);
			assert.ok(newerIndex >= 0);
			assert.ok(olderIndex >= 0);
			assert.ok(newerIndex < olderIndex);
			expect(getAt(history.body, newerIndex).createdAt).toBe(new Date(now - 1000).toISOString());
			expect(getAt(history.body, newerIndex).ip).toBe(newer.ip);
			expect(getAt(history.body, newerIndex).headers).toStrictEqual(newer.headers);
			expect(getAt(history.body, newerIndex).success).toBe(false);
			expect(history.body.some((item) => item.id === otherUser.id)).toBe(false);

			const afterOlder = await api('i/signin-history', { sinceId: older.id, limit: 20 }, alice);
			expect(afterOlder.status).toBe(200);
			expect(afterOlder.body.some((item) => item.id === newer.id)).toBe(true);
			expect(afterOlder.body.some((item) => item.id === older.id)).toBe(false);
		});
	});

	describe('registry endpoints', () => {
		test('i/registry endpoints store native and app-token scoped values', async () => {
			const now = Date.now();
			const nativeScope = ['hono', 'registry'];
			const nativeKey = `native_${now}`;
			const nativeValue = {
				enabled: true,
				count: 2,
				items: ['alpha', 'beta'],
			};

			const setNative = await api(
				'i/registry/set',
				{
					scope: nativeScope,
					key: nativeKey,
					value: nativeValue,
				},
				alice,
			);
			expect(setNative.status).toBe(204);

			const gotNative = await api(
				'i/registry/get',
				{
					scope: nativeScope,
					key: nativeKey,
				},
				alice,
			);
			expect(gotNative.status).toBe(200);
			expect(gotNative.body).toStrictEqual(nativeValue);

			const detail = await api(
				'i/registry/get-detail',
				{
					scope: nativeScope,
					key: nativeKey,
				},
				alice,
			);
			expect(detail.status).toBe(200);
			expect(typeof detail.body.updatedAt).toBe('string');
			expect(detail.body.value).toStrictEqual(nativeValue);

			const all = await api(
				'i/registry/get-all',
				{
					scope: nativeScope,
				},
				alice,
			);
			expect(all.status).toBe(200);
			expect(all.body[nativeKey]).toStrictEqual(nativeValue);

			const keys = await api(
				'i/registry/keys',
				{
					scope: nativeScope,
				},
				alice,
			);
			expect(keys.status).toBe(200);
			assert.ok(keys.body.includes(nativeKey));

			const keysWithType = await api(
				'i/registry/keys-with-type',
				{
					scope: nativeScope,
				},
				alice,
			);
			expect(keysWithType.status).toBe(200);
			expect(keysWithType.body[nativeKey]).toBe('object');

			const appToken = await createAppToken(alice, ['read:account', 'write:account']);
			const appScope = ['hono', 'registry_app'];
			const appKey = `app_${now}`;
			const appValue = ['from', 'app'];
			const setApp = await api(
				'i/registry/set',
				{
					scope: appScope,
					key: appKey,
					value: appValue,
				},
				{ token: appToken },
			);
			expect(setApp.status).toBe(204);

			const gotApp = await api(
				'i/registry/get',
				{
					scope: appScope,
					key: appKey,
				},
				{ token: appToken },
			);
			expect(gotApp.status).toBe(200);
			expect(gotApp.body).toStrictEqual(appValue);

			const nativeCannotReadAppDomain = await api(
				'i/registry/get',
				{
					scope: appScope,
					key: appKey,
				},
				alice,
			);
			expect(nativeCannotReadAppDomain.status).toBe(400);
			expect(castAsError(nativeCannotReadAppDomain.body as any).error.code).toBe('NO_SUCH_KEY');

			const scopesWithDomain = await api('i/registry/scopes-with-domain', {}, alice);
			expect(scopesWithDomain.status).toBe(200);
			assert.ok(
				scopesWithDomain.body.some(
					(item) => item.domain === null && item.scopes.some((scope) => scope.join('.') === nativeScope.join('.')),
				),
			);
			assert.ok(
				scopesWithDomain.body.some(
					(item) => item.domain != null && item.scopes.some((scope) => scope.join('.') === appScope.join('.')),
				),
			);

			const appDenied = await api('i/registry/scopes-with-domain', {}, { token: appToken });
			expect(appDenied.status).toBe(400);
			expect(castAsError(appDenied.body as any).error.code).toBe('ACCESS_DENIED');

			const removed = await api(
				'i/registry/remove',
				{
					scope: nativeScope,
					key: nativeKey,
				},
				alice,
			);
			expect(removed.status).toBe(204);
			const afterRemove = await api(
				'i/registry/get',
				{
					scope: nativeScope,
					key: nativeKey,
				},
				alice,
			);
			expect(afterRemove.status).toBe(400);
			expect(castAsError(afterRemove.body as any).error.code).toBe('NO_SUCH_KEY');
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

	describe('sw endpoints', () => {
		test('sw/show-registration returns own subscription or null', async () => {
			const endpoint = `https://push.example.test/${genId()}`;
			await createSwSubscriptionInDatabase(db, {
				id: genId(),
				userId: alice.id,
				endpoint,
				auth: 'auth-secret',
				publickey: 'public-key',
				sendReadMessage: true,
			});

			const shown = await api('sw/show-registration', { endpoint }, alice);
			expect(shown.status).toBe(200);
			expect(shown.body).toStrictEqual({
				userId: alice.id,
				endpoint,
				sendReadMessage: true,
			});

			const missing = await api('sw/show-registration', { endpoint }, bob);
			expect(missing.status).toBe(200);
			expect(missing.body).toBe(null);

			const appToken = await createAppToken(alice, ['read:account']);
			const appDenied = await api('sw/show-registration', { endpoint }, { token: appToken });
			expect(appDenied.status).toBe(400);
			expect(castAsError(appDenied.body as any).error.code).toBe('ACCESS_DENIED');
		});

		test('sw registration lifecycle creates, updates, and unregisters subscriptions', async () => {
			const endpoint = `https://push.example.test/lifecycle-${genId()}`;

			const registered = await api(
				'sw/register',
				{
					endpoint,
					auth: 'auth-1',
					publickey: 'public-key-1',
					sendReadMessage: true,
				},
				alice,
			);
			expect(registered.status).toBe(200);
			expect(registered.body.state).toBe('subscribed');
			expect(registered.body.userId).toBe(alice.id);
			expect(registered.body.endpoint).toBe(endpoint);
			expect(registered.body.sendReadMessage).toBe(true);

			const same = await api(
				'sw/register',
				{
					endpoint,
					auth: 'auth-1',
					publickey: 'public-key-1',
					sendReadMessage: true,
				},
				alice,
			);
			expect(same.status).toBe(200);
			expect(same.body.state).toBe('already-subscribed');

			const updated = await api(
				'sw/update-registration',
				{
					endpoint,
					sendReadMessage: false,
				},
				alice,
			);
			expect(updated.status).toBe(200);
			expect(updated.body).toStrictEqual({
				userId: alice.id,
				endpoint,
				sendReadMessage: false,
			});

			const missingUpdate = await api(
				'sw/update-registration',
				{
					endpoint,
				},
				bob,
			);
			expect(missingUpdate.status).toBe(400);
			expect(castAsError(missingUpdate.body as any).error.code).toBe('NO_SUCH_REGISTRATION');

			const unregistered = await api('sw/unregister', { endpoint }, alice);
			expect(unregistered.status).toBe(204);
			expect(unregistered.body).toBe(null);

			const afterUnregister = await api('sw/show-registration', { endpoint }, alice);
			expect(afterUnregister.status).toBe(200);
			expect(afterUnregister.body).toBe(null);
		});

		test('sw secure endpoints reject app tokens and unregister accepts anonymous requests', async () => {
			const endpoint = `https://push.example.test/anonymous-${genId()}`;
			await api(
				'sw/register',
				{
					endpoint,
					auth: 'auth',
					publickey: 'public-key',
				},
				alice,
			);

			const appToken = await createAppToken(alice, ['read:account']);
			const appRegisterDenied = await api(
				'sw/register',
				{
					endpoint: `${endpoint}-app`,
					auth: 'auth',
					publickey: 'public-key',
				},
				{ token: appToken },
			);
			expect(appRegisterDenied.status).toBe(400);
			expect(castAsError(appRegisterDenied.body as any).error.code).toBe('ACCESS_DENIED');

			const appUpdateDenied = await api('sw/update-registration', { endpoint }, { token: appToken });
			expect(appUpdateDenied.status).toBe(400);
			expect(castAsError(appUpdateDenied.body as any).error.code).toBe('ACCESS_DENIED');

			const anonymousUnregister = await api('sw/unregister', { endpoint });
			expect(anonymousUnregister.status).toBe(204);

			const afterAnonymousUnregister = await api('sw/show-registration', { endpoint }, alice);
			expect(afterAnonymousUnregister.status).toBe(200);
			expect(afterAnonymousUnregister.body).toBe(null);
		});
	});

	describe('request-reset-password endpoint', () => {
		test('request-reset-password silently accepts unknown users and validates params', async () => {
			const accepted = await api('request-reset-password', {
				username: 'missing_reset_user',
				email: 'missing-reset-user@example.test',
			});
			expect(accepted.status).toBe(204);
			expect(accepted.body).toBe(null);

			const invalid = await api('request-reset-password', {
				username: 'missing_reset_user',
			} as any);
			expect(invalid.status).toBe(400);
			expect(castAsError(invalid.body as any).error.code).toBe('INVALID_PARAM');
		});
	});

	describe('reset-password endpoint', () => {
		test('reset-password updates password and consumes reset token', async () => {
			const token = `reset-token-${genId()}`;
			await createPasswordResetRequestInDatabase(db, {
				id: genId(),
				userId: carol.id,
				token,
			});

			const reset = await api('reset-password', {
				token,
				password: 'new-reset-password',
			});
			expect(reset.status).toBe(204);
			expect(reset.body).toBe(null);

			// 使用済み・存在しない・期限切れのトークンは利用者側の事情なので、
			// 500 INTERNAL_ERROR ではなく理由の分かるAPIエラーで返す
			const reused = await api('reset-password', {
				token,
				password: 'reused-reset-password',
			});
			expect(reused.status, JSON.stringify(reused.body)).toBe(400);
			expect(castAsError(reused.body as any).error.code).toBe('INVALID_TOKEN');

			const unknown = await api('reset-password', {
				token: `reset-token-${genId()}`,
				password: 'unknown-reset-password',
			});
			expect(unknown.status, JSON.stringify(unknown.body)).toBe(400);
			expect(castAsError(unknown.body as any).error.code).toBe('INVALID_TOKEN');

			// 30分より前に発行されたトークン (idに時刻が埋まっている) は期限切れ扱い
			const expiredToken = `reset-token-expired-${genId()}`;
			await createPasswordResetRequestInDatabase(db, {
				id: genId(Date.now() - 1000 * 60 * 31),
				userId: carol.id,
				token: expiredToken,
			});
			const expired = await api('reset-password', {
				token: expiredToken,
				password: 'expired-reset-password',
			});
			expect(expired.status, JSON.stringify(expired.body)).toBe(400);
			expect(castAsError(expired.body as any).error.code).toBe('INVALID_TOKEN');

			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, carol.id);
			const [matchesNewPassword, matchesReusedPassword] = await Promise.all([
				bunPassword.verify('new-reset-password', profile.password!, 'bcrypt'),
				bunPassword.verify('reused-reset-password', profile.password!, 'bcrypt'),
			]);
			expect(matchesNewPassword).toBe(true);
			expect(matchesReusedPassword).toBe(false);
		});
	});

	describe('パスワード確認を伴うエンドポイント', () => {
		// パスワード誤入力は利用者の入力ミスであって内部エラーではないので、
		// 500 INTERNAL_ERROR ではなく INCORRECT_PASSWORD を返し、副作用も起きないこと
		test('i/change-password は誤ったパスワードでINCORRECT_PASSWORDを返し、パスワードを変えない', async () => {
			const user = await signup();

			const res = await api(
				'i/change-password',
				{
					currentPassword: 'wrong-password',
					newPassword: 'changed-password',
				},
				user,
			);
			expect(res.status, JSON.stringify(res.body)).toBe(400);
			expect(castAsError(res.body as any).error.code).toBe('INCORRECT_PASSWORD');

			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, user.id);
			expect(await bunPassword.verify('test', profile.password!, 'bcrypt')).toBe(true);
		});

		test('i/regenerate-token は誤ったパスワードでINCORRECT_PASSWORDを返し、トークンを変えない', async () => {
			const user = await signup();
			const before = await fetchUserByIdOrFailFromDatabase(db, user.id);

			const res = await api('i/regenerate-token', { password: 'wrong-password' }, user);
			expect(res.status, JSON.stringify(res.body)).toBe(400);
			expect(castAsError(res.body as any).error.code).toBe('INCORRECT_PASSWORD');

			const after = await fetchUserByIdOrFailFromDatabase(db, user.id);
			expect(after.token).toBe(before.token);
		});

		test('i/delete-account は誤ったパスワードでINCORRECT_PASSWORDを返し、アカウントを消さない', async () => {
			const user = await signup();

			const res = await api('i/delete-account', { password: 'wrong-password' }, user);
			expect(res.status, JSON.stringify(res.body)).toBe(400);
			expect(castAsError(res.body as any).error.code).toBe('INCORRECT_PASSWORD');

			const after = await fetchUserByIdOrFailFromDatabase(db, user.id);
			expect(after.isDeleted).toBe(false);
		});
	});

	describe('verify-email endpoint', () => {
		test('verify-email verifies matching code and rejects missing code', async () => {
			const code = `verify-${genId()}`;
			await updateUserProfileInDatabase(db, dave.id, {
				email: 'verify-email@example.test',
				emailVerified: false,
				emailVerifyCode: code,
			});

			const verified = await api('verify-email', { code });
			expect(verified.status).toBe(204);
			expect(verified.body).toBe(null);

			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, dave.id);
			expect(profile.emailVerified).toBe(true);
			expect(profile.emailVerifyCode).toBe(null);

			const missing = await api('verify-email', { code: 'missing-code' });
			expect(missing.status).toBe(400);
			expect(castAsError(missing.body as any).error.code).toBe('NO_SUCH_CODE');
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

	describe('Hono account data endpoints', () => {
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
			expect(castAsError(extendedVisibilityReply.body as any).error.code).toBe('CANNOT_REPLY_TO_SPECIFIED_VISIBILITY_NOTE_WITH_EXTENDED_VISIBILITY');

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

		test('Hono account data endpoints require matching app token permissions', async () => {
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
			expect(await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(db, requestFollower.id, lockedFollowee.id)).toBe(null);

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
			for (let i = 0; i < 10; i++) {
				const jobs = await getExportJobs(jobName, userId);
				if (jobs[0] != null) return jobs[0];
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
			assert.fail(`${jobName} job was not found for ${userId}`);
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

	describe('i/claim-achievement', () => {
		test('達成を記録しachievementEarned通知を作成、二重取得しない', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hca${suffix}` });

			const res = await api('i/claim-achievement', { name: 'notes1' }, user);
			expect(res.status).toBe(204);

			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, user.id);
			assert.ok(profile.achievements.some((a) => a.name === 'notes1'));

			await new Promise((resolve) => setTimeout(resolve, 100));
			const redis = createRedisClient(config);
			try {
				const entries = await redis.xrevrange(`notificationTimeline:${user.id}`, '+', '-', 'COUNT', 10);
				const notifications = entries.map(([, values]) => {
					const dataIndex = values.findIndex((value) => value === 'data');
					return JSON.parse(values[dataIndex + 1]!) as { type?: string; achievement?: string };
				});
				assert.ok(notifications.some((n) => n.type === 'achievementEarned' && n.achievement === 'notes1'));
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

			await new Promise((resolve) => setTimeout(resolve, 100));
			const notifications = await readNotificationTimeline(config, user.id);
			const appNotification = notifications.find((n) => n.type === 'app');
			assert.ok(appNotification);
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

			await new Promise((resolve) => setTimeout(resolve, 100));
			const notifications = await readNotificationTimeline(config, user.id);
			assert.ok(notifications.some((n) => n.type === 'test'));
		});

		test('notifications/mark-all-as-read は既読状態を更新しreadAllNotificationsを発行する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const user = await signup({ username: `hnmar${suffix}` });

			await api('notifications/test-notification', {}, user);
			await new Promise((resolve) => setTimeout(resolve, 100));

			const res = await api('notifications/mark-all-as-read', {}, user);
			expect(res.status).toBe(204);

			await new Promise((resolve) => setTimeout(resolve, 100));
			const redis = createRedisClient(config);
			try {
				const latestReadNotificationId = await redis.get(`latestReadNotification:${user.id}`);
				assert.ok(latestReadNotificationId);
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
			await new Promise((resolve) => setTimeout(resolve, 100));
			const notification = (await readNotificationTimeline(config, user.id)).find((item) => item.type === 'test');
			assert.ok(notification);

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
			await new Promise((resolve) => setTimeout(resolve, 100));

			const res = await api('notifications/flush', {}, user);
			expect(res.status).toBe(204);

			await new Promise((resolve) => setTimeout(resolve, 100));
			const redis = createRedisClient(config);
			try {
				const exists = await redis.exists(`notificationTimeline:${user.id}`);
				expect(exists).toBe(0);
			} finally {
				await closeRedisConnection(redis);
			}
		});
	});

	describe('auth/session', () => {
		test('legacy auth session flow', async () => {
			const app = await api('app/create', {
				name: 'legacy auth test',
				description: 'legacy auth test',
				permission: ['read:account'],
				callbackUrl: null,
			});
			expect(app.status).toBe(200);
			const appSecret = app.body.secret;
			if (typeof appSecret !== 'string') {
				assert.fail('app secret is missing');
			}

			const generated = await api('auth/session/generate', {
				appSecret,
			});
			expect(generated.status).toBe(200);
			const sessionToken = generated.body.token;
			expect(typeof sessionToken).toBe('string');
			assert.ok(generated.body.url.endsWith(`/auth/${sessionToken}`));

			const shown = await api('auth/session/show', {
				token: sessionToken,
			});
			expect(shown.status).toBe(200);
			expect(shown.body.token).toBe(sessionToken);
			expect(shown.body.app.id).toBe(app.body.id);

			const pending = await api('auth/session/userkey', {
				appSecret,
				token: sessionToken,
			});
			expect(pending.status).toBe(400);
			expect(castAsError(pending.body as any).error.code).toBe('PENDING_SESSION');

			const accepted = await api(
				'auth/accept',
				{
					token: sessionToken,
				},
				alice,
			);
			expect(accepted.status).toBe(204);

			const userkey = await api('auth/session/userkey', {
				appSecret,
				token: sessionToken,
			});
			expect(userkey.status).toBe(200);
			const accessToken = userkey.body.accessToken;
			if (typeof accessToken !== 'string') {
				assert.fail('access token is missing');
			}
			expect(userkey.body.user.id).toBe(alice.id);

			const credential = await api(
				'i',
				{},
				{
					token: accessToken,
				},
			);
			expect(credential.status).toBe(200);
			expect(credential.body.id).toBe(alice.id);

			const deleted = await api('auth/session/show', {
				token: sessionToken,
			});
			expect(deleted.status).toBe(400);
			expect(castAsError(deleted.body as any).error.code).toBe('NO_SUCH_SESSION');
		});
	});

	describe('miauth', () => {
		test('session check returns issued token once', async () => {
			const session = 'miauth-session-test';
			const issued = await api(
				'miauth/gen-token',
				{
					session,
					permission: ['read:account'],
				},
				alice,
			);
			expect(issued.status).toBe(200);
			expect(typeof issued.body.token).toBe('string');

			const checked = await relativeFetch(`api/miauth/${session}/check`, {
				method: 'POST',
			});
			expect(checked.status).toBe(200);
			const checkedBody = (await checked.json()) as { ok: boolean; token?: string; user?: { id?: string } };
			expect(checkedBody.ok).toBe(true);
			expect(checkedBody.token).toBe(issued.body.token);
			expect(checkedBody.user?.id).toBe(alice.id);

			const checkedAgain = await relativeFetch(`api/miauth/${session}/check`, {
				method: 'POST',
			});
			expect(checkedAgain.status).toBe(200);
			expect(await checkedAgain.json()).toStrictEqual({ ok: false });
		});
	});

	describe('app', () => {
		async function createLegacyAppToken(name: string): Promise<{
			app: { id: string; name: string; description?: string | null };
			accessToken: string;
		}> {
			const created = await api(
				'app/create',
				{
					name,
					description: `${name} description`,
					permission: ['read:account'],
					callbackUrl: null,
				},
				alice,
			);
			expect(created.status).toBe(200);
			const appSecret = created.body.secret;
			if (typeof appSecret !== 'string') {
				assert.fail('app secret is missing');
			}

			const generated = await api('auth/session/generate', {
				appSecret,
			});
			expect(generated.status).toBe(200);
			const sessionToken = generated.body.token;
			expect(typeof sessionToken).toBe('string');

			const accepted = await api(
				'auth/accept',
				{
					token: sessionToken,
				},
				alice,
			);
			expect(accepted.status).toBe(204);

			const userkey = await api('auth/session/userkey', {
				appSecret,
				token: sessionToken,
			});
			expect(userkey.status).toBe(200);
			const accessToken = userkey.body.accessToken;
			if (typeof accessToken !== 'string') {
				assert.fail('access token is missing');
			}

			return {
				app: created.body,
				accessToken,
			};
		}

		test('app/create したアプリを app/show と my/apps で取得できる', async () => {
			const created = await api(
				'app/create',
				{
					name: 'test app',
					description: 'test app description',
					permission: ['read:account'],
					callbackUrl: null,
				},
				alice,
			);
			expect(created.status).toBe(200);
			expect(created.body.name).toBe('test app');

			const shown = await api('app/show', { appId: created.body.id });
			expect(shown.status).toBe(200);
			expect(shown.body.id).toBe(created.body.id);
			expect(shown.body.name).toBe('test app');
			expect(shown.body.callbackUrl).toBe(null);
			expect(shown.body.secret).toBe(undefined);

			const notFound = await api('app/show', { appId: '0000000000000000' });
			expect(notFound.status).toBe(400);
			expect(castAsError(notFound.body as any).error.code).toBe('NO_SUCH_APP');

			const mine = await api('my/apps', { limit: 100 }, alice);
			expect(mine.status).toBe(200);
			assert.ok(mine.body.some((app) => app.id === created.body.id));
		});

		test('i/apps と i/authorized-apps で連携アプリトークンを取得して revoke できる', async () => {
			const byToken = await createLegacyAppToken(`i apps revoke by token ${Date.now()}`);
			const byTokenId = await createLegacyAppToken(`i apps revoke by tokenId ${Date.now()}`);

			const list = await api('i/apps', { sort: '-createdAt' }, alice);
			expect(list.status).toBe(200);
			const tokenItem = list.body.find((item) => item.name === byToken.app.name);
			const tokenIdItem = list.body.find((item) => item.name === byTokenId.app.name);
			assert.ok(tokenItem);
			assert.ok(tokenIdItem);
			expect(tokenItem.permission.includes('read:account')).toBe(true);
			expect(tokenItem.description).toBe(`${byToken.app.name} description`);
			expect(typeof tokenItem.createdAt).toBe('string');

			const authorized = await api('i/authorized-apps', { limit: 100, sort: 'desc' }, alice);
			expect(authorized.status).toBe(200);
			const authorizedApp = authorized.body.find((app) => app.id === byToken.app.id);
			assert.ok(authorizedApp);
			expect(authorizedApp.name).toBe(byToken.app.name);
			expect(authorizedApp.isAuthorized).toBe(true);

			const denied = await api('i/apps', {}, { token: byToken.accessToken });
			expect(denied.status).toBe(400);
			expect(castAsError(denied.body as any).error.code).toBe('ACCESS_DENIED');

			const revokedByToken = await api('i/revoke-token', { token: byToken.accessToken }, alice);
			expect(revokedByToken.status).toBe(204);
			const revokedCredential = await api('i', {}, { token: byToken.accessToken });
			expect(revokedCredential.status).toBe(401);
			expect(castAsError(revokedCredential.body as any).error.code).toBe('AUTHENTICATION_FAILED');

			const revokedByTokenId = await api('i/revoke-token', { tokenId: tokenIdItem.id }, alice);
			expect(revokedByTokenId.status).toBe(204);
			const afterRevoke = await api('i/authorized-apps', { limit: 100 }, alice);
			expect(afterRevoke.status).toBe(200);
			expect(afterRevoke.body.some((app) => app.id === byToken.app.id)).toBe(false);
			expect(afterRevoke.body.some((app) => app.id === byTokenId.app.id)).toBe(false);
		});
	});

	describe('role endpoints', () => {
		test('roles/list and roles/show return packed public role data', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const createdRole = await createRoleInDatabase(db, {
				id: genId(now - 1000),
				updatedAt: new Date(now),
				lastUsedAt: new Date(now),
				name: `Hono public role ${now}`,
				description: 'Hono role endpoint test',
				color: '#2255aa',
				iconUrl: null,
				target: 'manual',
				condFormula: {
					id: 'ebef1684-672d-49b6-ad82-1b3ec3784f85',
					type: 'isRemote',
				},
				isPublic: true,
				isAdministrator: false,
				isModerator: false,
				isExplorable: true,
				asBadge: false,
				preserveAssignmentOnMoveAccount: false,
				canEditMembersByModerator: false,
				displayOrder: 4242,
				policies: {},
			});
			await createRoleAssignmentInDatabase(db, {
				id: genId(now - 999),
				userId: bob.id,
				roleId: createdRole.id,
				expiresAt: null,
			});

			const unauthorizedList = await api('roles/list', {});
			expect(unauthorizedList.status).toBe(401);
			expect(castAsError(unauthorizedList.body as any).error.code).toBe('CREDENTIAL_REQUIRED');

			const list = await api('roles/list', {}, alice);
			expect(list.status).toBe(200);
			const listedRole = list.body.find((item) => item.id === createdRole.id);
			assert.ok(listedRole);
			expect(listedRole.name).toBe(createdRole.name);
			expect(listedRole.description).toBe(createdRole.description);
			expect(listedRole.color).toBe(createdRole.color);
			expect(listedRole.isPublic).toBe(true);
			expect(listedRole.isExplorable).toBe(true);
			expect(listedRole.displayOrder).toBe(4242);
			expect(listedRole.usersCount).toBe(1);
			expect(getDefined(listedRole.policies['canInvite']).useDefault).toBe(true);

			const shown = await api('roles/show', { roleId: createdRole.id });
			expect(shown.status).toBe(200);
			expect(shown.body.id).toBe(createdRole.id);
			expect(shown.body.name).toBe(createdRole.name);
			expect(shown.body.usersCount).toBe(1);

			const missing = await api('roles/show', { roleId: '000000000000000000000000' });
			expect(missing.status).toBe(400);
			expect(castAsError(missing.body as any).error.code).toBe('NO_SUCH_ROLE');
		});

		test('roles/users は explorable な role のみ users を一覧しUserDetailedを返す', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const explorableRole = await createRoleInDatabase(db, {
				id: genId(now - 2000),
				updatedAt: new Date(now),
				lastUsedAt: new Date(now),
				name: `Hono explorable role ${suffix}`,
				description: 'Hono roles/users test',
				color: null,
				iconUrl: null,
				target: 'manual',
				condFormula: { id: 'ebef1684-672d-49b6-ad82-1b3ec3784f86', type: 'isRemote' },
				isPublic: true,
				isAdministrator: false,
				isModerator: false,
				isExplorable: true,
				asBadge: false,
				preserveAssignmentOnMoveAccount: false,
				canEditMembersByModerator: false,
				displayOrder: 1,
				policies: {},
			});
			const nonExplorableRole = await createRoleInDatabase(db, {
				id: genId(now - 1999),
				updatedAt: new Date(now),
				lastUsedAt: new Date(now),
				name: `Hono non-explorable role ${suffix}`,
				description: 'Hono roles/users test',
				color: null,
				iconUrl: null,
				target: 'manual',
				condFormula: { id: 'ebef1684-672d-49b6-ad82-1b3ec3784f87', type: 'isRemote' },
				isPublic: true,
				isAdministrator: false,
				isModerator: false,
				isExplorable: false,
				asBadge: false,
				preserveAssignmentOnMoveAccount: false,
				canEditMembersByModerator: false,
				displayOrder: 1,
				policies: {},
			});
			const member = await signup({ username: `hru${suffix}` });
			await createRoleAssignmentInDatabase(db, {
				id: genId(now - 1998),
				userId: member.id,
				roleId: explorableRole.id,
				expiresAt: null,
			});
			await createRoleAssignmentInDatabase(db, {
				id: genId(now - 1997),
				userId: member.id,
				roleId: nonExplorableRole.id,
				expiresAt: null,
			});

			const users = await api('roles/users', { roleId: explorableRole.id }, member);
			expect(users.status).toBe(200);
			expect(users.body.length).toBe(1);
			expect(getAt(users.body, 0).user.id).toBe(member.id);
			expect(getAt(users.body, 0).user.username).toBe(member.username);

			const asSelf = getAt(users.body, 0).user as any;
			assert.ok('policies' in asSelf);

			const asOthers = await api('roles/users', { roleId: explorableRole.id }, alice);
			expect(asOthers.status).toBe(200);
			expect('policies' in (getAt(asOthers.body, 0).user as any)).toBe(false);

			const forbidden = await api('roles/users', { roleId: nonExplorableRole.id });
			expect(forbidden.status).toBe(400);
			expect(castAsError(forbidden.body as any).error.code).toBe('NO_SUCH_ROLE');
			expect(castAsError(forbidden.body as any).error.id).toBe('30aaaee3-4792-48dc-ab0d-cf501a575ac5');
		});

		test('roles/notes はfanoutタイムラインの投稿をpublicのみpackして返す', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const explorableRole = await createRoleInDatabase(db, {
				id: genId(now - 3000),
				updatedAt: new Date(now),
				lastUsedAt: new Date(now),
				name: `Hono roles/notes role ${suffix}`,
				description: 'Hono roles/notes test',
				color: null,
				iconUrl: null,
				target: 'manual',
				condFormula: { id: 'ebef1684-672d-49b6-ad82-1b3ec3784f88', type: 'isRemote' },
				isPublic: true,
				isAdministrator: false,
				isModerator: false,
				isExplorable: true,
				asBadge: false,
				preserveAssignmentOnMoveAccount: false,
				canEditMembersByModerator: false,
				displayOrder: 1,
				policies: {},
			});
			const author = await signup({ username: `hrn${suffix}` });
			const publicNoteId = genId(now - 2000);
			await createNoteInDatabase(db, {
				id: publicNoteId,
				text: 'roles/notes public note',
				userId: author.id,
				userHost: null,
				visibility: 'public',
			});
			const followersNoteId = genId(now - 1000);
			await createNoteInDatabase(db, {
				id: followersNoteId,
				text: 'roles/notes followers-only note',
				userId: author.id,
				userHost: null,
				visibility: 'followers',
			});

			const redis = createRedisClient(config);
			try {
				await redis.lpush(`list:roleTimeline:${explorableRole.id}`, followersNoteId, publicNoteId);

				const notes = await api('roles/notes', { roleId: explorableRole.id }, author);
				expect(notes.status).toBe(200);
				expect(notes.body.length).toBe(1);
				expect(getAt(notes.body, 0).id).toBe(publicNoteId);
			} finally {
				await redis.del(`list:roleTimeline:${explorableRole.id}`);
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
			await api('i/update', { name: `Hono Search Target ${suffix}` }, byName);

			const byUsername = await signup({ username: `hussrch${suffix}` });

			const byDescription = await signup({ username: `husd${suffix}` });
			await updateUserProfileInDatabase(db, byDescription.id, {
				description: `hono search description marker ${suffix}`,
			});

			const muter = await signup({ username: `husm${suffix}` });
			const muted = await signup({ username: `hussrchmuted${suffix}` });
			const muteRes = await api('mute/create', { userId: muted.id }, muter);
			expect(muteRes.status).toBe(204);

			const byNameResult = await api('users/search', { query: `Hono Search Target ${suffix}` });
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

	describe('users/report-abuse', () => {
		test('通報を作成し、自分自身・管理者・存在しないユーザーへの通報を拒否する', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const reporter = await signup({ username: `hura${suffix}` });
			const target = await signup({ username: `hurat${suffix}` });

			const reported = await api(
				'users/report-abuse',
				{ userId: target.id, comment: `hono report abuse ${suffix}` },
				reporter,
			);
			expect(reported.status).toBe(204);

			const listed = await api('admin/abuse-user-reports', { limit: 100 }, alice);
			expect(listed.status).toBe(200);
			const found = listed.body.find((r: any) => r.reporterId === reporter.id && r.targetUserId === target.id);
			assert.ok(found);
			expect(found.comment).toBe(`hono report abuse ${suffix}`);
			expect(found.resolved).toBe(false);

			const reportSelf = await api('users/report-abuse', { userId: reporter.id, comment: 'self report' }, reporter);
			expect(reportSelf.status).toBe(400);
			expect(castAsError(reportSelf.body as any).error.code).toBe('CANNOT_REPORT_YOURSELF');

			const reportAdmin = await api('users/report-abuse', { userId: alice.id, comment: 'admin report' }, reporter);
			expect(reportAdmin.status).toBe(400);
			expect(castAsError(reportAdmin.body as any).error.code).toBe('CANNOT_REPORT_THE_ADMIN');

			const reportMissing = await api('users/report-abuse', { userId: genId(), comment: 'no such user' }, reporter);
			expect(reportMissing.status).toBe(400);
			expect(castAsError(reportMissing.body as any).error.code).toBe('NO_SUCH_USER');
		});

		test('通報時にmoderatorのadminStreamへnewAbuseUserReportイベントを配信する', async () => {
			const config = fixtureConfig;
			const suffix = Date.now().toString(36).slice(-8);
			const reporter = await signup({ username: `hurs${suffix}` });
			const target = await signup({ username: `hurst${suffix}` });

			// alice はrootUserIdだが明示的なmoderatorロールを持たないため、
			// getModeratorIds({includeAdmins:true, excludeExpire:true}) の対象に含まれない (includeRoot は渡されない)。
			// 通知対象として検証可能にするため、専用のmoderatorロールを付与したユーザーを用意する。
			const moderator = await signup({ username: `hursm${suffix}` });
			const moderatorRole = await role(alice, { name: `hono report-abuse moderator ${suffix}`, isModerator: true });
			await createRoleAssignmentInDatabase(db, {
				id: genId(),
				roleId: moderatorRole.id,
				userId: moderator.id,
				expiresAt: null,
			});

			const sub = createRedisClient(config);
			try {
				const received = new Promise<{ channel: string; message: { type: string; body: any } }>((resolve, reject) => {
					const timer = setTimeout(() => reject(new Error('timed out waiting for adminStream event')), 8000);
					sub.on('message', (_ch: string, data: string) => {
						const parsed = JSON.parse(data);
						if (parsed.channel === `adminStream:${moderator.id}` && parsed.message?.type === 'newAbuseUserReport') {
							clearTimeout(timer);
							resolve(parsed);
						}
					});
				});
				await sub.subscribe(config.runtime.host);

				const reported = await api(
					'users/report-abuse',
					{ userId: target.id, comment: `hono adminStream ${suffix}` },
					reporter,
				);
				expect(reported.status).toBe(204);

				const event = await received;
				expect(event.message.body.targetUserId).toBe(target.id);
				expect(event.message.body.reporterId).toBe(reporter.id);
				expect(event.message.body.comment).toBe(`hono adminStream ${suffix}`);
			} finally {
				await closeRedisConnection(sub);
			}
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

	describe('admin/roles', () => {
		test('admin/roles は作成、一覧、表示、scope、権限、ログを維持する', async () => {
			const now = Date.now();
			const config = fixtureConfig;
			const createPayload = {
				name: `Hono admin role ${now}`,
				description: 'Hono admin role endpoint test',
				color: '#3366cc',
				iconUrl: null,
				target: 'manual' as const,
				condFormula: {
					id: '018d87a0-7f78-48b4-9ee8-1e22e6f73089',
					type: 'isRemote',
				} as any,
				isPublic: true,
				isModerator: false,
				isAdministrator: false,
				isExplorable: true,
				asBadge: false,
				preserveAssignmentOnMoveAccount: true,
				canEditMembersByModerator: false,
				displayOrder: 313,
				policies: {
					canInvite: { useDefault: false, priority: 0, value: true },
				},
			};

			const created = await api('admin/roles/create', createPayload, alice);
			expect(created.status).toBe(200);
			expect(created.body.name).toBe(createPayload.name);
			expect(created.body.description).toBe(createPayload.description);
			expect(created.body.color).toBe(createPayload.color);
			expect(created.body.isPublic).toBe(true);
			expect(created.body.isExplorable).toBe(true);
			expect(created.body.preserveAssignmentOnMoveAccount).toBe(true);
			expect(created.body.displayOrder).toBe(createPayload.displayOrder);
			expect(created.body.usersCount).toBe(0);
			expect(getDefined(created.body.policies['canInvite']).useDefault).toBe(false);
			expect(getDefined(created.body.policies['canInvite']).value).toBe(true);

			const list = await api('admin/roles/list', {}, alice);
			expect(list.status).toBe(200);
			const listedRole = list.body.find((item) => item.id === created.body.id);
			assert.ok(listedRole);
			expect(listedRole.name).toBe(createPayload.name);
			expect(listedRole.usersCount).toBe(0);

			const shown = await api('admin/roles/show', { roleId: created.body.id }, alice);
			expect(shown.status).toBe(200);
			expect(shown.body.id).toBe(created.body.id);
			expect(shown.body.name).toBe(createPayload.name);
			expect(getDefined(shown.body.policies['canInvite']).value).toBe(true);

			const updated = await api(
				'admin/roles/update',
				{
					roleId: created.body.id,
					name: `Hono admin role updated ${now}`,
					description: 'updated role description',
					color: null,
					isPublic: false,
					preserveAssignmentOnMoveAccount: false,
					displayOrder: 314,
					policies: {
						canInvite: { useDefault: false, priority: 0, value: false },
					} as any,
				},
				alice,
			);
			expect(updated.status).toBe(204);

			const afterUpdate = await api('admin/roles/show', { roleId: created.body.id }, alice);
			expect(afterUpdate.status).toBe(200);
			expect(afterUpdate.body.name).toBe(`Hono admin role updated ${now}`);
			expect(afterUpdate.body.description).toBe('updated role description');
			expect(afterUpdate.body.color).toBe(null);
			expect(afterUpdate.body.isPublic).toBe(false);
			expect(afterUpdate.body.displayOrder).toBe(314);
			expect(getDefined(afterUpdate.body.policies['canInvite']).value).toBe(false);

			const missingUpdate = await api('admin/roles/update', { roleId: '000000000000000000000000' }, alice);
			expect(missingUpdate.status).toBe(400);
			expect(castAsError(missingUpdate.body as any).error.code).toBe('NO_SUCH_ROLE');

			const missing = await api('admin/roles/show', { roleId: '000000000000000000000000' }, alice);
			expect(missing.status).toBe(400);
			expect(castAsError(missing.body as any).error.code).toBe('NO_SUCH_ROLE');

			const readToken = await createAppToken(alice, ['read:admin:roles']);
			await createRoleAssignmentInDatabase(db, {
				id: genId(now + 1000),
				userId: bob.id,
				roleId: created.body.id,
				expiresAt: null,
			});
			const carolRoleAssignment = await createRoleAssignmentInDatabase(db, {
				id: genId(now + 1001),
				userId: carol.id,
				roleId: created.body.id,
				expiresAt: new Date(now + 60 * 1000),
			});
			const users = await api(
				'admin/roles/users',
				{
					roleId: created.body.id,
					limit: 1,
				},
				{ token: readToken },
			);
			expect(users.status).toBe(200);
			expect(users.body.length).toBe(1);
			expect(getAt(users.body, 0).id).toBe(carolRoleAssignment.id);
			expect(getAt(users.body, 0).user.id).toBe(carol.id);
			expect(getAt(users.body, 0).user.username).toBe(carol.username);
			expect(getAt(users.body, 0).expiresAt).toBe(new Date(now + 60 * 1000).toISOString());

			const missingUsersRole = await api('admin/roles/users', { roleId: '000000000000000000000000' }, alice);
			expect(missingUsersRole.status).toBe(400);
			expect(castAsError(missingUsersRole.body as any).error.code).toBe('NO_SUCH_ROLE');

			const assignTarget = await signup({ username: `hrolasg${now.toString(36)}` });
			const assignableRole = await api(
				'admin/roles/create',
				{
					...createPayload,
					name: `Hono admin assign role ${now}`,
					isPublic: true,
					canEditMembersByModerator: true,
				},
				alice,
			);
			expect(assignableRole.status).toBe(200);

			const scopeDenied = await api(
				'admin/roles/create',
				{
					...createPayload,
					name: `Hono admin role denied ${now}`,
				},
				{ token: readToken },
			);
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');
			const assignScopeDenied = await api(
				'admin/roles/assign',
				{
					roleId: assignableRole.body.id,
					userId: assignTarget.id,
				},
				{ token: readToken },
			);
			expect(assignScopeDenied.status).toBe(403);
			expect(castAsError(assignScopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const assignExpiresAt = now + 60 * 60 * 1000;
			const assigned = await api(
				'admin/roles/assign',
				{
					roleId: assignableRole.body.id,
					userId: assignTarget.id,
					expiresAt: assignExpiresAt,
				},
				alice,
			);
			expect(assigned.status, JSON.stringify(assigned.body)).toBe(204);
			const assignment = await fetchRoleAssignmentByUserIdAndRoleIdFromDatabase(
				db,
				assignTarget.id,
				assignableRole.body.id,
			);
			assert.ok(assignment);
			expect(assignment.expiresAt?.toISOString()).toBe(new Date(assignExpiresAt).toISOString());

			const redis = createRedisClient(config);
			try {
				await new Promise((resolve) => setTimeout(resolve, 100));
				const entries = await redis.xrevrange(`notificationTimeline:${assignTarget.id}`, '+', '-', 'COUNT', 10);
				const notifications = entries.map(([, values]) => {
					const dataIndex = values.findIndex((value) => value === 'data');
					return JSON.parse(values[dataIndex + 1]!) as { type?: string; roleId?: string };
				});
				const roleAssignedNotification = notifications.find(
					(notification) => notification.type === 'roleAssigned' && notification.roleId === assignableRole.body.id,
				);
				assert.ok(roleAssignedNotification);
			} finally {
				await closeRedisConnection(redis);
			}

			const normalUser = await signup({ username: `honorole${now.toString(36)}` });
			const roleDenied = await api('admin/roles/list', {}, normalUser);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
			const usersRoleDenied = await api('admin/roles/users', { roleId: created.body.id }, normalUser);
			expect(usersRoleDenied.status).toBe(403);
			expect(castAsError(usersRoleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
			const assignRoleDenied = await api(
				'admin/roles/assign',
				{ roleId: assignableRole.body.id, userId: assignTarget.id },
				normalUser,
			);
			expect(assignRoleDenied.status).toBe(403);
			expect(castAsError(assignRoleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

			const moderatorRole = await createRoleInDatabase(db, {
				id: genId(now + 2000),
				updatedAt: new Date(now),
				lastUsedAt: new Date(now),
				name: `Hono moderator role ${now}`,
				description: 'Hono moderator role',
				color: null,
				iconUrl: null,
				target: 'manual',
				condFormula: {
					id: 'a6a0035c-2910-4dac-9b35-f226c07d63ab',
					type: 'isRemote',
				},
				isPublic: false,
				isAdministrator: false,
				isModerator: true,
				isExplorable: false,
				asBadge: false,
				preserveAssignmentOnMoveAccount: false,
				canEditMembersByModerator: true,
				displayOrder: 1,
				policies: {},
			});
			await createRoleAssignmentInDatabase(db, {
				id: genId(now + 2001),
				userId: normalUser.id,
				roleId: moderatorRole.id,
				expiresAt: null,
			});
			const accessDenied = await api(
				'admin/roles/assign',
				{
					roleId: created.body.id,
					userId: assignTarget.id,
				},
				normalUser,
			);
			expect(accessDenied.status).toBe(400);
			expect(castAsError(accessDenied.body as any).error.code).toBe('ACCESS_DENIED');

			const unassigned = await api(
				'admin/roles/unassign',
				{
					roleId: assignableRole.body.id,
					userId: assignTarget.id,
				},
				alice,
			);
			expect(unassigned.status).toBe(204);
			expect(await fetchRoleAssignmentByUserIdAndRoleIdFromDatabase(db, assignTarget.id, assignableRole.body.id)).toBe(null);

			const unassignedAgain = await api(
				'admin/roles/unassign',
				{
					roleId: assignableRole.body.id,
					userId: assignTarget.id,
				},
				alice,
			);
			expect(unassignedAgain.status).toBe(400);
			expect(castAsError(unassignedAgain.body as any).error.code).toBe('NOT_ASSIGNED');

			const missingAssignUser = await api(
				'admin/roles/assign',
				{
					roleId: assignableRole.body.id,
					userId: '000000000000000000000000',
				},
				alice,
			);
			expect(missingAssignUser.status).toBe(400);
			expect(castAsError(missingAssignUser.body as any).error.code).toBe('NO_SUCH_USER');
			const missingUnassignRole = await api(
				'admin/roles/unassign',
				{
					roleId: '000000000000000000000000',
					userId: assignTarget.id,
				},
				alice,
			);
			expect(missingUnassignRole.status).toBe(400);
			expect(castAsError(missingUnassignRole.body as any).error.code).toBe('NO_SUCH_ROLE');

			const defaultPolicyUser = await signup({ username: `honorolepol${now.toString(36)}` });
			const beforeMeta = await fetchMetaFromDatabase(db);
			try {
				const updatedDefaultPolicies = await api(
					'admin/roles/update-default-policies',
					{
						policies: {
							...beforeMeta.policies,
							canInvite: true,
							inviteLimit: 2,
							inviteLimitCycle: 60,
							inviteExpirationTime: 0,
						} as any,
					},
					alice,
				);
				expect(updatedDefaultPolicies.status).toBe(204);

				const afterMeta = await fetchMetaFromDatabase(db);
				expect(afterMeta.policies.canInvite).toBe(true);
				expect(afterMeta.policies.inviteLimit).toBe(2);

				const inviteLimit = await api('invite/limit', {}, defaultPolicyUser);
				expect(inviteLimit.status).toBe(200);
				expect(inviteLimit.body.remaining).toBe(2);

				const updateDefaultScopeDenied = await api(
					'admin/roles/update-default-policies',
					{
						policies: afterMeta.policies as any,
					},
					{ token: readToken },
				);
				expect(updateDefaultScopeDenied.status).toBe(403);
				expect(castAsError(updateDefaultScopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

				const logs = await listModerationLogsFromDatabase(db, {
					limit: 10,
					order: 'desc',
					type: 'updateServerSettings',
					search: 'canInvite',
				});
				assert.ok(logs.length > 0);
			} finally {
				await api('admin/roles/update-default-policies', { policies: beforeMeta.policies as any }, alice);
			}

			const assignmentLogTypes = ['assignRole', 'unassignRole'] as const;
			const assignmentLogged = new Set<string>();
			for (let i = 0; i < 10; i++) {
				for (const type of assignmentLogTypes) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: assignableRole.body.id,
					});
					if (logs.length > 0) assignmentLogged.add(type);
				}
				if (assignmentLogged.size === assignmentLogTypes.length) break;
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			expect([...assignmentLogged].sort()).toStrictEqual([...assignmentLogTypes].sort());

			const deletedAssignableRole = await api('admin/roles/delete', { roleId: assignableRole.body.id }, alice);
			expect(deletedAssignableRole.status).toBe(204);

			const deleted = await api('admin/roles/delete', { roleId: created.body.id }, alice);
			expect(deleted.status).toBe(204);

			const afterDelete = await api('admin/roles/show', { roleId: created.body.id }, alice);
			expect(afterDelete.status).toBe(400);
			expect(castAsError(afterDelete.body as any).error.code).toBe('NO_SUCH_ROLE');

			const missingDelete = await api('admin/roles/delete', { roleId: '000000000000000000000000' }, alice);
			expect(missingDelete.status).toBe(400);
			expect(castAsError(missingDelete.body as any).error.code).toBe('NO_SUCH_ROLE');

			const logTypes = ['createRole', 'updateRole', 'deleteRole'] as const;
			const logged = new Set<string>();
			for (let i = 0; i < 10; i++) {
				for (const type of logTypes) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: created.body.id,
					});
					if (logs.length > 0) logged.add(type);
				}
				if (logged.size === logTypes.length) break;
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			expect([...logged].sort()).toStrictEqual([...logTypes].sort());
		});
	});

	describe('admin/system-webhook', () => {
		async function findSystemWebhookDeliverJob(
			webhookId: string,
			type: SystemWebhookDeliverJobData['type'],
			url: string,
		): Promise<Bull.Job<SystemWebhookDeliverJobData>> {
			for (let i = 0; i < 10; i++) {
				const jobs = await systemWebhookDeliverQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
				const job = jobs.find(
					(job) =>
						job.name === webhookId && job.data.webhookId === webhookId && job.data.type === type && job.data.to === url,
				);
				if (job != null) return job;
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			assert.fail(`system webhook deliver job was not found: ${webhookId}`);
		}

		test('admin/system-webhook は作成、一覧、表示、更新、削除、secure 権限、ログを維持する', async () => {
			const now = Date.now();
			const name = `Hono system webhook ${now}`;
			const created = await api(
				'admin/system-webhook/create',
				{
					isActive: true,
					name,
					on: ['abuseReport'],
					url: 'https://example.test/system-webhook',
				},
				alice,
			);
			expect(created.status).toBe(200);
			expect(created.body.isActive).toBe(true);
			expect(created.body.name).toBe(name);
			expect(created.body.on).toStrictEqual(['abuseReport']);
			expect(created.body.url).toBe('https://example.test/system-webhook');
			expect(created.body.secret).toBe('');

			const createdInactive = await api(
				'admin/system-webhook/create',
				{
					isActive: false,
					name: `${name} inactive`,
					on: ['userCreated'],
					url: 'https://example.test/system-webhook-inactive',
					secret: 'secret',
				},
				alice,
			);
			expect(createdInactive.status).toBe(200);

			const listed = await api('admin/system-webhook/list', { on: ['abuseReport'] }, alice);
			expect(listed.status).toBe(200);
			expect(listed.body.some((webhook) => webhook.id === created.body.id)).toBe(true);
			expect(listed.body.some((webhook) => webhook.id === createdInactive.body.id)).toBe(false);

			const listedInactive = await api('admin/system-webhook/list', { isActive: false }, alice);
			expect(listedInactive.status).toBe(200);
			expect(listedInactive.body.some((webhook) => webhook.id === createdInactive.body.id)).toBe(true);

			const shown = await api('admin/system-webhook/show', { id: created.body.id }, alice);
			expect(shown.status).toBe(200);
			expect(shown.body.id).toBe(created.body.id);
			expect(shown.body.name).toBe(name);

			const missing = await api('admin/system-webhook/show', { id: '000000000000000000000000' }, alice);
			expect(missing.status).toBe(404);
			expect(castAsError(missing.body as any).error.code).toBe('NO_SUCH_SYSTEM_WEBHOOK');

			const updated = await api(
				'admin/system-webhook/update',
				{
					id: created.body.id,
					isActive: false,
					name: `${name} updated`,
					on: ['userCreated'],
					url: 'https://example.test/system-webhook-updated',
					secret: 'updated-secret',
				},
				alice,
			);
			expect(updated.status).toBe(200);
			expect(updated.body.id).toBe(created.body.id);
			expect(updated.body.isActive).toBe(false);
			expect(updated.body.name).toBe(`${name} updated`);
			expect(updated.body.on).toStrictEqual(['userCreated']);
			expect(updated.body.secret).toBe('updated-secret');

			const overrideUrl = 'https://example.test/system-webhook-test';
			const tested = await api(
				'admin/system-webhook/test',
				{
					webhookId: created.body.id,
					type: 'userCreated',
					override: {
						url: overrideUrl,
						secret: 'override-secret',
					},
				},
				alice,
			);
			expect(tested.status).toBe(204);
			const testJob = await findSystemWebhookDeliverJob(created.body.id, 'userCreated', overrideUrl);
			expect(testJob.opts.attempts).toBe(1);
			expect(testJob.data.secret).toBe('override-secret');
			expect((testJob.data.content as any).id).toBe('dummy-user-1');
			await testJob.remove();

			const missingTest = await api(
				'admin/system-webhook/test',
				{
					webhookId: '000000000000000000000000',
					type: 'userCreated',
				},
				alice,
			);
			expect(missingTest.status).toBe(400);
			expect(castAsError(missingTest.body as any).error.code).toBe('NO_SUCH_WEBHOOK');

			const appToken = await createAppToken(alice, ['write:admin:roles']);
			const secureDenied = await api('admin/system-webhook/list', {}, { token: appToken });
			expect(secureDenied.status).toBe(400);
			expect(castAsError(secureDenied.body as any).error.code).toBe('ACCESS_DENIED');

			const normalUser = await signup({ username: `hswh${now.toString(36)}` });
			const roleDenied = await api('admin/system-webhook/list', {}, normalUser);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

			const deleted = await api('admin/system-webhook/delete', { id: created.body.id }, alice);
			expect(deleted.status).toBe(204);
			expect(await fetchSystemWebhookByIdFromDatabase(db, created.body.id)).toBe(null);

			const deletedInactive = await api('admin/system-webhook/delete', { id: createdInactive.body.id }, alice);
			expect(deletedInactive.status).toBe(204);

			const logTypes = ['createSystemWebhook', 'updateSystemWebhook', 'deleteSystemWebhook'] as const;
			const logged = new Set<string>();
			for (let i = 0; i < 10; i++) {
				for (const type of logTypes) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: created.body.id,
					});
					if (logs.length > 0) logged.add(type);
				}
				if (logged.size === logTypes.length) break;
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			expect([...logged].sort()).toStrictEqual([...logTypes].sort());
		});
	});

	describe('admin/abuse-report/notification-recipient', () => {
		test('admin/abuse-report/notification-recipient は作成、一覧、表示、更新、削除、secure 権限、ログを維持する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const name = `Hono abuse recipient ${suffix}`;
			const emailUser = await signup({ username: `harn${suffix}` });
			await updateUserProfileInDatabase(db, emailUser.id, {
				email: `hono-recipient-${suffix}@example.test`,
				emailVerified: true,
			});
			const moderatorRole = await role(alice, {
				name: `Hono abuse recipient moderator ${suffix}`,
				isModerator: true,
			});
			const assign = await api(
				'admin/roles/assign',
				{
					roleId: moderatorRole.id,
					userId: emailUser.id,
				},
				alice,
			);
			expect(assign.status).toBe(204);

			const webhook = await api(
				'admin/system-webhook/create',
				{
					isActive: true,
					name: `${name} webhook`,
					on: ['abuseReport'],
					url: 'https://example.test/abuse-recipient-webhook',
				},
				alice,
			);
			expect(webhook.status).toBe(200);

			const createdWebhookRecipient = await api(
				'admin/abuse-report/notification-recipient/create',
				{
					isActive: true,
					name,
					method: 'webhook',
					systemWebhookId: webhook.body.id,
				},
				alice,
			);
			expect(createdWebhookRecipient.status).toBe(200);
			expect(createdWebhookRecipient.body.isActive).toBe(true);
			expect(createdWebhookRecipient.body.name).toBe(name);
			expect(createdWebhookRecipient.body.method).toBe('webhook');
			expect(createdWebhookRecipient.body.systemWebhookId).toBe(webhook.body.id);
			assert.ok(createdWebhookRecipient.body.systemWebhook);
			expect(createdWebhookRecipient.body.systemWebhook.id).toBe(webhook.body.id);

			const createdEmailRecipient = await api(
				'admin/abuse-report/notification-recipient/create',
				{
					isActive: true,
					name: `${name} email`,
					method: 'email',
					userId: emailUser.id,
				},
				alice,
			);
			expect(createdEmailRecipient.status).toBe(200);
			expect(createdEmailRecipient.body.method).toBe('email');
			expect(createdEmailRecipient.body.userId).toBe(emailUser.id);
			assert.ok(createdEmailRecipient.body.user);
			expect(createdEmailRecipient.body.user.id).toBe(emailUser.id);

			const listedWebhook = await api('admin/abuse-report/notification-recipient/list', { method: ['webhook'] }, alice);
			expect(listedWebhook.status).toBe(200);
			expect(listedWebhook.body.some((recipient) => recipient.id === createdWebhookRecipient.body.id)).toBe(true);
			expect(listedWebhook.body.some((recipient) => recipient.id === createdEmailRecipient.body.id)).toBe(false);

			const listedEmail = await api('admin/abuse-report/notification-recipient/list', { method: ['email'] }, alice);
			expect(listedEmail.status).toBe(200);
			expect(listedEmail.body.some((recipient) => recipient.id === createdEmailRecipient.body.id)).toBe(true);

			const shown = await api(
				'admin/abuse-report/notification-recipient/show',
				{ id: createdWebhookRecipient.body.id },
				alice,
			);
			expect(shown.status).toBe(200);
			expect(shown.body.id).toBe(createdWebhookRecipient.body.id);
			assert.ok(shown.body.systemWebhook);
			expect(shown.body.systemWebhook.id).toBe(webhook.body.id);

			const missing = await api(
				'admin/abuse-report/notification-recipient/show',
				{ id: '000000000000000000000000' },
				alice,
			);
			expect(missing.status).toBe(404);
			expect(castAsError(missing.body as any).error.code).toBe('NO_SUCH_RECIPIENT');

			const updated = await api(
				'admin/abuse-report/notification-recipient/update',
				{
					id: createdWebhookRecipient.body.id,
					isActive: false,
					name: `${name} updated`,
					method: 'email',
					userId: emailUser.id,
				},
				alice,
			);
			expect(updated.status).toBe(200);
			expect(updated.body.id).toBe(createdWebhookRecipient.body.id);
			expect(updated.body.isActive).toBe(false);
			expect(updated.body.name).toBe(`${name} updated`);
			expect(updated.body.method).toBe('email');
			expect(updated.body.userId).toBe(emailUser.id);
			expect(updated.body.systemWebhookId).toBe(undefined);

			const missingEmailUser = await api(
				'admin/abuse-report/notification-recipient/create',
				{
					isActive: true,
					name: `${name} missing email user`,
					method: 'email',
				},
				alice,
			);
			expect(missingEmailUser.status).toBe(400);
			expect(castAsError(missingEmailUser.body as any).error.code).toBe('CORRELATION_CHECK_EMAIL');

			const unverifiedUser = await signup({ username: `hanu${suffix}` });
			const unverifiedEmailUser = await api(
				'admin/abuse-report/notification-recipient/create',
				{
					isActive: true,
					name: `${name} unverified email`,
					method: 'email',
					userId: unverifiedUser.id,
				},
				alice,
			);
			expect(unverifiedEmailUser.status).toBe(400);
			expect(castAsError(unverifiedEmailUser.body as any).error.code).toBe('EMAIL_ADDRESS_NOT_SET');

			const missingWebhook = await api(
				'admin/abuse-report/notification-recipient/create',
				{
					isActive: true,
					name: `${name} missing webhook`,
					method: 'webhook',
				},
				alice,
			);
			expect(missingWebhook.status).toBe(400);
			expect(castAsError(missingWebhook.body as any).error.code).toBe('CORRELATION_CHECK_WEBHOOK');

			const appToken = await createAppToken(alice, ['write:admin:roles']);
			const secureDenied = await api('admin/abuse-report/notification-recipient/list', {}, { token: appToken });
			expect(secureDenied.status).toBe(400);
			expect(castAsError(secureDenied.body as any).error.code).toBe('ACCESS_DENIED');

			const normalUser = await signup({ username: `hanr${suffix}` });
			const roleDenied = await api('admin/abuse-report/notification-recipient/list', {}, normalUser);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

			const deletedUpdated = await api(
				'admin/abuse-report/notification-recipient/delete',
				{ id: createdWebhookRecipient.body.id },
				alice,
			);
			expect(deletedUpdated.status).toBe(204);
			const deletedEmail = await api(
				'admin/abuse-report/notification-recipient/delete',
				{ id: createdEmailRecipient.body.id },
				alice,
			);
			expect(deletedEmail.status).toBe(204);

			const shownDeleted = await api(
				'admin/abuse-report/notification-recipient/show',
				{ id: createdWebhookRecipient.body.id },
				alice,
			);
			expect(shownDeleted.status).toBe(404);
			expect(castAsError(shownDeleted.body as any).error.code).toBe('NO_SUCH_RECIPIENT');

			const deletedWebhook = await api('admin/system-webhook/delete', { id: webhook.body.id }, alice);
			expect(deletedWebhook.status).toBe(204);

			const logTypes = [
				'createAbuseReportNotificationRecipient',
				'updateAbuseReportNotificationRecipient',
				'deleteAbuseReportNotificationRecipient',
			] as const;
			const logged = new Set<string>();
			for (let i = 0; i < 10; i++) {
				for (const type of logTypes) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: createdWebhookRecipient.body.id,
					});
					if (logs.length > 0) logged.add(type);
				}
				if (logged.size === logTypes.length) break;
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			expect([...logged].sort()).toStrictEqual([...logTypes].sort());
		});
	});

	describe('admin/abuse-user-reports', () => {
		async function createReport(
			suffix: string,
			values: Partial<Parameters<typeof createAbuseUserReportInDatabase>[1]> = {},
		) {
			const config = fixtureConfig;
			return await createAbuseUserReportInDatabase(db, {
				id: genId(),
				targetUserId: bob.id,
				reporterId: carol.id,
				comment: `Hono abuse report ${suffix}`,
				targetUserHost: null,
				reporterHost: null,
				...values,
			});
		}

		async function findSystemWebhookDeliverJob(
			webhookId: string,
			type: SystemWebhookDeliverJobData['type'],
		): Promise<Bull.Job<SystemWebhookDeliverJobData>> {
			for (let i = 0; i < 10; i++) {
				const jobs = await systemWebhookDeliverQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
				const job = jobs.find(
					(job) => job.name === webhookId && job.data.webhookId === webhookId && job.data.type === type,
				);
				if (job != null) return job;
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			assert.fail(`system webhook deliver job was not found: ${webhookId}`);
		}

		async function findDeliverJob(inbox: string, type: 'Flag'): Promise<Bull.Job<DeliverJobData>> {
			for (let i = 0; i < 10; i++) {
				const jobs = await deliverQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
				for (const job of jobs) {
					if (job.data.to !== inbox) continue;

					const content = JSON.parse(job.data.content) as { type?: unknown };
					if (content.type === type) return job;
				}
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			assert.fail(`deliver job was not found: ${inbox} ${type}`);
		}

		test('admin/abuse-user-reports は一覧、filter、token scope、roleを維持する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const config = fixtureConfig;
			const unresolved = await createReport(`${suffix}unresolved`, {
				id: genId(now - 2000),
				comment: `Hono abuse report list unresolved ${suffix}`,
			});
			const resolved = await createReport(`${suffix}resolved`, {
				id: genId(now - 1000),
				assigneeId: alice.id,
				resolved: true,
				resolvedAs: 'reject',
				moderationNote: `resolved note ${suffix}`,
				comment: `Hono abuse report list resolved ${suffix}`,
			});
			const remoteReporter = await createReport(`${suffix}remote`, {
				id: genId(now),
				reporterHost: 'remote.example',
				comment: `Hono abuse report list remote ${suffix}`,
			});

			const listed = await api(
				'admin/abuse-user-reports',
				{
					limit: 10,
					sinceDate: now - 3000,
				},
				alice,
			);
			expect(listed.status).toBe(200);
			const listedReports = listed.body as any[];
			expect(listedReports.slice(0, 3).map((report) => report.id)).toStrictEqual([unresolved.id, resolved.id, remoteReporter.id]);
			const packedResolved = listedReports.find((report) => report.id === resolved.id);
			expect(packedResolved.comment).toBe(`Hono abuse report list resolved ${suffix}`);
			expect(packedResolved.resolved).toBe(true);
			expect(packedResolved.resolvedAs).toBe('reject');
			expect(packedResolved.moderationNote).toBe(`resolved note ${suffix}`);
			expect(packedResolved.reporterId).toBe(carol.id);
			expect(packedResolved.targetUserId).toBe(bob.id);
			expect(packedResolved.assigneeId).toBe(alice.id);
			expect(packedResolved.reporter.id).toBe(carol.id);
			expect(packedResolved.targetUser.id).toBe(bob.id);
			expect(packedResolved.assignee.id).toBe(alice.id);
			expect(typeof packedResolved.createdAt).toBe('string');

			const unresolvedOnly = await api(
				'admin/abuse-user-reports',
				{
					state: 'unresolved',
					sinceDate: now - 3000,
					limit: 10,
				},
				alice,
			);
			expect(unresolvedOnly.status).toBe(200);
			expect((unresolvedOnly.body as any[]).some((report) => report.id === unresolved.id)).toBe(true);
			expect((unresolvedOnly.body as any[]).some((report) => report.id === resolved.id)).toBe(false);

			const resolvedOnly = await api(
				'admin/abuse-user-reports',
				{
					state: 'resolved',
					sinceDate: now - 3000,
					limit: 10,
				},
				alice,
			);
			expect(resolvedOnly.status).toBe(200);
			expect((resolvedOnly.body as any[]).some((report) => report.id === resolved.id)).toBe(true);
			expect((resolvedOnly.body as any[]).some((report) => report.id === unresolved.id)).toBe(false);

			const remoteReporters = await api(
				'admin/abuse-user-reports',
				{
					reporterOrigin: 'remote',
					sinceDate: now - 3000,
					limit: 10,
				},
				alice,
			);
			expect(remoteReporters.status).toBe(200);
			expect((remoteReporters.body as any[]).map((report) => report.id)).toStrictEqual([remoteReporter.id]);

			const token = await createAppToken(alice, ['read:admin:abuse-user-reports']);
			const listedByToken = await api(
				'admin/abuse-user-reports',
				{
					state: 'resolved',
					sinceDate: now - 3000,
					limit: 10,
				},
				{ token },
			);
			expect(listedByToken.status).toBe(200);
			expect((listedByToken.body as any[]).some((report) => report.id === resolved.id)).toBe(true);

			const wrongScopeToken = await createAppToken(alice, ['write:admin:user-note']);
			const scopeDenied = await api('admin/abuse-user-reports', {}, { token: wrongScopeToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `hal${suffix}` });
			const roleDenied = await api('admin/abuse-user-reports', {}, normalUser);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
		});

		test('admin/resolve-abuse-user-report は解決状態、token scope、role、ログ、404を維持する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const report = await createReport(suffix);
			const webhook = await api(
				'admin/system-webhook/create',
				{
					isActive: true,
					name: `Hono resolve abuse report webhook ${suffix}`,
					on: ['abuseReportResolved'],
					url: `https://example.test/resolve-abuse-report/${suffix}`,
				},
				alice,
			);
			expect(webhook.status).toBe(200);

			const resolved = await api(
				'admin/resolve-abuse-user-report',
				{
					reportId: report.id,
					resolvedAs: 'accept',
				},
				alice,
			);
			expect(resolved.status).toBe(204);

			let after = await fetchAbuseUserReportByIdOrFailFromDatabase(db, report.id);
			expect(after.resolved).toBe(true);
			expect(after.assigneeId).toBe(alice.id);
			expect(after.resolvedAs).toBe('accept');

			const webhookJob = await findSystemWebhookDeliverJob(webhook.body.id, 'abuseReportResolved');
			expect((webhookJob.data.content as any).id).toBe(report.id);
			expect((webhookJob.data.content as any).targetUserId).toBe(bob.id);
			expect((webhookJob.data.content as any).reporterId).toBe(carol.id);
			expect((webhookJob.data.content as any).assigneeId).toBe(alice.id);
			expect((webhookJob.data.content as any).resolved).toBe(true);
			expect((webhookJob.data.content as any).resolvedAs).toBe('accept');
			await webhookJob.remove();
			const deletedWebhook = await api('admin/system-webhook/delete', { id: webhook.body.id }, alice);
			expect(deletedWebhook.status).toBe(204);

			const token = await createAppToken(alice, ['write:admin:resolve-abuse-user-report']);
			const tokenReport = await createReport(`${suffix}token`);
			const resolvedByToken = await api(
				'admin/resolve-abuse-user-report',
				{
					reportId: tokenReport.id,
				},
				{ token },
			);
			expect(resolvedByToken.status).toBe(204);

			after = await fetchAbuseUserReportByIdOrFailFromDatabase(db, tokenReport.id);
			expect(after.resolved).toBe(true);
			expect(after.assigneeId).toBe(alice.id);
			expect(after.resolvedAs).toBe(null);

			const wrongScopeToken = await createAppToken(alice, ['write:admin:user-note']);
			const scopeDenied = await api(
				'admin/resolve-abuse-user-report',
				{
					reportId: report.id,
				},
				{ token: wrongScopeToken },
			);
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `har${suffix}` });
			const roleDenied = await api(
				'admin/resolve-abuse-user-report',
				{
					reportId: report.id,
				},
				normalUser,
			);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

			const missing = await api(
				'admin/resolve-abuse-user-report',
				{
					reportId: '000000000000000000000000',
				},
				alice,
			);
			expect(missing.status).toBe(404);
			expect(castAsError(missing.body as any).error.code).toBe('NO_SUCH_ABUSE_REPORT');
			expect(castAsError(missing.body as any).error.id).toBe('ac3794dd-2ce4-d878-e546-73c60c06b398');

			for (let i = 0; i < 10; i++) {
				const logs = await listModerationLogsFromDatabase(db, {
					limit: 10,
					order: 'desc',
					type: 'resolveAbuseReport',
					search: report.id,
				});
				if (logs.length > 0) {
					expect(logs.some((log) => (log.info as any).reportId === report.id && (log.info as any).resolvedAs === 'accept')).toBe(true);
					break;
				}
				await new Promise((resolve) => setTimeout(resolve, 100));
				if (i === 9) assert.fail('resolveAbuseReport moderation log was not found');
			}
		});

		test('admin/forward-abuse-user-report は配送、forwarded、token scope、role、ログ、404を維持する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const config = fixtureConfig;
			const targetId = genId(now - 1000);
			const targetHost = `hono-abuse-forward-${suffix}.example`;
			const targetInbox = `https://${targetHost}/inbox`;
			const targetUri = `https://${targetHost}/users/${targetId}`;
			const target = await createUserWithProfileAndPublickeyInDatabase(db, {
				user: {
					id: targetId,
					username: `haft${suffix}`,
					usernameLower: `haft${suffix}`,
					host: targetHost,
					inbox: targetInbox,
					uri: targetUri,
				},
				profile: {
					userId: targetId,
					userHost: targetHost,
				},
			});
			const report = await createReport(`${suffix}forward`, {
				id: genId(now),
				targetUserId: target.id,
				targetUserHost: targetHost,
				comment: `Hono abuse report forward ${suffix}`,
			});

			const forwarded = await api(
				'admin/forward-abuse-user-report',
				{
					reportId: report.id,
				},
				alice,
			);
			expect(forwarded.status).toBe(204);

			const after = await fetchAbuseUserReportByIdOrFailFromDatabase(db, report.id);
			expect(after.forwarded).toBe(true);

			const deliverJob = await findDeliverJob(targetInbox, 'Flag');
			expect(deliverJob.data.to).toBe(targetInbox);
			expect(deliverJob.data.isSharedInbox).toBe(false);
			expect(deliverJob.data.digest).toBe(`SHA-256=${createHash('sha256').update(deliverJob.data.content).digest('base64')}`);
			const flag = JSON.parse(deliverJob.data.content) as any;
			expect(flag.type).toBe('Flag');
			expect(flag.actor.startsWith(`${origin}/users/`)).toBe(true);
			expect(flag.object).toBe(targetUri);
			expect(flag.content).toBe(`Hono abuse report forward ${suffix}`);
			assert.ok(flag.id.startsWith(`${origin}/`));
			assert.ok(flag['@context']);
			await deliverJob.remove();

			const token = await createAppToken(alice, ['write:admin:resolve-abuse-user-report']);
			const tokenReport = await createReport(`${suffix}forwardtoken`, {
				id: genId(now + 1000),
				targetUserId: target.id,
				targetUserHost: targetHost,
				comment: `Hono abuse report forward token ${suffix}`,
			});
			const forwardedByToken = await api(
				'admin/forward-abuse-user-report',
				{
					reportId: tokenReport.id,
				},
				{ token },
			);
			expect(forwardedByToken.status).toBe(204);

			const afterToken = await fetchAbuseUserReportByIdOrFailFromDatabase(db, tokenReport.id);
			expect(afterToken.forwarded).toBe(true);
			const tokenDeliverJob = await findDeliverJob(targetInbox, 'Flag');
			await tokenDeliverJob.remove();

			const wrongScopeToken = await createAppToken(alice, ['write:admin:user-note']);
			const scopeDenied = await api(
				'admin/forward-abuse-user-report',
				{
					reportId: report.id,
				},
				{ token: wrongScopeToken },
			);
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `hafr${suffix}` });
			const roleDenied = await api(
				'admin/forward-abuse-user-report',
				{
					reportId: report.id,
				},
				normalUser,
			);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

			const missing = await api(
				'admin/forward-abuse-user-report',
				{
					reportId: '000000000000000000000000',
				},
				alice,
			);
			expect(missing.status).toBe(404);
			expect(castAsError(missing.body as any).error.code).toBe('NO_SUCH_ABUSE_REPORT');
			expect(castAsError(missing.body as any).error.id).toBe('8763e21b-d9bc-40be-acf6-54c1a6986493');

			for (let i = 0; i < 10; i++) {
				const logs = await listModerationLogsFromDatabase(db, {
					limit: 10,
					order: 'desc',
					type: 'forwardAbuseReport',
					search: report.id,
				});
				if (logs.length > 0) {
					expect(logs.some((log) => (log.info as any).reportId === report.id)).toBe(true);
					break;
				}
				await new Promise((resolve) => setTimeout(resolve, 100));
				if (i === 9) assert.fail('forwardAbuseReport moderation log was not found');
			}
		});

		test('admin/update-abuse-user-report は moderationNote 更新、token scope、role、ログ、404を維持する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const report = await createReport(`${suffix}note`);
			const moderationNote = `updated moderation note ${suffix}`;

			const updated = await api(
				'admin/update-abuse-user-report',
				{
					reportId: report.id,
					moderationNote,
				},
				alice,
			);
			expect(updated.status).toBe(204);

			let after = await fetchAbuseUserReportByIdOrFailFromDatabase(db, report.id);
			expect(after.moderationNote).toBe(moderationNote);

			const token = await createAppToken(alice, ['write:admin:resolve-abuse-user-report']);
			const updatedByToken = await api(
				'admin/update-abuse-user-report',
				{
					reportId: report.id,
					moderationNote: `${moderationNote} by token`,
				},
				{ token },
			);
			expect(updatedByToken.status).toBe(204);

			after = await fetchAbuseUserReportByIdOrFailFromDatabase(db, report.id);
			expect(after.moderationNote).toBe(`${moderationNote} by token`);

			const wrongScopeToken = await createAppToken(alice, ['write:admin:user-note']);
			const scopeDenied = await api(
				'admin/update-abuse-user-report',
				{
					reportId: report.id,
					moderationNote: 'denied',
				},
				{ token: wrongScopeToken },
			);
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `haur${suffix}` });
			const roleDenied = await api(
				'admin/update-abuse-user-report',
				{
					reportId: report.id,
					moderationNote: 'denied',
				},
				normalUser,
			);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

			const missing = await api(
				'admin/update-abuse-user-report',
				{
					reportId: '000000000000000000000000',
					moderationNote: 'missing',
				},
				alice,
			);
			expect(missing.status).toBe(404);
			expect(castAsError(missing.body as any).error.code).toBe('NO_SUCH_ABUSE_REPORT');
			expect(castAsError(missing.body as any).error.id).toBe('15f51cf5-46d1-4b1d-a618-b35bcbed0662');

			for (let i = 0; i < 10; i++) {
				const logs = await listModerationLogsFromDatabase(db, {
					limit: 10,
					order: 'desc',
					type: 'updateAbuseReportNote',
					search: report.id,
				});
				if (logs.length > 0) {
					expect(logs.some(
							(log) =>
								(log.info as any).reportId === report.id &&
								(log.info as any).before === report.moderationNote &&
								(log.info as any).after === moderationNote,
						)).toBe(true);
					break;
				}
				await new Promise((resolve) => setTimeout(resolve, 100));
				if (i === 9) assert.fail('updateAbuseReportNote moderation log was not found');
			}
		});
	});

	describe('admin/show-user', () => {
		test('admin/show-users は作成日時順のoffsetを維持する', async () => {
			const firstPage = await api(
				'admin/show-users',
				{
					limit: 3,
					sort: '-createdAt',
				},
				alice,
			);
			expect(firstPage.status).toBe(200);
			expect(firstPage.body.length).toBe(3);

			const listed = await api(
				'admin/show-users',
				{
					limit: 1,
					offset: 1,
					sort: '-createdAt',
				},
				alice,
			);

			expect(listed.status).toBe(200);
			expect(listed.body.map((user) => user.id)).toStrictEqual([firstPage.body[1]!.id]);
		});

		test('admin/show-user と admin/show-users は詳細、filter、token scope、roleを維持する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const config = fixtureConfig;
			const target = await signup({ username: `hashow${suffix}` });
			await updateUserProfileInDatabase(db, target.id, {
				email: `hashow-${suffix}@example.test`,
				emailVerified: true,
				followedMessage: `followed ${suffix}`,
				moderationNote: `moderation ${suffix}`,
				mutedWords: [`mute${suffix}`, ['deep', suffix]],
				mutedInstances: [`muted-${suffix}.example`],
				notificationRecieveConfig: {
					follow: {
						type: 'normal',
					},
				} as any,
				autoAcceptFollowed: true,
				noCrawle: true,
				preventAiLearning: false,
				alwaysMarkNsfw: true,
				autoSensitive: true,
				carefulBot: true,
				injectFeaturedNote: false,
				receiveAnnouncementEmail: false,
			});
			await updateUserInDatabase(db, target.id, {
				isSuspended: true,
				isHibernated: true,
				lastActiveDate: new Date(now - 1234),
			});
			const showRole = await createRoleInDatabase(db, {
				id: genId(now),
				updatedAt: new Date(now),
				lastUsedAt: new Date(now),
				name: `Hono show user role ${suffix}`,
				description: 'show user role',
				color: '#2266aa',
				iconUrl: null,
				target: 'manual',
				condFormula: {
					id: '018d87a0-7f78-48b4-9ee8-1e22e6f73089',
					type: 'isRemote',
				},
				isPublic: true,
				isAdministrator: false,
				isModerator: true,
				isExplorable: true,
				asBadge: false,
				preserveAssignmentOnMoveAccount: false,
				canEditMembersByModerator: false,
				displayOrder: 4242,
				policies: {
					canPublicNote: {
						useDefault: false,
						priority: 0,
						value: false,
					},
				},
			});
			const assign = await createRoleAssignmentInDatabase(db, {
				id: genId(now + 1),
				userId: target.id,
				roleId: showRole.id,
				expiresAt: new Date(now + 60 * 1000),
			});
			const signin = await createSigninInDatabase(db, {
				id: genId(now + 2),
				userId: target.id,
				ip: `10.0.0.${Number.parseInt(suffix.slice(-2), 36) % 200}`,
				headers: {
					'user-agent': `hono-show-${suffix}`,
				},
				success: true,
			});

			const shown = await api('admin/show-user', { userId: target.id }, alice);
			expect(shown.status).toBe(200);
			expect(shown.body.email).toBe(`hashow-${suffix}@example.test`);
			expect(shown.body.emailVerified).toBe(true);
			expect(shown.body.followedMessage).toBe(`followed ${suffix}`);
			expect(shown.body.moderationNote).toBe(`moderation ${suffix}`);
			expect(shown.body.mutedInstances).toStrictEqual([`muted-${suffix}.example`]);
			expect(shown.body.isModerator).toBe(true);
			expect(shown.body.isSilenced).toBe(true);
			expect(shown.body.isSuspended).toBe(true);
			expect(shown.body.isHibernated).toBe(true);
			expect(shown.body.lastActiveDate).toBe(new Date(now - 1234).toISOString());
			expect(shown.body.policies.canPublicNote).toBe(false);
			assert.ok(
				shown.body.roles.some(
					(item) => item.id === showRole.id && item.name === showRole.name && item.usersCount === 1,
				),
			);
			assert.ok(
				shown.body.roleAssigns.some(
					(item) =>
						item.roleId === showRole.id &&
						item.createdAt === parseId(assign.id).date.toISOString() &&
						item.expiresAt === assign.expiresAt?.toISOString(),
				),
			);
			assert.ok(
				shown.body.signins.some((item) => item.id === signin.id && item.ip === signin.ip && item.success === true),
			);

			const listed = await api(
				'admin/show-users',
				{
					state: 'moderator',
					username: target.username.slice(0, 6),
					limit: 10,
					sort: '+createdAt',
				},
				alice,
			);
			expect(listed.status).toBe(200);
			const listedTarget = listed.body.find((item) => item.id === target.id);
			assert.ok(listedTarget);
			expect(listedTarget.username).toBe(target.username);
			expect(listedTarget.moderationNote).toBe(`moderation ${suffix}`);
			expect(listedTarget.isSilenced).toBe(true);
			assert.ok(listedTarget.roles.some((item) => item.id === showRole.id && item.displayOrder === 4242));

			const token = await createAppToken(alice, ['read:admin:show-user']);
			const shownByToken = await api('admin/show-user', { userId: target.id }, { token });
			expect(shownByToken.status).toBe(200);
			expect(shownByToken.body.email).toBe(`hashow-${suffix}@example.test`);

			const wrongScopeToken = await createAppToken(alice, ['read:admin:user-ips']);
			const scopeDenied = await api('admin/show-users', {}, { token: wrongScopeToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `hashown${suffix}` });
			const roleDenied = await api('admin/show-user', { userId: target.id }, normalUser);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
		});
	});

	describe('admin/user-maintenance', () => {
		test('root と administrator の認証情報を権限階層に従って保護する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const moderator = await signup({ username: `haumm${suffix}` });
			const administrator = await signup({ username: `hauma${suffix}` });
			const adminTarget = await signup({ username: `haumat${suffix}` });
			const ordinaryTarget = await signup({ username: `haumu${suffix}` });
			const moderatorRole = await role(alice, { name: `maintenance moderator ${suffix}`, isModerator: true });
			const administratorRole = await role(alice, {
				name: `maintenance administrator ${suffix}`,
				isAdministrator: true,
			});

			await createRoleAssignmentInDatabase(db, {
				id: genId(now + 1),
				userId: moderator.id,
				roleId: moderatorRole.id,
				expiresAt: null,
			});
			await createRoleAssignmentInDatabase(db, {
				id: genId(now + 2),
				userId: administrator.id,
				roleId: administratorRole.id,
				expiresAt: null,
			});
			await createRoleAssignmentInDatabase(db, {
				id: genId(now + 3),
				userId: adminTarget.id,
				roleId: administratorRole.id,
				expiresAt: null,
			});

			const originalRootProfile = await fetchUserProfileByUserIdOrFailFromDatabase(db, alice.id);
			const rootPassword = await bunPassword.hash('root-password', { algorithm: 'bcrypt', cost: 8 });
			const adminPassword = await bunPassword.hash('admin-password', { algorithm: 'bcrypt', cost: 8 });
			await updateUserProfileInDatabase(db, alice.id, {
				password: rootPassword,
				twoFactorSecret: 'root-two-factor-secret',
				twoFactorEnabled: true,
			});
			await updateUserProfileInDatabase(db, adminTarget.id, {
				password: adminPassword,
				twoFactorSecret: 'admin-two-factor-secret',
				twoFactorEnabled: true,
			});
			await updateUserProfileInDatabase(db, ordinaryTarget.id, {
				password: await bunPassword.hash('ordinary-password', { algorithm: 'bcrypt', cost: 8 }),
				twoFactorSecret: 'ordinary-two-factor-secret',
				twoFactorEnabled: true,
			});

			try {
				const resetRootByAdministrator = await api('admin/reset-password', { userId: alice.id }, administrator);
				expect(resetRootByAdministrator.status).toBe(400);
				expect(castAsError(resetRootByAdministrator.body as any).error.code).toBe('ACCESS_DENIED');
				const unsetRootMfaByAdministrator = await api('admin/unset-mfa', { userId: alice.id }, administrator);
				expect(unsetRootMfaByAdministrator.status).toBe(400);
				expect(castAsError(unsetRootMfaByAdministrator.body as any).error.code).toBe('ACCESS_DENIED');
				const profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, alice.id);
				expect(profile.password).toBe(rootPassword);
				expect(profile.twoFactorEnabled).toBe(true);

				// 本人の操作は乗っ取りにならないので通す
				const resetRootBySelf = await api('admin/reset-password', { userId: alice.id }, alice);
				expect(resetRootBySelf.status).toBe(200);
				expect(resetRootBySelf.body.password.length).toBe(8);
			} finally {
				await updateUserProfileInDatabase(db, alice.id, {
					password: originalRootProfile.password,
					twoFactorSecret: originalRootProfile.twoFactorSecret,
					twoFactorBackupSecret: originalRootProfile.twoFactorBackupSecret,
					twoFactorEnabled: originalRootProfile.twoFactorEnabled,
					usePasswordLessLogin: originalRootProfile.usePasswordLessLogin,
				});
			}

			const resetAdminByModerator = await api('admin/reset-password', { userId: adminTarget.id }, moderator);
			expect(resetAdminByModerator.status).toBe(400);
			expect(castAsError(resetAdminByModerator.body as any).error.code).toBe('ACCESS_DENIED');
			const unsetAdminMfaByModerator = await api('admin/unset-mfa', { userId: adminTarget.id }, moderator);
			expect(unsetAdminMfaByModerator.status).toBe(400);
			expect(castAsError(unsetAdminMfaByModerator.body as any).error.code).toBe('ACCESS_DENIED');
			let profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, adminTarget.id);
			expect(profile.password).toBe(adminPassword);
			expect(profile.twoFactorEnabled).toBe(true);

			const resetOrdinaryByModerator = await api('admin/reset-password', { userId: ordinaryTarget.id }, moderator);
			expect(resetOrdinaryByModerator.status).toBe(200);
			expect(resetOrdinaryByModerator.body.password.length).toBe(8);
			const unsetOrdinaryMfaByModerator = await api('admin/unset-mfa', { userId: ordinaryTarget.id }, moderator);
			expect(unsetOrdinaryMfaByModerator.status).toBe(204);
			profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, ordinaryTarget.id);
			expect(await bunPassword.verify(resetOrdinaryByModerator.body.password, profile.password!, 'bcrypt')).toBe(true);
			expect(profile.twoFactorEnabled).toBe(false);

			// 管理者どうしでも横取りはできない
			const resetAdminByAdministrator = await api('admin/reset-password', { userId: adminTarget.id }, administrator);
			expect(resetAdminByAdministrator.status).toBe(400);
			expect(castAsError(resetAdminByAdministrator.body as any).error.code).toBe('ACCESS_DENIED');
			const unsetAdminMfaByAdministrator = await api('admin/unset-mfa', { userId: adminTarget.id }, administrator);
			expect(unsetAdminMfaByAdministrator.status).toBe(400);
			expect(castAsError(unsetAdminMfaByAdministrator.body as any).error.code).toBe('ACCESS_DENIED');
			profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, adminTarget.id);
			expect(profile.password).toBe(adminPassword);
			expect(profile.twoFactorEnabled).toBe(true);
		});

		test('admin/reset-password と unset 系 endpoint は DB 更新、token scope、role、ログを維持する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const target = await signup({ username: `haum${suffix}` });
			const config = fixtureConfig;
			const avatarMd5 = createHash('md5').update(`hono-admin-avatar-${suffix}`).digest('hex');
			const bannerMd5 = createHash('md5').update(`hono-admin-banner-${suffix}`).digest('hex');
			const avatarFile = await createDriveFileInDatabase(db, {
				id: genId(),
				userId: target.id,
				userHost: null,
				md5: avatarMd5,
				name: `avatar-${suffix}.png`,
				type: 'image/png',
				size: 11,
				storedInternal: true,
				url: `${origin}/files/${avatarMd5}`,
			});
			const bannerFile = await createDriveFileInDatabase(db, {
				id: genId(),
				userId: target.id,
				userHost: null,
				md5: bannerMd5,
				name: `banner-${suffix}.png`,
				type: 'image/png',
				size: 11,
				storedInternal: true,
				url: `${origin}/files/${bannerMd5}`,
			});

			await updateUserProfileInDatabase(db, target.id, {
				password: await bunPassword.hash('old-password', { algorithm: 'bcrypt', cost: 8 }),
				twoFactorSecret: 'two-factor-secret',
				twoFactorBackupSecret: ['backup-code'],
				twoFactorEnabled: true,
				usePasswordLessLogin: true,
			});
			await updateUserInDatabase(db, target.id, {
				avatarId: avatarFile.id,
				avatarUrl: 'https://example.test/avatar.png',
				avatarBlurhash: 'avatar-blurhash',
				bannerId: bannerFile.id,
				bannerUrl: 'https://example.test/banner.png',
				bannerBlurhash: 'banner-blurhash',
			});

			const reset = await api('admin/reset-password', { userId: target.id }, alice);
			expect(reset.status).toBe(200);
			expect(reset.body.password.length).toBe(8);
			let profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, target.id);
			expect(await bunPassword.verify(reset.body.password, profile.password!, 'bcrypt')).toBe(true);

			const resetToken = await createAppToken(alice, ['write:admin:reset-password']);
			const resetByToken = await api('admin/reset-password', { userId: target.id }, { token: resetToken });
			expect(resetByToken.status).toBe(200);
			expect(resetByToken.body.password.length).toBe(8);
			profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, target.id);
			expect(await bunPassword.verify(resetByToken.body.password, profile.password!, 'bcrypt')).toBe(true);

			const noSuchReset = await api('admin/reset-password', { userId: '000000000000000000000000' }, alice);
			expect(noSuchReset.status).toBe(400);
			expect(castAsError(noSuchReset.body as any).error.code).toBe('NO_SUCH_USER');

			const wrongScopeToken = await createAppToken(alice, ['write:admin:unset-mfa']);
			const scopeDenied = await api('admin/reset-password', { userId: target.id }, { token: wrongScopeToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `hanm${suffix}` });
			const roleDenied = await api('admin/reset-password', { userId: target.id }, normalUser);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

			const unsetMfa = await api('admin/unset-mfa', { userId: target.id }, alice);
			expect(unsetMfa.status).toBe(204);
			profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, target.id);
			expect(profile.twoFactorSecret).toBe(null);
			expect(profile.twoFactorBackupSecret).toBe(null);
			expect(profile.twoFactorEnabled).toBe(false);
			expect(profile.usePasswordLessLogin).toBe(false);

			const noSuchUnsetMfa = await api('admin/unset-mfa', { userId: '000000000000000000000000' }, alice);
			expect(noSuchUnsetMfa.status).toBe(400);
			expect(castAsError(noSuchUnsetMfa.body as any).error.code).toBe('NO_SUCH_USER');

			const unsetAvatar = await api('admin/unset-user-avatar', { userId: target.id }, alice);
			expect(unsetAvatar.status).toBe(204);
			let user = await fetchUserByIdOrFailFromDatabase(db, target.id);
			expect(user.avatarId).toBe(null);
			expect(user.avatarUrl).toBe(null);
			expect(user.avatarBlurhash).toBe(null);

			const unsetAvatarAgain = await api('admin/unset-user-avatar', { userId: target.id }, alice);
			expect(unsetAvatarAgain.status).toBe(204);

			const unsetBanner = await api('admin/unset-user-banner', { userId: target.id }, alice);
			expect(unsetBanner.status).toBe(204);
			user = await fetchUserByIdOrFailFromDatabase(db, target.id);
			expect(user.bannerId).toBe(null);
			expect(user.bannerUrl).toBe(null);
			expect(user.bannerBlurhash).toBe(null);

			const unsetBannerAgain = await api('admin/unset-user-banner', { userId: target.id }, alice);
			expect(unsetBannerAgain.status).toBe(204);

			const logTypes = ['resetPassword', 'unsetMfa', 'unsetUserAvatar', 'unsetUserBanner'] as const;
			const logged = new Set<string>();
			for (let i = 0; i < 10; i++) {
				for (const type of logTypes) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: target.id,
					});
					if (logs.length > 0) logged.add(type);
				}
				if (logged.size === logTypes.length) break;
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			expect([...logged].sort()).toStrictEqual([...logTypes].sort());
		});

		test('admin/update-user-note は moderationNote 更新、token scope、role、ログを維持する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const target = await signup({ username: `haun${suffix}` });
			await updateUserProfileInDatabase(db, target.id, {
				moderationNote: 'before note',
			});

			const text = `after note ${suffix}`;
			const updated = await api(
				'admin/update-user-note',
				{
					userId: target.id,
					text,
				},
				alice,
			);
			expect(updated.status).toBe(204);

			let profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, target.id);
			expect(profile.moderationNote).toBe(text);

			const token = await createAppToken(alice, ['write:admin:user-note']);
			const updatedByToken = await api(
				'admin/update-user-note',
				{
					userId: target.id,
					text: `${text} by token`,
				},
				{ token },
			);
			expect(updatedByToken.status).toBe(204);

			profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, target.id);
			expect(profile.moderationNote).toBe(`${text} by token`);

			const wrongScopeToken = await createAppToken(alice, ['write:admin:reset-password']);
			const scopeDenied = await api(
				'admin/update-user-note',
				{
					userId: target.id,
					text: 'denied',
				},
				{ token: wrongScopeToken },
			);
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `hunn${suffix}` });
			const roleDenied = await api(
				'admin/update-user-note',
				{
					userId: target.id,
					text: 'denied',
				},
				normalUser,
			);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

			for (let i = 0; i < 10; i++) {
				const logs = await listModerationLogsFromDatabase(db, {
					limit: 10,
					order: 'desc',
					type: 'updateUserNote',
					search: target.id,
				});
				if (logs.length > 0) {
					expect(logs.some((log) => (log.info as any).before === 'before note' && (log.info as any).after === text)).toBe(true);
					break;
				}
				await new Promise((resolve) => setTimeout(resolve, 100));
				if (i === 9) assert.fail('updateUserNote moderation log was not found');
			}
		});

		test('admin/send-email は送信要求、token scope、role、validationを維持する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const payload = {
				to: `hono-send-email-${suffix}@example.test`,
				subject: `Hono send email ${suffix}`,
				text: `Hello ${suffix}`,
			};

			const sent = await api('admin/send-email', payload, alice);
			expect(sent.status).toBe(204);

			const token = await createAppToken(alice, ['write:admin:send-email']);
			const sentByToken = await api('admin/send-email', payload, { token });
			expect(sentByToken.status).toBe(204);

			const wrongScopeToken = await createAppToken(alice, ['write:admin:user-note']);
			const scopeDenied = await api('admin/send-email', payload, { token: wrongScopeToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `hse${suffix}` });
			const roleDenied = await api('admin/send-email', payload, normalUser);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

			const invalidPayload: Record<string, unknown> = {
				to: payload.to,
				subject: payload.subject,
			};
			const invalid = await api(
				'admin/send-email',
				invalidPayload as misskey.Endpoints['admin/send-email']['req'],
				alice,
			);
			expect(invalid.status).toBe(400);
			expect(castAsError(invalid.body as any).error.code).toBe('INVALID_PARAM');
		});

		test('admin/suspend-user と admin/unsuspend-user は状態更新、queue、token scope、role、ログを維持する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const target = await signup({ username: `hsus${suffix}` });
			// 共有fixtureのbobをfolloweeにすると、suspend時のunfollowジョブがカウンタを負値に
			// 汚染して後続のfollowing系テストを壊すため、使い捨てユーザーを用いる
			const throwawayFollowee = await signup({ username: `hsusf${suffix}` });
			const config = fixtureConfig;
			const following = await createFollowingInDatabase(db, {
				id: genId(),
				followerId: target.id,
				followeeId: throwawayFollowee.id,
			});

			const suspended = await api('admin/suspend-user', { userId: target.id }, alice);
			expect(suspended.status).toBe(204);

			let targetUser = await fetchUserByIdOrFailFromDatabase(db, target.id);
			expect(targetUser.isSuspended).toBe(true);

			for (let i = 0; i < 10; i++) {
				const jobs = await relationshipQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
				const job = jobs.find(
					(job) =>
						job.name === 'unfollow' &&
						job.data.from.id === following.followerId &&
						job.data.to.id === following.followeeId &&
						job.data.silent === true,
				);
				if (job != null) {
					await job.remove();
					break;
				}
				await new Promise((resolve) => setTimeout(resolve, 100));
				if (i === 9) assert.fail('suspend-user unfollow job was not created');
			}

			const suspendTokenTarget = await signup({ username: `hstt${suffix}` });
			const suspendToken = await createAppToken(alice, ['write:admin:suspend-user']);
			const suspendedByToken = await api(
				'admin/suspend-user',
				{ userId: suspendTokenTarget.id },
				{ token: suspendToken },
			);
			expect(suspendedByToken.status).toBe(204);

			const wrongScopeToken = await createAppToken(alice, ['write:admin:user-note']);
			const suspendScopeDenied = await api('admin/suspend-user', { userId: target.id }, { token: wrongScopeToken });
			expect(suspendScopeDenied.status).toBe(403);
			expect(castAsError(suspendScopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `hsnr${suffix}` });
			const suspendRoleDenied = await api('admin/suspend-user', { userId: target.id }, normalUser);
			expect(suspendRoleDenied.status).toBe(403);
			expect(castAsError(suspendRoleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

			const unsuspended = await api('admin/unsuspend-user', { userId: target.id }, alice);
			expect(unsuspended.status).toBe(204);

			targetUser = await fetchUserByIdOrFailFromDatabase(db, target.id);
			expect(targetUser.isSuspended).toBe(false);

			const unsuspendToken = await createAppToken(alice, ['write:admin:unsuspend-user']);
			const unsuspendedByToken = await api('admin/unsuspend-user', { userId: target.id }, { token: unsuspendToken });
			expect(unsuspendedByToken.status).toBe(204);

			const unsuspendScopeDenied = await api('admin/unsuspend-user', { userId: target.id }, { token: wrongScopeToken });
			expect(unsuspendScopeDenied.status).toBe(403);
			expect(castAsError(unsuspendScopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const unsuspendRoleDenied = await api('admin/unsuspend-user', { userId: target.id }, normalUser);
			expect(unsuspendRoleDenied.status).toBe(403);
			expect(castAsError(unsuspendRoleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

			const logged = new Set<string>();
			for (let i = 0; i < 10; i++) {
				for (const type of ['suspend', 'unsuspend'] as const) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: target.id,
					});
					if (logs.length > 0) logged.add(type);
				}
				if (logged.size === 2) break;
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			expect([...logged].sort()).toStrictEqual(['suspend', 'unsuspend']);
		});
	});

	describe('admin/get-user-ips', () => {
		test('admin/get-user-ips は最新30件、admin権限、token scopeを維持する', async () => {
			const now = Date.now();
			const createdAtBase = new Date(now - 1000 * 60);
			const rows = await insertUserIps(
				db,
				Array.from({ length: 32 }, (_, i) => ({
					userId: bob.id,
					ip: `hono-ip-${now}-${i}`,
					createdAt: new Date(createdAtBase.getTime() + i * 1000),
				})),
			);
			const expected = rows
				.sort((a, b) => b.id - a.id)
				.slice(0, 30)
				.map((row) => ({
					ip: row.ip,
					createdAt: row.createdAt.toISOString(),
				}));

			const listed = await api(
				'admin/get-user-ips',
				{
					userId: bob.id,
				},
				alice,
			);
			expect(listed.status).toBe(200);
			expect(listed.body).toStrictEqual(expected);

			const readToken = await createAppToken(alice, ['read:admin:user-ips']);
			const listedWithApp = await api(
				'admin/get-user-ips',
				{
					userId: bob.id,
				},
				{ token: readToken },
			);
			expect(listedWithApp.status).toBe(200);
			expect(listedWithApp.body).toStrictEqual(expected);

			const deniedToken = await createAppToken(alice, ['read:admin:roles']);
			const scopeDenied = await api(
				'admin/get-user-ips',
				{
					userId: bob.id,
				},
				{ token: deniedToken },
			);
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `honoips${now.toString(36)}` });
			const roleDenied = await api(
				'admin/get-user-ips',
				{
					userId: bob.id,
				},
				normalUser,
			);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
		});
	});

	describe('admin/server-info', () => {
		function assertAdminServerInfoBody(body: any): void {
			expect(typeof body.machine).toBe('string');
			expect(typeof body.os).toBe('string');
			expect(typeof body.node).toBe('string');
			expect(typeof body.psql).toBe('string');
			expect(typeof body.redis).toBe('string');
			expect(typeof body.cpu.model).toBe('string');
			expect(typeof body.cpu.cores).toBe('number');
			expect(typeof body.mem.total).toBe('number');
			expect(typeof body.fs.total).toBe('number');
			expect(typeof body.fs.used).toBe('number');
			expect(typeof body.net.interface).toBe('string');
		}

		test('admin/server-info はサーバ情報、moderator権限、token scopeを維持する', async () => {
			const listed = await api('admin/server-info', {}, alice);
			expect(listed.status).toBe(200);
			assertAdminServerInfoBody(listed.body);

			const readToken = await createAppToken(alice, ['read:admin:server-info']);
			const listedWithApp = await api('admin/server-info', {}, { token: readToken });
			expect(listedWithApp.status).toBe(200);
			assertAdminServerInfoBody(listedWithApp.body);

			const deniedToken = await createAppToken(alice, ['read:admin:user-ips']);
			const scopeDenied = await api('admin/server-info', {}, { token: deniedToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `honosi${Date.now().toString(36)}` });
			const roleDenied = await api('admin/server-info', {}, normalUser);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
		});
	});

	describe('admin/relays', () => {
		async function findDeliverJob(inbox: string, type: 'Follow' | 'Undo'): Promise<Bull.Job<DeliverJobData>> {
			for (let i = 0; i < 10; i++) {
				const jobs = await deliverQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
				for (const job of jobs) {
					if (job.data.to !== inbox) continue;

					const content = JSON.parse(job.data.content) as { type?: unknown };
					if (content.type === type) return job;
				}
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			assert.fail(`deliver job was not found: ${inbox} ${type}`);
		}

		test('admin/relays/list はrelay一覧、moderator権限、token scopeを維持する', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const relays = await Promise.all(
				(
					[
						['requesting', 'requesting'],
						['accepted', 'accepted'],
						['rejected', 'rejected'],
					] as const
				).map(([label, status], i) =>
					createRelayInDatabase(db, {
						id: genId(now + i),
						inbox: `https://relay-${label}-${now}.example/inbox`,
						status,
					}),
				),
			);
			const expected = relays
				.map((relay) => ({
					id: relay.id,
					inbox: relay.inbox,
					status: relay.status,
				}))
				.sort((a, b) => a.id.localeCompare(b.id));

			const listed = await api('admin/relays/list', {}, alice);
			expect(listed.status).toBe(200);
			expect(listed.body
					.filter((relay) => expected.some((expectedRelay) => expectedRelay.id === relay.id))
					.sort((a, b) => a.id.localeCompare(b.id))).toStrictEqual(expected);

			const readToken = await createAppToken(alice, ['read:admin:relays']);
			const listedWithApp = await api('admin/relays/list', {}, { token: readToken });
			expect(listedWithApp.status).toBe(200);
			expect(listedWithApp.body
					.filter((relay) => expected.some((expectedRelay) => expectedRelay.id === relay.id))
					.sort((a, b) => a.id.localeCompare(b.id))).toStrictEqual(expected);

			const deniedToken = await createAppToken(alice, ['read:admin:user-ips']);
			const scopeDenied = await api('admin/relays/list', {}, { token: deniedToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `honorelay${now.toString(36)}` });
			const roleDenied = await api('admin/relays/list', {}, normalUser);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
		});

		test('admin/relays/add と admin/relays/remove はDB、deliver queue、権限を維持する', async () => {
			const now = Date.now();
			const inbox = `https://relay-write-${now}.example/inbox`;

			const added = await api('admin/relays/add', { inbox }, alice);
			expect(added.status).toBe(200);
			expect(added.body.inbox).toBe(inbox);
			expect(added.body.status).toBe('requesting');
			expect(typeof added.body.id).toBe('string');

			const row = await fetchRelayByInboxFromDatabase(db, inbox);
			assert.ok(row);
			expect(row.id).toBe(added.body.id);

			const followJob = await findDeliverJob(inbox, 'Follow');
			expect(followJob.data.to).toBe(inbox);
			expect(followJob.data.isSharedInbox).toBe(false);
			expect(followJob.data.digest).toBe(`SHA-256=${createHash('sha256').update(followJob.data.content).digest('base64')}`);

			const follow = JSON.parse(followJob.data.content) as any;
			expect(follow.type).toBe('Follow');
			expect(follow.id).toBe(`${origin}/activities/follow-relay/${added.body.id}`);
			expect(follow.actor.startsWith(`${origin}/users/`)).toBe(true);
			expect(follow.object).toBe('https://www.w3.org/ns/activitystreams#Public');
			assert.ok(follow['@context']);
			await followJob.remove();

			const invalidUrl = await api('admin/relays/add', { inbox: 'http://relay-invalid.example/inbox' }, alice);
			expect(invalidUrl.status).toBe(400);
			expect(castAsError(invalidUrl.body as any).error.code).toBe('INVALID_URL');
			expect(castAsError(invalidUrl.body as any).error.id).toBe('fb8c92d3-d4e5-44e7-b3d4-800d5cef8b2c');

			const readToken = await createAppToken(alice, ['read:admin:relays']);
			const scopeDenied = await api(
				'admin/relays/add',
				{ inbox: `https://relay-denied-${now}.example/inbox` },
				{ token: readToken },
			);
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `honorelayw${now.toString(36)}` });
			const roleDenied = await api(
				'admin/relays/add',
				{ inbox: `https://relay-role-denied-${now}.example/inbox` },
				normalUser,
			);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

			const removed = await api('admin/relays/remove', { inbox }, alice);
			expect(removed.status).toBe(204);
			expect(await fetchRelayByInboxFromDatabase(db, inbox)).toBe(null);

			const undoJob = await findDeliverJob(inbox, 'Undo');
			expect(undoJob.data.to).toBe(inbox);
			expect(undoJob.data.isSharedInbox).toBe(false);
			expect(undoJob.data.digest).toBe(`SHA-256=${createHash('sha256').update(undoJob.data.content).digest('base64')}`);

			const undo = JSON.parse(undoJob.data.content) as any;
			expect(undo.type).toBe('Undo');
			expect(undo.id).toBe(`${origin}/activities/follow-relay/${added.body.id}/undo`);
			expect(undo.actor.startsWith(`${origin}/users/`)).toBe(true);
			expect(undo.object.type).toBe('Follow');
			expect(undo.object.id).toBe(`${origin}/activities/follow-relay/${added.body.id}`);
			expect(typeof undo.published).toBe('string');
			assert.ok(undo['@context']);
			await undoJob.remove();
		});
	});

	describe('admin/queue read endpoints', () => {
		test('admin/queue のread endpointはqueue状態、job、権限を維持する', async () => {
			const now = Date.now();
			const delayedDeliverHost = `queue-deliver-${now}.example`;
			const delayedInboxHost = `queue-inbox-${now}.example`;
			const waitingInbox = `https://queue-waiting-${now}.example/inbox`;
			const waitingName = `hono-queue-waiting-${now}`;
			const waitingContent = JSON.stringify({ type: 'QueueTest', id: now });
			const waitingJob = await deliverQueue!.add(
				waitingName,
				{
					user: { id: alice.id },
					content: waitingContent,
					digest: `SHA-256=${createHash('sha256').update(waitingContent).digest('base64')}`,
					to: waitingInbox,
					isSharedInbox: false,
				},
				{ removeOnComplete: true, removeOnFail: true },
			);
			const delayedDeliverJob = await deliverQueue!.add(
				`hono-queue-delayed-${now}`,
				{
					user: { id: alice.id },
					content: waitingContent,
					digest: `SHA-256=${createHash('sha256').update(waitingContent).digest('base64')}`,
					to: `https://${delayedDeliverHost}/inbox`,
					isSharedInbox: false,
				},
				{ delay: 60_000, removeOnComplete: true, removeOnFail: true },
			);
			const delayedInboxJob = await inboxQueue!.add(
				`hono-inbox-delayed-${now}`,
				{
					activity: {
						type: 'Create',
						actor: `https://${delayedInboxHost}/actor`,
						object: `https://${delayedInboxHost}/notes/${now}`,
					},
					signature: {
						keyId: `https://${delayedInboxHost}/actor#main-key`,
					},
				} as InboxJobData,
				{ delay: 60_000, removeOnComplete: true, removeOnFail: true },
			);

			try {
				await waitingJob.log(`hono queue log ${now}`);
				assert.ok(waitingJob.id);

				const queues = await api('admin/queue/queues', {}, alice);
				expect(queues.status).toBe(200);
				const deliverQueueInfo = queues.body.find((queue) => queue.name === 'deliver');
				assert.ok(deliverQueueInfo);
				expect(typeof deliverQueueInfo.isPaused).toBe('boolean');
				expect(typeof deliverQueueInfo.counts).toBe('object');
				expect(typeof deliverQueueInfo.metrics.completed.count).toBe('number');

				const queueStats = await api('admin/queue/queue-stats', { queue: 'deliver' }, alice);
				expect(queueStats.status).toBe(200);
				expect(queueStats.body.name).toBe('deliver');
				expect(typeof queueStats.body.qualifiedName).toBe('string');
				expect(typeof queueStats.body.db.version).toBe('string');

				const queueScopeToken = await createAppToken(alice, ['read:admin:queue']);
				const legacyStats = await api('admin/queue/stats', {}, { token: queueScopeToken });
				expect(legacyStats.status).toBe(200);
				expect(typeof legacyStats.body.deliver).toBe('object');
				expect(typeof legacyStats.body.inbox).toBe('object');
				expect(typeof legacyStats.body.db).toBe('object');
				expect(typeof legacyStats.body.objectStorage).toBe('object');

				// キューの情報なので、他の admin スコープしか持たないトークンでは読めてはいけない
				const emojiScopeToken = await createAppToken(alice, ['read:admin:emoji']);
				const deniedStats = await api('admin/queue/stats', {}, { token: emojiScopeToken });
				expect(deniedStats.status).toBe(403);
				expect(castAsError(deniedStats.body as any).error.code).toBe('PERMISSION_DENIED');

				const deliverDelayed = await api('admin/queue/deliver-delayed', {}, alice);
				expect(deliverDelayed.status).toBe(200);
				assert.ok(deliverDelayed.body.some(([host, count]) => host === delayedDeliverHost && count >= 1));

				const inboxDelayed = await api('admin/queue/inbox-delayed', {}, alice);
				expect(inboxDelayed.status).toBe(200);
				assert.ok(inboxDelayed.body.some(([host, count]) => host === delayedInboxHost && count >= 1));

				const jobs = await api('admin/queue/jobs', { queue: 'deliver', state: ['wait'], search: waitingName }, alice);
				expect(jobs.status).toBe(200);
				assert.ok(jobs.body.some((job) => job.id === waitingJob.id && job.name === waitingName));

				const shown = await api('admin/queue/show-job', { queue: 'deliver', jobId: waitingJob.id }, alice);
				expect(shown.status).toBe(200);
				expect(shown.body.id).toBe(waitingJob.id);
				expect(shown.body.name).toBe(waitingName);
				expect(shown.body.data['to']).toBe(waitingInbox);

				const logs = await api('admin/queue/show-job-logs', { queue: 'deliver', jobId: waitingJob.id }, alice);
				expect(logs.status).toBe(200);
				assert.ok(logs.body.includes(`hono queue log ${now}`));

				const readQueueToken = await createAppToken(alice, ['read:admin:queue']);
				const queuesWithToken = await api('admin/queue/queues', {}, { token: readQueueToken });
				expect(queuesWithToken.status).toBe(200);

				const deniedToken = await createAppToken(alice, ['read:admin:relays']);
				const scopeDenied = await api('admin/queue/queues', {}, { token: deniedToken });
				expect(scopeDenied.status).toBe(403);
				expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

				const normalUser = await signup({ username: `honoqueue${now.toString(36)}` });
				const roleDenied = await api('admin/queue/queues', {}, normalUser);
				expect(roleDenied.status).toBe(403);
				expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
			} finally {
				await waitingJob.remove().catch(() => undefined);
				await delayedDeliverJob.remove().catch(() => undefined);
				await delayedInboxJob.remove().catch(() => undefined);
			}
		});
	});

	describe('admin/queue write endpoints', () => {
		async function expectModerationLog(
			type: 'clearQueue' | 'promoteQueue' | 'pauseQueue' | 'resumeQueue',
		): Promise<void> {
			for (let i = 0; i < 10; i++) {
				const logs = await listModerationLogsFromDatabase(db, {
					limit: 20,
					order: 'desc',
					type,
					userId: alice.id,
				});
				if (logs.length > 0) return;
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			assert.fail(`moderation log was not found: ${type}`);
		}

		test('admin/queue のwrite endpointはqueue操作、moderation log、権限を維持する', async () => {
			const now = Date.now();
			const content = JSON.stringify({ type: 'QueueWriteTest', id: now });
			const baseJobData = {
				user: { id: alice.id },
				content,
				digest: `SHA-256=${createHash('sha256').update(content).digest('base64')}`,
				to: `https://queue-write-${now}.example/inbox`,
				isSharedInbox: false,
			};
			let retryJob: Bull.Job<DeliverJobData> | undefined;
			const promoteJob = await deliverQueue!.add(`hono-queue-promote-${now}`, baseJobData, {
				delay: 60_000,
				removeOnComplete: true,
				removeOnFail: true,
			});
			const removeJob = await deliverQueue!.add(
				`hono-queue-remove-${now}`,
				{
					...baseJobData,
					to: `https://queue-remove-${now}.example/inbox`,
				},
				{ removeOnComplete: true, removeOnFail: true },
			);
			const clearJob = await deliverQueue!.add(
				`hono-queue-clear-${now}`,
				{
					...baseJobData,
					to: `https://queue-clear-${now}.example/inbox`,
				},
				{ removeOnComplete: true, removeOnFail: true },
			);

			try {
				assert.ok(promoteJob.id);
				assert.ok(removeJob.id);
				assert.ok(clearJob.id);

				const paused = await api('admin/queue/pause', { queue: 'deliver' }, alice);
				expect(paused.status).toBe(204);
				expect(await deliverQueue!.isPaused()).toBe(true);
				await expectModerationLog('pauseQueue');

				const resumed = await api('admin/queue/resume', { queue: 'deliver' }, alice);
				expect(resumed.status).toBe(204);
				expect(await deliverQueue!.isPaused()).toBe(false);
				await expectModerationLog('resumeQueue');

				const promoted = await api('admin/queue/promote-jobs', { queue: 'deliver' }, alice);
				expect(promoted.status).toBe(204);
				expect(await promoteJob.getState()).not.toBe('delayed');
				await expectModerationLog('promoteQueue');

				retryJob = await deliverQueue!.add(
					`hono-queue-retry-${now}`,
					{
						...baseJobData,
						to: `https://queue-retry-${now}.example/inbox`,
					},
					{ delay: 60_000, removeOnComplete: true, removeOnFail: true },
				);
				assert.ok(retryJob.id);
				const retried = await api('admin/queue/retry-job', { queue: 'deliver', jobId: retryJob.id }, alice);
				expect(retried.status).toBe(204);
				expect(await retryJob.getState()).not.toBe('delayed');

				const removed = await api('admin/queue/remove-job', { queue: 'deliver', jobId: removeJob.id }, alice);
				expect(removed.status).toBe(204);
				expect(await deliverQueue!.getJob(removeJob.id)).toBe(undefined);

				const cleared = await api('admin/queue/clear', { queue: 'deliver', state: 'wait' }, alice);
				expect(cleared.status).toBe(204);
				expect(await deliverQueue!.getJob(clearJob.id)).toBe(undefined);
				await expectModerationLog('clearQueue');

				const writeToken = await createAppToken(alice, ['write:admin:queue']);
				const pausedWithToken = await api('admin/queue/pause', { queue: 'deliver' }, { token: writeToken });
				expect(pausedWithToken.status).toBe(204);
				await api('admin/queue/resume', { queue: 'deliver' }, alice);

				const deniedToken = await createAppToken(alice, ['read:admin:queue']);
				const scopeDenied = await api('admin/queue/pause', { queue: 'deliver' }, { token: deniedToken });
				expect(scopeDenied.status).toBe(403);
				expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

				const normalUser = await signup({ username: `honoqueuew${now.toString(36)}` });
				const roleDenied = await api('admin/queue/pause', { queue: 'deliver' }, normalUser);
				expect(roleDenied.status).toBe(403);
				expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
			} finally {
				await deliverQueue!.resume().catch(() => undefined);
				await promoteJob.remove().catch(() => undefined);
				await retryJob?.remove().catch(() => undefined);
				await removeJob.remove().catch(() => undefined);
				await clearJob.remove().catch(() => undefined);
			}
		});
	});

	describe('admin/queue outbox dead letter endpoints', () => {
		test('デッドレターの一覧・再試行・破棄がrevision競合と権限を維持する', async () => {
			const now = Date.now();
			const deliverOutboxId = genId(now);
			const dbOutboxId = genId(now + 1);
			const deliverContent = JSON.stringify({ type: 'QueueOutboxDeadLetterTest', id: now });
			const deliverJob = await deliverQueue!.add(
				`hono-outbox-deadletter-${now}`,
				{
					user: { id: alice.id },
					content: deliverContent,
					digest: `SHA-256=${createHash('sha256').update(deliverContent).digest('base64')}`,
					to: `https://queue-outbox-${now}.example/inbox`,
					isSharedInbox: false,
				},
				{ jobId: `outbox-${deliverOutboxId}`, delay: 600_000, removeOnComplete: true, removeOnFail: true },
			);

			try {
				await insertQueueOutboxes(db, [
					{
						id: deliverOutboxId,
						queue: 'deliver',
						name: 'deliver',
						kind: 'job',
						state: 'deadLetter',
						data: { to: `https://queue-outbox-${now}.example/inbox` },
						opts: { attempts: 8 },
						externalJobId: `outbox-${deliverOutboxId}`,
						deadLetterReason: 'deliveryFailed',
						lastError: { message: `deliver failed ${now}`, attemptsMade: 8 },
						revision: 3,
					},
					{
						id: dbOutboxId,
						queue: 'db',
						name: 'deleteAccount',
						kind: 'job',
						state: 'deadLetter',
						data: { user: { id: alice.id }, soft: false },
						opts: {},
						deadLetterReason: 'invalidPayload',
						lastError: { message: `invalid payload ${now}` },
						revision: 0,
					},
				]);

				const listed = await api('admin/queue/outbox-dead-letters', {}, alice);
				expect(listed.status).toBe(200);
				const listedDeliver = listed.body.find((row) => row.id === deliverOutboxId);
				assert.ok(listedDeliver);
				expect(listedDeliver.queue).toBe('deliver');
				expect(listedDeliver.name).toBe('deliver');
				expect(listedDeliver.deadLetterReason).toBe('deliveryFailed');
				expect(listedDeliver.externalJobId).toBe(`outbox-${deliverOutboxId}`);
				expect(listedDeliver.revision).toBe(3);
				expect((listedDeliver.lastError as { message: string } | null)?.message).toBe(`deliver failed ${now}`);
				assert.ok(listed.body.some((row) => row.id === dbOutboxId && row.deadLetterReason === 'invalidPayload'));

				// 新しいデッドレターで先頭が埋まっても古いものへ到達できるよう、id 降順 + untilId で辿れること
				const listedIds = listed.body.map((row) => row.id);
				assert.ok(listedIds.indexOf(dbOutboxId) < listedIds.indexOf(deliverOutboxId));
				const firstPage = await api('admin/queue/outbox-dead-letters', { limit: 1 }, alice);
				expect(firstPage.status).toBe(200);
				expect(firstPage.body.length).toBe(1);
				const nextPage = await api('admin/queue/outbox-dead-letters', { untilId: dbOutboxId }, alice);
				expect(nextPage.status).toBe(200);
				assert.ok(!nextPage.body.some((row) => row.id === dbOutboxId));
				assert.ok(nextPage.body.some((row) => row.id === deliverOutboxId));

				// 一覧を取得してから他の管理者やワーカーが触っていた場合、古い revision の操作は弾かれる
				const staleRetry = await api(
					'admin/queue/retry-outbox-dead-letter',
					{ outboxId: deliverOutboxId, revision: 2 },
					alice,
				);
				expect(staleRetry.status).toBe(409);
				expect(castAsError(staleRetry.body as any).error.code).toBe('QUEUE_OUTBOX_STATE_CHANGED');
				const staleAbandon = await api(
					'admin/queue/abandon-outbox-dead-letter',
					{ outboxId: dbOutboxId, revision: 1 },
					alice,
				);
				expect(staleAbandon.status).toBe(409);
				expect(castAsError(staleAbandon.body as any).error.code).toBe('QUEUE_OUTBOX_STATE_CHANGED');
				expect((await fetchQueueOutboxByIdFromDatabase(db, deliverOutboxId))?.state).toBe('deadLetter');
				expect((await fetchQueueOutboxByIdFromDatabase(db, dbOutboxId))?.state).toBe('deadLetter');

				const missing = await api(
					'admin/queue/retry-outbox-dead-letter',
					{ outboxId: genId(now + 2), revision: 0 },
					alice,
				);
				expect(missing.status).toBe(409);
				expect(castAsError(missing.body as any).error.code).toBe('QUEUE_OUTBOX_STATE_CHANGED');

				const statsBefore = await api('admin/queue/queue-stats', { queue: 'db' }, alice);
				expect(statsBefore.status).toBe(200);
				assert.ok(statsBefore.body.outbox);
				assert.ok(statsBefore.body.outbox.deadLetter >= 2);
				assert.ok(statsBefore.body.outbox.deliveryFailed >= 1);
				assert.ok(statsBefore.body.outbox.invalidPayload >= 1);

				const retried = await api(
					'admin/queue/retry-outbox-dead-letter',
					{ outboxId: deliverOutboxId, revision: 3 },
					alice,
				);
				expect(retried.status).toBe(204);
				const retriedRow = await fetchQueueOutboxByIdFromDatabase(db, deliverOutboxId);
				assert.ok(retriedRow);
				expect(retriedRow.state).toBe('ready');
				expect(retriedRow.deadLetterReason).toBe(null);
				expect(retriedRow.lastError).toBe(null);
				expect(retriedRow.leaseToken).toBe(null);
				expect(retriedRow.leaseExpiresAt).toBe(null);
				expect(retriedRow.revision).toBe(4);
				// 再試行で改めて publish されるので、古い BullMQ ジョブは残していると二重配送になる
				expect(await deliverQueue!.getJob(`outbox-${deliverOutboxId}`)).toBe(undefined);

				const abandoned = await api(
					'admin/queue/abandon-outbox-dead-letter',
					{ outboxId: dbOutboxId, revision: 0 },
					alice,
				);
				expect(abandoned.status).toBe(204);
				expect(await fetchQueueOutboxByIdFromDatabase(db, dbOutboxId)).toBe(null);

				const afterList = await api('admin/queue/outbox-dead-letters', {}, alice);
				expect(afterList.status).toBe(200);
				assert.ok(!afterList.body.some((row) => row.id === deliverOutboxId || row.id === dbOutboxId));

				const readToken = await createAppToken(alice, ['read:admin:queue']);
				const listedWithToken = await api('admin/queue/outbox-dead-letters', {}, { token: readToken });
				expect(listedWithToken.status).toBe(200);
				const writeScopeDenied = await api(
					'admin/queue/retry-outbox-dead-letter',
					{ outboxId: deliverOutboxId, revision: 4 },
					{ token: readToken },
				);
				expect(writeScopeDenied.status).toBe(403);
				expect(castAsError(writeScopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

				const writeToken = await createAppToken(alice, ['write:admin:queue']);
				const readScopeDenied = await api('admin/queue/outbox-dead-letters', {}, { token: writeToken });
				expect(readScopeDenied.status).toBe(403);
				expect(castAsError(readScopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

				const normalUser = await signup({ username: `honooutbox${now.toString(36)}` });
				const roleDenied = await api('admin/queue/outbox-dead-letters', {}, normalUser);
				expect(roleDenied.status).toBe(403);
				expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
				const roleDeniedWrite = await api(
					'admin/queue/abandon-outbox-dead-letter',
					{ outboxId: deliverOutboxId, revision: 4 },
					normalUser,
				);
				expect(roleDeniedWrite.status).toBe(403);
				expect(castAsError(roleDeniedWrite.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
			} finally {
				await deliverJob.remove().catch(() => undefined);
				await deliverQueue!
					.getJob(`outbox-${deliverOutboxId}`)
					.then((job) => job?.remove())
					.catch(() => undefined);
				await deleteQueueOutboxesByIds(db, [deliverOutboxId, dbOutboxId]);
			}
		});
	});

	describe('invite', () => {
		test('invite/limit keeps role policy, token scope, and remaining count semantics', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const inviter = await signup({ username: `honoinv${now.toString(36)}` });
			const deniedUser = await signup({ username: `honoinvdeny${now.toString(36)}` });
			const inviterRole = await createRoleInDatabase(db, {
				id: genId(now),
				updatedAt: new Date(now),
				lastUsedAt: new Date(now),
				name: `Hono invite role ${now}`,
				description: 'Hono invite role',
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
					canInvite: {
						useDefault: false,
						priority: 1,
						value: true,
					},
					inviteLimit: {
						useDefault: false,
						priority: 1,
						value: 2,
					},
					inviteLimitCycle: {
						useDefault: false,
						priority: 1,
						value: 60,
					},
				},
			});
			await createRoleAssignmentInDatabase(db, {
				id: genId(now + 1),
				userId: inviter.id,
				roleId: inviterRole.id,
				expiresAt: null,
			});
			await createRegistrationTicketInDatabase(db, {
				id: genId(now - 1000),
				code: `hono-invite-recent-${now}`,
				createdById: inviter.id,
			});
			await createRegistrationTicketInDatabase(db, {
				id: genId(now - 1000 * 60 * 120),
				code: `hono-invite-old-${now}`,
				createdById: inviter.id,
			});

			const allowed = await api('invite/limit', {}, inviter);
			expect(allowed.status).toBe(200);
			expect(allowed.body.remaining).toBe(1);

			const roleDenied = await api('invite/limit', {}, deniedUser);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
			expect(castAsError(roleDenied.body as any).error.id).toBe('c3d38592-54c0-429d-be96-5636b0431a61');

			const readAccountToken = await createAppToken(inviter, ['read:account']);
			const scopeDenied = await api('invite/limit', {}, { token: readAccountToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');
		});

		test('invite/create したコードを invite/list で取得でき、invite/delete で削除できる', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const inviterRole = await createRoleInDatabase(db, {
				id: genId(now + 10),
				updatedAt: new Date(now),
				lastUsedAt: new Date(now),
				name: `Invite role ${now}`,
				description: 'Invite role',
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
					canInvite: {
						priority: 0,
						useDefault: false,
						value: true,
					},
				},
			});
			await createRoleAssignmentInDatabase(db, {
				id: genId(now + 11),
				userId: bob.id,
				roleId: inviterRole.id,
				expiresAt: null,
			});
			await createRoleAssignmentInDatabase(db, {
				id: genId(now + 12),
				userId: carol.id,
				roleId: inviterRole.id,
				expiresAt: null,
			});

			const created = await api('invite/create', {}, bob);
			expect(created.status).toBe(200);
			expect(created.body.used).toBe(false);
			expect(created.body.usedAt).toBe(null);
			expect(created.body.createdBy?.id).toBe(bob.id);

			const limit = await api('invite/limit', {}, bob);
			expect(limit.status).toBe(200);
			expect(limit.body.remaining).toBe(null);

			const list = await api('invite/list', {}, bob);
			expect(list.status).toBe(200);
			assert.ok(list.body.some((ticket) => ticket.id === created.body.id));

			const deletedByStranger = await api('invite/delete', { inviteId: created.body.id }, carol);
			expect(deletedByStranger.status).toBe(400);
			expect(castAsError(deletedByStranger.body as any).error.code).toBe('ACCESS_DENIED');

			const deleted = await api('invite/delete', { inviteId: created.body.id }, bob);
			expect(deleted.status).toBe(204);

			const listAfterDelete = await api('invite/list', {}, bob);
			expect(listAfterDelete.status).toBe(200);
			assert.ok(!listAfterDelete.body.some((ticket) => ticket.id === created.body.id));
		});

		test('admin/invite/create したコードを admin/invite/list で取得できる', async () => {
			const expiresAt = new Date(Date.now() + 1000 * 60 * 60).toISOString();
			const created = await api('admin/invite/create', { count: 2, expiresAt }, alice);
			expect(created.status).toBe(200);
			expect(created.body.length).toBe(2);
			expect(getAt(created.body, 0).createdBy?.id).toBe(alice.id);
			expect(getAt(created.body, 0).used).toBe(false);
			expect(getAt(created.body, 0).usedAt).toBe(null);
			expect(getAt(created.body, 0).expiresAt).toBe(expiresAt);

			const list = await api('admin/invite/list', { type: 'unused' }, alice);
			expect(list.status).toBe(200);
			for (const ticket of created.body) {
				assert.ok(list.body.some((x) => x.id === ticket.id));
			}

			const invalidDate = await api('admin/invite/create', { expiresAt: 'invalid-date' }, alice);
			expect(invalidDate.status).toBe(400);
			expect(castAsError(invalidDate.body as any).error.code).toBe('INVALID_DATE_TIME');
			expect(castAsError(invalidDate.body as any).error.id).toBe('f1380b15-3760-4c6c-a1db-5c3aaf1cbd49');

			const readAdminInviteToken = await createAppToken(alice, ['read:admin:invite-codes']);
			const scopeDenied = await api('admin/invite/create', {}, { token: readAdminInviteToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `honoadmininv${Date.now().toString(36)}` });
			const moderatorDenied = await api('admin/invite/list', {}, normalUser);
			expect(moderatorDenied.status).toBe(403);
			expect(castAsError(moderatorDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

			let logged = false;
			for (let i = 0; i < 10; i++) {
				const logs = await listModerationLogsFromDatabase(db, {
					limit: 10,
					order: 'desc',
					type: 'createInvitation',
					userId: alice.id,
				});
				logged = logs.some((log) => {
					const info = log.info as { invitations?: { id?: string }[] };
					return info.invitations?.some((ticket) => ticket.id === getAt(created.body, 0).id) === true;
				});
				if (logged) break;
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
			assert.ok(logged);
		});
	});

	describe('admin/show-moderation-logs', () => {
		test('admin/show-moderation-logs は検索、ユーザー pack、権限を維持する', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const marker = `hono moderation log ${now}`;
			const id = genId(now);
			await createModerationLogInDatabase(db, {
				id,
				userId: alice.id,
				type: 'updateUserNote',
				info: {
					userId: bob.id,
					before: '',
					after: marker,
				},
			});

			const list = await api(
				'admin/show-moderation-logs',
				{
					type: 'updateUserNote',
					userId: alice.id,
					search: marker,
				},
				alice,
			);
			expect(list.status).toBe(200);
			expect(list.body.length).toBe(1);
			expect(getAt(list.body, 0).id).toBe(id);
			expect(getAt(list.body, 0).createdAt).toBe(new Date(now).toISOString());
			expect(getAt(list.body, 0).type).toBe('updateUserNote');
			expect(getAt(list.body, 0).info['after']).toBe(marker);
			expect(getAt(list.body, 0).userId).toBe(alice.id);
			expect(getAt(list.body, 0).user.id).toBe(alice.id);
			expect(getAt(list.body, 0).user.username).toBe(alice.username);

			const scopeDeniedToken = await createAppToken(alice, ['read:admin:server-info']);
			const scopeDenied = await api('admin/show-moderation-logs', {}, { token: scopeDeniedToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `honomodlog${now.toString(36)}` });
			const adminDenied = await api('admin/show-moderation-logs', {}, normalUser);
			expect(adminDenied.status).toBe(403);
			expect(castAsError(adminDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
		});
	});

	describe('admin/captcha', () => {
		test('admin/captcha/current と admin/captcha/save は設定取得、保存、scope、権限を維持する', async () => {
			const initial = await api('admin/captcha/current', {}, alice);
			expect(initial.status).toBe(200);
			expect(typeof initial.body.provider).toBe('string');
			assert.ok(initial.body.hcaptcha);
			assert.ok(initial.body.mcaptcha);
			assert.ok(initial.body.recaptcha);
			assert.ok(initial.body.turnstile);

			try {
				const invalid = await api(
					'admin/captcha/save',
					{
						provider: 'testcaptcha',
					},
					alice,
				);
				expect(invalid.status).toBe(400);
				expect(castAsError(invalid.body as any).error.code).toBe('INVALID_PARAMETERS');
				expect(castAsError(invalid.body as any).error.message).toBe('Invalid parameters.');

				const saved = await api(
					'admin/captcha/save',
					{
						provider: 'testcaptcha',
						captchaResult: 'testcaptcha-passed',
					},
					alice,
				);
				expect(saved.status).toBe(204);

				const current = await api('admin/captcha/current', {}, alice);
				expect(current.status).toBe(200);
				expect(current.body.provider).toBe('testcaptcha');
			} finally {
				await api('admin/captcha/save', { provider: 'none' }, alice);
			}

			const readToken = await createAppToken(alice, ['read:admin:meta']);
			const scopeDenied = await api('admin/captcha/save', { provider: 'none' }, { token: readToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `honocaptcha${Date.now().toString(36)}` });
			const roleDenied = await api('admin/captcha/current', {}, normalUser);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
		});
	});

	describe('admin/announcements', () => {
		test('admin/announcements は作成、一覧、更新、削除、scope、権限、ログを維持する', async () => {
			const now = Date.now();
			const title = `hono-announcement-${now}`;
			const created = await api(
				'admin/announcements/create',
				{
					title,
					text: 'announcement body',
					imageUrl: null,
					icon: 'info',
					display: 'normal',
					forExistingUsers: false,
					silence: false,
					needConfirmationToRead: true,
				},
				alice,
			);
			expect(created.status).toBe(200);
			expect(created.body.title).toBe(title);
			expect(created.body.imageUrl).toBe(null);
			expect((created.body as any).needConfirmationToRead).toBe(true);

			const list = await api('admin/announcements/list', { limit: 20, status: 'active' }, alice);
			expect(list.status).toBe(200);
			const listed = list.body.find((announcement) => announcement.id === created.body.id);
			assert.ok(listed);
			expect(listed.title).toBe(title);
			expect(listed.reads).toBe(0);
			expect(listed.isActive).toBe(true);

			const updated = await api(
				'admin/announcements/update',
				{
					id: created.body.id,
					title: `${title}-updated`,
					text: 'updated body',
					imageUrl: '',
					isActive: false,
				},
				alice,
			);
			expect(updated.status).toBe(204);

			const updatedList = await api('admin/announcements/list', { limit: 20, status: 'all' }, alice);
			expect(updatedList.status).toBe(200);
			const updatedAnnouncement = updatedList.body.find((announcement) => announcement.id === created.body.id);
			assert.ok(updatedAnnouncement);
			expect(updatedAnnouncement.title).toBe(`${title}-updated`);
			expect(updatedAnnouncement.text).toBe('updated body');
			expect(updatedAnnouncement.imageUrl).toBe(null);
			expect(updatedAnnouncement.isActive).toBe(false);

			const noSuch = await api(
				'admin/announcements/update',
				{
					id: '0000000000000000',
					title: 'missing',
				},
				alice,
			);
			expect(noSuch.status).toBe(400);
			expect(castAsError(noSuch.body as any).error.code).toBe('NO_SUCH_ANNOUNCEMENT');

			const readToken = await createAppToken(alice, ['read:admin:announcements']);
			const scopeDenied = await api(
				'admin/announcements/create',
				{
					title,
					text: 'announcement body',
					imageUrl: null,
				},
				{ token: readToken },
			);
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `honoannounce${now.toString(36)}` });
			const roleDenied = await api('admin/announcements/list', {}, normalUser);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

			const deleted = await api('admin/announcements/delete', { id: created.body.id }, alice);
			expect(deleted.status).toBe(204);

			const afterDelete = await api('admin/announcements/list', { limit: 20, status: 'all' }, alice);
			expect(afterDelete.status).toBe(200);
			assert.ok(!afterDelete.body.some((announcement) => announcement.id === created.body.id));

			const logTypes = ['createGlobalAnnouncement', 'updateGlobalAnnouncement', 'deleteGlobalAnnouncement'] as const;
			const logged = new Set<string>();
			for (let i = 0; i < 10; i++) {
				for (const type of logTypes) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: created.body.id,
					});
					if (logs.length > 0) logged.add(type);
				}
				if (logged.size === logTypes.length) break;
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			expect([...logged].sort()).toStrictEqual([...logTypes].sort());
		});
	});

	describe('admin/avatar-decorations', () => {
		test('admin/avatar-decorations は作成、一覧、更新、削除、scope、ポリシー、ログを維持する', async () => {
			const now = Date.now();
			const manager = await signup({ username: `honoavmgr${now.toString(36)}` });
			const config = fixtureConfig;
			const managerRole = await createRoleInDatabase(db, {
				id: genId(now),
				updatedAt: new Date(now),
				lastUsedAt: new Date(now),
				name: `avatar manager ${now}`,
				description: 'Hono avatar decoration admin role',
				color: null,
				iconUrl: null,
				target: 'manual',
				condFormula: {
					id: '7b29574c-ae8b-42b5-8127-3496ac6ea20c',
					type: 'isRemote',
				},
				isPublic: false,
				isAdministrator: false,
				isModerator: false,
				isExplorable: false,
				asBadge: false,
				preserveAssignmentOnMoveAccount: false,
				canEditMembersByModerator: false,
				displayOrder: 0,
				policies: {
					canManageAvatarDecorations: { useDefault: false, priority: 0, value: true },
				},
			});
			await createRoleAssignmentInDatabase(db, {
				id: genId(now + 1),
				userId: manager.id,
				roleId: managerRole.id,
				expiresAt: null,
			});

			const created = await api(
				'admin/avatar-decorations/create',
				{
					name: `hono-avatar-${now}`,
					description: 'avatar decoration body',
					url: 'https://example.test/avatar-decoration.png',
					roleIdsThatCanBeUsedThisDecoration: [managerRole.id],
					category: 'hono',
				},
				manager,
			);
			expect(created.status).toBe(200);
			expect(created.body.name).toBe(`hono-avatar-${now}`);
			expect(created.body.category).toBe('hono');
			expect(created.body.roleIdsThatCanBeUsedThisDecoration).toStrictEqual([managerRole.id]);

			const list = await api('admin/avatar-decorations/list', {}, manager);
			expect(list.status).toBe(200);
			assert.ok(list.body.some((decoration) => decoration.id === created.body.id));

			const updated = await api(
				'admin/avatar-decorations/update',
				{
					id: created.body.id,
					name: `hono-avatar-${now}-updated`,
					description: 'updated body',
					category: null,
				},
				manager,
			);
			expect(updated.status).toBe(204);

			const updatedList = await api('admin/avatar-decorations/list', {}, manager);
			expect(updatedList.status).toBe(200);
			const updatedDecoration = updatedList.body.find((decoration) => decoration.id === created.body.id);
			assert.ok(updatedDecoration);
			expect(updatedDecoration.name).toBe(`hono-avatar-${now}-updated`);
			expect(updatedDecoration.description).toBe('updated body');
			expect(updatedDecoration.category).toBe(null);

			const readToken = await createAppToken(manager, ['read:admin:avatar-decorations']);
			const scopeDenied = await api(
				'admin/avatar-decorations/create',
				{
					name: `hono-avatar-${now}-denied`,
					description: 'avatar decoration body',
					url: 'https://example.test/avatar-decoration.png',
				},
				{ token: readToken },
			);
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const policyDeniedUser = await signup({ username: `honoavden${now.toString(36)}` });
			const policyDenied = await api('admin/avatar-decorations/list', {}, policyDeniedUser);
			expect(policyDenied.status).toBe(403);
			expect(castAsError(policyDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

			const deleted = await api('admin/avatar-decorations/delete', { id: created.body.id }, manager);
			expect(deleted.status).toBe(204);

			const afterDelete = await api('admin/avatar-decorations/list', {}, manager);
			expect(afterDelete.status).toBe(200);
			assert.ok(!afterDelete.body.some((decoration) => decoration.id === created.body.id));

			const logTypes = ['createAvatarDecoration', 'updateAvatarDecoration', 'deleteAvatarDecoration'] as const;
			const logged = new Set<string>();
			for (let i = 0; i < 10; i++) {
				for (const type of logTypes) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: created.body.id,
					});
					if (logs.length > 0) logged.add(type);
				}
				if (logged.size === logTypes.length) break;
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			expect([...logged].sort()).toStrictEqual([...logTypes].sort());
		});
	});

	describe('admin/ad', () => {
		test('admin/ad は作成、一覧、更新、削除、scope、権限、ログを維持する', async () => {
			const now = Date.now();
			const createPayload = {
				url: 'https://example.test/ad',
				memo: `hono-ad-${now}`,
				place: 'square',
				priority: 'middle',
				ratio: 1,
				expiresAt: now + 1000 * 60 * 60,
				startsAt: now - 1000 * 60,
				imageUrl: 'https://example.test/ad.png',
				dayOfWeek: 0,
				isSensitive: true,
			};

			const created = await api('admin/ad/create', createPayload, alice);
			expect(created.status).toBe(200);
			expect(created.body.memo).toBe(createPayload.memo);
			expect(created.body.isSensitive).toBe(true);

			const list = await api('admin/ad/list', { limit: 20 }, alice);
			expect(list.status).toBe(200);
			assert.ok(list.body.some((ad) => ad.id === created.body.id));

			const updated = await api(
				'admin/ad/update',
				{
					id: created.body.id,
					memo: `${createPayload.memo}-updated`,
					ratio: 3,
					isSensitive: false,
				},
				alice,
			);
			expect(updated.status).toBe(204);

			const updatedList = await api('admin/ad/list', { limit: 20 }, alice);
			expect(updatedList.status).toBe(200);
			const updatedAd = updatedList.body.find((ad) => ad.id === created.body.id);
			assert.ok(updatedAd);
			expect(updatedAd.memo).toBe(`${createPayload.memo}-updated`);
			expect(updatedAd.ratio).toBe(3);
			expect(updatedAd.isSensitive).toBe(false);

			const noSuch = await api(
				'admin/ad/update',
				{
					id: '0000000000000000',
					memo: 'missing',
				},
				alice,
			);
			expect(noSuch.status).toBe(400);
			expect(castAsError(noSuch.body as any).error.code).toBe('NO_SUCH_AD');

			const readToken = await createAppToken(alice, ['read:admin:ad']);
			const scopeDenied = await api('admin/ad/create', createPayload, { token: readToken });
			expect(scopeDenied.status).toBe(403);
			expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `honoad${now.toString(36)}` });
			const roleDenied = await api('admin/ad/list', {}, normalUser);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

			const deleted = await api('admin/ad/delete', { id: created.body.id }, alice);
			expect(deleted.status).toBe(204);

			const afterDelete = await api('admin/ad/list', { limit: 20 }, alice);
			expect(afterDelete.status).toBe(200);
			assert.ok(!afterDelete.body.some((ad) => ad.id === created.body.id));

			const logTypes = ['createAd', 'updateAd', 'deleteAd'] as const;
			const logged = new Set<string>();
			for (let i = 0; i < 10; i++) {
				for (const type of logTypes) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: created.body.id,
					});
					if (logs.length > 0) logged.add(type);
				}
				if (logged.size === logTypes.length) break;
				await new Promise((resolve) => setTimeout(resolve, 100));
			}

			expect([...logged].sort()).toStrictEqual([...logTypes].sort());
		});
	});

	describe('admin database stats', () => {
		test('admin/get-index-stats と admin/get-table-stats はDB統計を返し、scopeを維持する', async () => {
			const indexes = await api('admin/get-index-stats', {}, alice);
			expect(indexes.status).toBe(200);
			assert.ok(Array.isArray(indexes.body));
			assert.ok(indexes.body.some((row) => typeof row.tablename === 'string' && typeof row.indexname === 'string'));

			const tables = await api('admin/get-table-stats', {}, alice);
			expect(tables.status).toBe(200);
			assert.ok(Object.keys(tables.body).length > 0);
			assert.ok(
				Object.values(tables.body).some((row) => typeof row.count === 'number' && typeof row.size === 'number'),
			);

			const indexToken = await createAppToken(alice, ['read:admin:index-stats']);
			const tableScopeDenied = await api('admin/get-table-stats', {}, { token: indexToken });
			expect(tableScopeDenied.status).toBe(403);
			expect(castAsError(tableScopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

			const normalUser = await signup({ username: `honostats${Date.now().toString(36)}` });
			const roleDenied = await api('admin/get-table-stats', {}, normalUser);
			expect(roleDenied.status).toBe(403);
			expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
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
			await new Promise((resolve) => setTimeout(resolve, 100));

			const res = await api('i/notifications', { includeTypes: ['follow'] }, followee);

			expect(res.status).toBe(200);
			expect(res.body.length).toBe(1);
			expect(getAt(res.body, 0).type).toBe('follow');
		});

		test('excludeTypesで指定したtypeの通知が除外される', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const followee = await signup({ username: `hnnexe${suffix}` });
			const follower = await signup({ username: `hnnexr${suffix}` });
			await api('following/create', { userId: followee.id }, follower);
			await new Promise((resolve) => setTimeout(resolve, 100));

			const res = await api('i/notifications', { excludeTypes: ['follow'] }, followee);

			expect(res.status).toBe(200);
			expect(res.body.length).toBe(0);
		});

		test('includeTypesが空配列の場合、空配列が返る', async () => {
			const suffix = Date.now().toString(36).slice(-8);
			const followee = await signup({ username: `hnniee${suffix}` });
			const follower = await signup({ username: `hnnier${suffix}` });
			await api('following/create', { userId: followee.id }, follower);
			await new Promise((resolve) => setTimeout(resolve, 100));

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
			await new Promise((resolve) => setTimeout(resolve, 100));

			const res = await api('i/notifications-grouped', {}, author);

			expect(res.status).toBe(200);
			const grouped = res.body.filter((n: any) => n.type === 'reaction:grouped') as any[];
			expect(grouped.length).toBe(1);
			expect(grouped[0].reactions.length).toBe(2);
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
			await new Promise((resolve) => setTimeout(resolve, 300));

			const res = await api('i/notifications-grouped', {}, author);

			expect(res.status).toBe(200);
			const grouped = res.body.filter((n: any) => n.type === 'renote:grouped') as any[];
			expect(grouped.length).toBe(1);
			expect(grouped[0].users.length).toBe(2);
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
			expect((followedList.body as any[])
					.filter((channel) => channel.id === followed.id)
					.map((channel) => channel.isFollowing)).toStrictEqual([true]);

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
			expect(castAsError(res.body as unknown as Record<string, unknown>).error.id).toBe('12e7caa8-224f-471d-978a-653a81cf4c90');
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

	describe('URL preview', () => {
		test('Error from summaly becomes HTTP 422', async () => {
			const res = await simpleGet('/url?url=https://e:xample.com');
			expect(res.status).toBe(422);
			expect(res.body.error.code).toBe('URL_PREVIEW_FAILED');
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
