/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert';
import { randomUUID } from 'node:crypto';
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
	updateChannelInDatabase,
	updateDriveFileInDatabase,
	updateUserInDatabase,
	updateUserProfileInDatabase,
	userListFavoriteExistsInDatabase,
	userListMembershipExistsInDatabase,
} from '../fixtures.js';
import type { TestDatabase } from '../fixtures.js';
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
import type { UserToken } from '../utils.js';
import type * as misskey from 'misskey-js';
import { createEndpointsContext, getAt } from '../endpoints-context.js';
import type { EndpointsContext } from '../endpoints-context.js';

// 判別可能ユニオンの分岐を確定させる箇所だけ node:assert を使う。expect の matcher は `asserts` 述語を持たず、
// 判別子を検査しても後続のプロパティアクセスが型エラーになる。

const bunPassword = Bun!.password;

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
			expect(results.filter((result) => result.status === 200)).toHaveLength(1);
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
			expect(results.filter((result) => result.status === 200)).toHaveLength(1);
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
			await expect(
				createLocalSignupAccount(db, staleMeta, {
					username: requiredUsername,
					host: null,
					passwordHash: null,
					rootClaim: 'required',
				}),
			).rejects.toSatisfy((error) => error instanceof RootUserAlreadyAssignedError);
			expect(await fetchLocalUserByUsernameFromDatabase(db, requiredUsername)).toBeNull();

			const result = await createLocalSignupAccount(db, staleMeta, {
				username: `staleroot${suffix}`,
				host: null,
				passwordHash: null,
			});

			expect(result.account.username).toBe(`staleroot${suffix}`);
			expect((await fetchMetaFromDatabase(db)).rootUserId).toBe(before.rootUserId);

			await expect(
				createLocalSignupAccount(db, staleMeta, {
					username: 'admin',
					host: null,
					passwordHash: null,
				}),
			).rejects.toMatchObject({ code: 'USED_USERNAME' });
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
			assert.ok(newerIndex !== -1);
			assert.ok(olderIndex !== -1);
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
			expect(missing.body).toBeNull();

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
			expect(unregistered.body).toBeNull();

			const afterUnregister = await api('sw/show-registration', { endpoint }, alice);
			expect(afterUnregister.status).toBe(200);
			expect(afterUnregister.body).toBeNull();
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
			expect(afterAnonymousUnregister.body).toBeNull();
		});
	});

	describe('request-reset-password endpoint', () => {
		test('request-reset-password silently accepts unknown users and validates params', async () => {
			const accepted = await api('request-reset-password', {
				username: 'missing_reset_user',
				email: 'missing-reset-user@example.test',
			});
			expect(accepted.status).toBe(204);
			expect(accepted.body).toBeNull();

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
			expect(reset.body).toBeNull();

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
			expect(verified.body).toBeNull();

			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, dave.id);
			expect(profile.emailVerified).toBe(true);
			expect(profile.emailVerifyCode).toBeNull();

			const missing = await api('verify-email', { code: 'missing-code' });
			expect(missing.status).toBe(400);
			expect(castAsError(missing.body as any).error.code).toBe('NO_SUCH_CODE');
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

	describe('access tokens', () => {
		async function issueToken(user: UserToken, name: string): Promise<string> {
			const issued = await api(
				'miauth/gen-token',
				{ session: randomUUID(), name, description: `${name} description`, permission: ['read:account'] },
				user,
			);
			expect(issued.status).toBe(200);
			return issued.body.token;
		}

		test('i/apps で MiAuth のトークンを一覧し、i/revoke-token で自分のトークンだけを取り消せる', async () => {
			const suffix = Date.now().toString(36);
			const byTokenName = `revoke by token ${suffix}`;
			const byIdName = `revoke by id ${suffix}`;
			const byToken = await issueToken(alice, byTokenName);
			await issueToken(alice, byIdName);
			const bobToken = await issueToken(bob, `bob ${suffix}`);

			const list = await api('i/apps', { sort: '-createdAt' }, alice);
			expect(list.status).toBe(200);
			const tokenItem = list.body.find((item) => item.name === byTokenName);
			const idItem = list.body.find((item) => item.name === byIdName);
			assert.ok(tokenItem);
			assert.ok(idItem);
			expect(tokenItem.permission).toStrictEqual(['read:account']);
			expect(tokenItem.description).toBe(`${byTokenName} description`);
			expect(typeof tokenItem.createdAt).toBe('string');

			const denied = await api('i/apps', {}, { token: byToken });
			expect(denied.status).toBe(400);
			expect(castAsError(denied.body as any).error.code).toBe('ACCESS_DENIED');

			const revokedByToken = await api('i/revoke-token', { token: byToken }, alice);
			expect(revokedByToken.status).toBe(204);
			const revokedCredential = await api('i', {}, { token: byToken });
			expect(revokedCredential.status).toBe(401);
			expect(castAsError(revokedCredential.body as any).error.code).toBe('AUTHENTICATION_FAILED');

			const bobList = await api('i/apps', {}, bob);
			const bobItem = bobList.body.find((item) => item.name === `bob ${suffix}`);
			assert.ok(bobItem);
			// 他人のトークンは ID を知っていても取り消せない。
			expect((await api('i/revoke-token', { tokenId: bobItem.id }, alice)).status).toBe(204);
			expect((await api('i', {}, { token: bobToken })).status).toBe(200);

			expect((await api('i/revoke-token', { tokenId: idItem.id }, alice)).status).toBe(204);
			const afterRevoke = await api('i/apps', {}, alice);
			expect(afterRevoke.body.some((item) => item.name === byIdName || item.name === byTokenName)).toBe(false);
		});

		test('アプリのトークンからは、そのトークン自身だけを i/revoke-token で失効できる', async () => {
			const suffix = Date.now().toString(36);
			const appToken = await issueToken(alice, `app self ${suffix}`);
			const otherToken = await issueToken(alice, `app other ${suffix}`);
			const list = await api('i/apps', { sort: '-createdAt' }, alice);
			const otherItem = list.body.find((item) => item.name === `app other ${suffix}`);
			assert.ok(otherItem);

			const deniedById = await api('i/revoke-token', { tokenId: otherItem.id }, { token: appToken });
			expect(deniedById.status).toBe(403);
			expect(castAsError(deniedById.body as any).error.code).toBe('PERMISSION_DENIED');
			const deniedByToken = await api('i/revoke-token', { token: otherToken }, { token: appToken });
			expect(deniedByToken.status).toBe(403);
			expect((await api('i', {}, { token: otherToken })).status).toBe(200);

			expect((await api('i/revoke-token', { token: appToken }, { token: appToken })).status).toBe(204);
			expect((await api('i', {}, { token: appToken })).status).toBe(401);
			expect((await api('i', {}, { token: otherToken })).status).toBe(200);

			await api('i/revoke-token', { token: otherToken }, alice);
		});

		test('旧 3-legged 認可のエンドポイントは廃止されている', async () => {
			for (const endpoint of [
				'app/create',
				'app/show',
				'my/apps',
				'auth/session/generate',
				'auth/accept',
				'i/authorized-apps',
			]) {
				const res = await (api as (endpoint: string, params: object, user?: UserToken) => Promise<{ status: number }>)(
					endpoint,
					{},
					alice,
				);
				expect(res.status, endpoint).toBe(404);
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
				name: `invite role ${now}`,
				description: 'invite role',
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
			expect(created.body.usedAt).toBeNull();
			expect(created.body.createdBy?.id).toBe(bob.id);

			const limit = await api('invite/limit', {}, bob);
			expect(limit.status).toBe(200);
			expect(limit.body.remaining).toBeNull();

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
			expect(created.body).toHaveLength(2);
			expect(getAt(created.body, 0).createdBy?.id).toBe(alice.id);
			expect(getAt(created.body, 0).used).toBe(false);
			expect(getAt(created.body, 0).usedAt).toBeNull();
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
			await vi.waitFor(async () => {
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
				expect(logged).toBe(true);
			}, POLL);
			assert.ok(logged);
		});
	});
});
