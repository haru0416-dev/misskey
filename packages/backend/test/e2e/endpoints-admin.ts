/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash, randomUUID } from 'node:crypto';
import * as assert from 'assert';
import * as Bull from 'bullmq';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { parseId } from '@/misc/id/parse-id.js';
import type { DbQueue } from '@/core/queue/queues.js';
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

const bunPassword = Bun!.password;

describe('Endpoints', () => {
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let carol: misskey.entities.SignupResponse;
	let db: TestDatabase;
	let dbQueue: Bull.Queue<DbJobData<'importCustomEmojis' | 'deleteAccount'>> | undefined;
	let deliverQueue: Bull.Queue<DeliverJobData> | undefined;
	let inboxQueue: Bull.Queue<InboxJobData> | undefined;
	let relationshipQueue: Bull.Queue<RelationshipJobData> | undefined;
	let objectStorageQueue: Bull.Queue<ObjectStorageJobData> | undefined;
	let systemWebhookDeliverQueue: Bull.Queue<SystemWebhookDeliverJobData> | undefined;
	let context: EndpointsContext;

	beforeAll(async () => {
		context = await createEndpointsContext();
		({ alice, bob, carol, db, dbQueue, deliverQueue, inboxQueue, relationshipQueue, objectStorageQueue, systemWebhookDeliverQueue } = context);
	}, 1000 * 60 * 2);

	afterAll(async () => {
		await context.close();
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
				return await vi.waitFor(async () => {
					// outbox のディスパッチャはジョブキュー側プロセスの担当で e2e のサーバーでは動いていないため、
					// 配送待ちを挟むコーディネータ経由の発行を進めるにはテスト側から回す必要がある
					await dispatchQueueOutbox(db, dbQueue as unknown as DbQueue, deliverQueue!);
					const jobs = await getDeleteAccountJobs(userId);
					assert.ok(jobs[0], `deleteAccount job was not found for ${userId}`);
					return jobs[0];
				}, POLL);
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
			await vi.waitFor(async () => {
				const jobs = await objectStorageQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
				job = jobs.find((job) => job.name === 'cleanRemoteFiles');
				expect(job).toBeDefined();
			}, POLL);
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
				await vi.waitFor(async () => {
					expect(await fetchDriveFileByIdFromDatabase(db, fileId), `drive file was not deleted: ${fileId}`).toBeNull();
				}, POLL);
			};
			const waitDeleteObjectStorageJob = async (key: string) => {
				return await vi.waitFor(async () => {
					const jobs = await objectStorageQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
					const job = jobs.find((job) => job.name === 'deleteFile' && (job.data as { key: string }).key === key);
					assert.ok(job, `deleteFile objectStorage job was not found: ${key}`);
					return job;
				}, POLL);
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
				await vi.waitFor(async () => {
					const entries = await redis.xrevrange(`notificationTimeline:${assignTarget.id}`, '+', '-', 'COUNT', 10);
					const notifications = entries.map(([, values]) => {
						const dataIndex = values.findIndex((value) => value === 'data');
						return JSON.parse(values[dataIndex + 1]!) as { type?: string; roleId?: string };
					});
					const roleAssignedNotification = notifications.find(
						(notification) => notification.type === 'roleAssigned' && notification.roleId === assignableRole.body.id,
					);
					assert.ok(roleAssignedNotification);
				}, POLL);
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
			expect(await fetchRoleAssignmentByUserIdAndRoleIdFromDatabase(db, assignTarget.id, assignableRole.body.id)).toBe(
				null,
			);

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
			await vi.waitFor(async () => {
				for (const type of assignmentLogTypes) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: assignableRole.body.id,
					});
					if (logs.length > 0) assignmentLogged.add(type);
				}
				expect(assignmentLogged.size).toBe(assignmentLogTypes.length);
			}, POLL);

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
			await vi.waitFor(async () => {
				for (const type of logTypes) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: created.body.id,
					});
					if (logs.length > 0) logged.add(type);
				}
				expect(logged.size).toBe(logTypes.length);
			}, POLL);

			expect([...logged].sort()).toStrictEqual([...logTypes].sort());
		});
	});


	describe('admin/system-webhook', () => {
		async function findSystemWebhookDeliverJob(
			webhookId: string,
			type: SystemWebhookDeliverJobData['type'],
			url: string,
		): Promise<Bull.Job<SystemWebhookDeliverJobData>> {
			return await vi.waitFor(async () => {
				const jobs = await systemWebhookDeliverQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
				const job = jobs.find(
					(job) =>
						job.name === webhookId && job.data.webhookId === webhookId && job.data.type === type && job.data.to === url,
				);
				assert.ok(job, `system webhook deliver job was not found: ${webhookId}`);
				return job;
			}, POLL);
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
			await vi.waitFor(async () => {
				for (const type of logTypes) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: created.body.id,
					});
					if (logs.length > 0) logged.add(type);
				}
				expect(logged.size).toBe(logTypes.length);
			}, POLL);

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
			await vi.waitFor(async () => {
				for (const type of logTypes) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: createdWebhookRecipient.body.id,
					});
					if (logs.length > 0) logged.add(type);
				}
				expect(logged.size).toBe(logTypes.length);
			}, POLL);

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
			return await vi.waitFor(async () => {
				const jobs = await systemWebhookDeliverQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
				const job = jobs.find(
					(job) => job.name === webhookId && job.data.webhookId === webhookId && job.data.type === type,
				);
				assert.ok(job, `system webhook deliver job was not found: ${webhookId}`);
				return job;
			}, POLL);
		}

		async function findDeliverJob(inbox: string, type: 'Flag'): Promise<Bull.Job<DeliverJobData>> {
			return await vi.waitFor(async () => {
				const jobs = await deliverQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
				const found = jobs.find(
					(job) => job.data.to === inbox && (JSON.parse(job.data.content) as { type?: unknown }).type === type,
				);
				assert.ok(found, `deliver job was not found: ${inbox} ${type}`);
				return found;
			}, POLL);
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
			// 先頭3件で見ると、直前に別のテストが作った通報が窓に入るかどうかで結果が変わる。
			// この検査の主張は「自分の作った3件がこの順で並ぶこと」なので、その3件だけを取り出す。
			const createdIds = [unresolved.id, resolved.id, remoteReporter.id];
			expect(listedReports.filter((report) => createdIds.includes(report.id)).map((report) => report.id)).toStrictEqual(
				createdIds,
			);
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

			await vi.waitFor(async () => {
				const logs = await listModerationLogsFromDatabase(db, {
					limit: 10,
					order: 'desc',
					type: 'resolveAbuseReport',
					search: report.id,
				});
				expect(logs.length).toBeGreaterThan(0);
				expect(
					logs.some((log) => (log.info as any).reportId === report.id && (log.info as any).resolvedAs === 'accept'),
				).toBe(true);
			}, POLL);
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
			expect(deliverJob.data.digest).toBe(
				`SHA-256=${createHash('sha256').update(deliverJob.data.content).digest('base64')}`,
			);
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

			await vi.waitFor(async () => {
				const logs = await listModerationLogsFromDatabase(db, {
					limit: 10,
					order: 'desc',
					type: 'forwardAbuseReport',
					search: report.id,
				});
				expect(logs.length).toBeGreaterThan(0);
				expect(logs.some((log) => (log.info as any).reportId === report.id)).toBe(true);
			}, POLL);
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

			await vi.waitFor(async () => {
				const logs = await listModerationLogsFromDatabase(db, {
					limit: 10,
					order: 'desc',
					type: 'updateAbuseReportNote',
					search: report.id,
				});
				expect(logs.length).toBeGreaterThan(0);
				expect(
					logs.some(
						(log) =>
							(log.info as any).reportId === report.id &&
							(log.info as any).before === report.moderationNote &&
							(log.info as any).after === moderationNote,
					),
				).toBe(true);
			}, POLL);
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
			await vi.waitFor(async () => {
				for (const type of logTypes) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: target.id,
					});
					if (logs.length > 0) logged.add(type);
				}
				expect(logged.size).toBe(logTypes.length);
			}, POLL);

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

			await vi.waitFor(async () => {
				const logs = await listModerationLogsFromDatabase(db, {
					limit: 10,
					order: 'desc',
					type: 'updateUserNote',
					search: target.id,
				});
				expect(logs.length).toBeGreaterThan(0);
				expect(logs.some((log) => (log.info as any).before === 'before note' && (log.info as any).after === text)).toBe(
					true,
				);
			}, POLL);
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

			await vi.waitFor(async () => {
				const jobs = await relationshipQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
				const job = jobs.find(
					(job) =>
						job.name === 'unfollow' &&
						job.data.from.id === following.followerId &&
						job.data.to.id === following.followeeId &&
						job.data.silent === true,
				);
				assert.ok(job, 'suspend-user unfollow job was not created');
				await job.remove();
			}, POLL);

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
			await vi.waitFor(async () => {
				for (const type of ['suspend', 'unsuspend'] as const) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: target.id,
					});
					if (logs.length > 0) logged.add(type);
				}
				expect(logged.size).toBe(2);
			}, POLL);

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
			return await vi.waitFor(async () => {
				const jobs = await deliverQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
				const found = jobs.find(
					(job) => job.data.to === inbox && (JSON.parse(job.data.content) as { type?: unknown }).type === type,
				);
				assert.ok(found, `deliver job was not found: ${inbox} ${type}`);
				return found;
			}, POLL);
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
			expect(
				listed.body
					.filter((relay) => expected.some((expectedRelay) => expectedRelay.id === relay.id))
					.sort((a, b) => a.id.localeCompare(b.id)),
			).toStrictEqual(expected);

			const readToken = await createAppToken(alice, ['read:admin:relays']);
			const listedWithApp = await api('admin/relays/list', {}, { token: readToken });
			expect(listedWithApp.status).toBe(200);
			expect(
				listedWithApp.body
					.filter((relay) => expected.some((expectedRelay) => expectedRelay.id === relay.id))
					.sort((a, b) => a.id.localeCompare(b.id)),
			).toStrictEqual(expected);

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
			expect(followJob.data.digest).toBe(
				`SHA-256=${createHash('sha256').update(followJob.data.content).digest('base64')}`,
			);

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
			await vi.waitFor(async () => {
				const logs = await listModerationLogsFromDatabase(db, {
					limit: 20,
					order: 'desc',
					type,
					userId: alice.id,
				});
				expect(logs.length, `moderation log was not found: ${type}`).toBeGreaterThan(0);
			}, POLL);
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
			await vi.waitFor(async () => {
				for (const type of logTypes) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: created.body.id,
					});
					if (logs.length > 0) logged.add(type);
				}
				expect(logged.size).toBe(logTypes.length);
			}, POLL);

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
			await vi.waitFor(async () => {
				for (const type of logTypes) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: created.body.id,
					});
					if (logs.length > 0) logged.add(type);
				}
				expect(logged.size).toBe(logTypes.length);
			}, POLL);

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
			await vi.waitFor(async () => {
				for (const type of logTypes) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: created.body.id,
					});
					if (logs.length > 0) logged.add(type);
				}
				expect(logged.size).toBe(logTypes.length);
			}, POLL);

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

});
