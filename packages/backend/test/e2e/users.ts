/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env['NODE_ENV'] = 'test';

import * as assert from 'assert';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { inspect } from 'node:util';
import {
	DEFAULT_POLICIES,
	createUserWithProfileAndPublickeyInDatabase,
	genId,
	openTestDatabase,
	type TestDatabase,
} from '../fixtures.js';
import { api, post, role, signup, successfulApiCall, testPaginationConsistency, uploadFile } from '../utils.js';
import type * as misskey from 'misskey-js';
import { omitUndefined as stripUndefined } from '@/misc/clone.js';

describe('ユーザー', () => {
	// エンティティとしてのユーザーを主眼においたテストを記述する
	// (Userを返すエンドポイントとUserエンティティを書き換えるエンドポイントをテストする)

	const show = async (id: string, me = root): Promise<misskey.entities.UserDetailed> => {
		return successfulApiCall({ endpoint: 'users/show', parameters: { userId: id }, user: me });
	};

	// UserLiteのキーが過不足なく入っている？
	const userLite = (user: misskey.entities.UserLite): Partial<misskey.entities.UserLite> => {
		return stripUndefined({
			id: user.id,
			name: user.name,
			username: user.username,
			host: user.host,
			avatarUrl: user.avatarUrl,
			avatarBlurhash: user.avatarBlurhash,
			avatarDecorations: user.avatarDecorations,
			isBot: user.isBot,
			isCat: user.isCat,
			instance: user.instance,
			emojis: user.emojis,
			onlineStatus: user.onlineStatus,
			badgeRoles: user.badgeRoles,

			// BUG isAdmin/isModeratorはUserLiteではなくMeDetailedOnlyに含まれる。
			isAdmin: undefined,
			isModerator: undefined,
		});
	};

	// UserDetailedNotMeのキーが過不足なく入っている？
	const userDetailedNotMe = (user: misskey.entities.SignupResponse): Partial<misskey.entities.UserDetailedNotMe> => {
		return stripUndefined({
			...userLite(user),
			url: user.url,
			uri: user.uri,
			movedTo: user.movedTo,
			alsoKnownAs: user.alsoKnownAs,
			createdAt: user.createdAt,
			updatedAt: user.updatedAt,
			lastFetchedAt: user.lastFetchedAt,
			bannerUrl: user.bannerUrl,
			bannerBlurhash: user.bannerBlurhash,
			isLocked: user.isLocked,
			isSilenced: user.isSilenced,
			isSuspended: user.isSuspended,
			description: user.description,
			location: user.location,
			birthday: user.birthday,
			lang: user.lang,
			fields: user.fields,
			verifiedLinks: user.verifiedLinks,
			followersCount: user.followersCount,
			followingCount: user.followingCount,
			notesCount: user.notesCount,
			pinnedNoteIds: user.pinnedNoteIds,
			pinnedNotes: user.pinnedNotes,
			pinnedPageId: user.pinnedPageId,
			pinnedPage: user.pinnedPage,
			publicReactions: user.publicReactions,
			followingVisibility: user.followingVisibility,
			followersVisibility: user.followersVisibility,
			chatScope: user.chatScope,
			canChat: user.canChat,
			roles: user.roles,
			memo: user.memo,
		});
	};

	// Relations関連のキーが過不足なく入っている？
	const userDetailedNotMeWithRelations = (
		user: misskey.entities.SignupResponse,
	): Partial<misskey.entities.UserDetailedNotMe> => {
		return stripUndefined({
			...userDetailedNotMe(user),
			isFollowing: user.isFollowing ?? false,
			isFollowed: user.isFollowed ?? false,
			hasPendingFollowRequestFromYou: user.hasPendingFollowRequestFromYou ?? false,
			hasPendingFollowRequestToYou: user.hasPendingFollowRequestToYou ?? false,
			isBlocking: user.isBlocking ?? false,
			isBlocked: user.isBlocked ?? false,
			isMuted: user.isMuted ?? false,
			isRenoteMuted: user.isRenoteMuted ?? false,
			notify: user.notify ?? 'none',
			withReplies: user.withReplies ?? false,
			followedMessage: user.isFollowing ? (user.followedMessage ?? null) : undefined,
		});
	};

	// MeDetailedのキーが過不足なく入っている？
	const meDetailed = (
		user: misskey.entities.SignupResponse,
		security = false,
	): Partial<misskey.entities.MeDetailed> => {
		return stripUndefined({
			...userDetailedNotMe(user),
			avatarId: user.avatarId,
			bannerId: user.bannerId,
			followedMessage: user.followedMessage,
			isModerator: user.isModerator,
			isAdmin: user.isAdmin,
			injectFeaturedNote: user.injectFeaturedNote,
			receiveAnnouncementEmail: user.receiveAnnouncementEmail,
			alwaysMarkNsfw: user.alwaysMarkNsfw,
			autoSensitive: user.autoSensitive,
			carefulBot: user.carefulBot,
			autoAcceptFollowed: user.autoAcceptFollowed,
			noCrawle: user.noCrawle,
			preventAiLearning: user.preventAiLearning,
			isExplorable: user.isExplorable,
			isDeleted: user.isDeleted,
			twoFactorBackupCodesStock: user.twoFactorBackupCodesStock,
			hideOnlineStatus: user.hideOnlineStatus,
			hasUnreadSpecifiedNotes: user.hasUnreadSpecifiedNotes,
			hasUnreadMentions: user.hasUnreadMentions,
			hasUnreadAnnouncement: user.hasUnreadAnnouncement,
			hasUnreadAntenna: user.hasUnreadAntenna,
			hasUnreadChannel: user.hasUnreadChannel,
			hasUnreadChatMessages: user.hasUnreadChatMessages,
			hasUnreadNotification: user.hasUnreadNotification,
			unreadNotificationsCount: user.unreadNotificationsCount,
			hasPendingReceivedFollowRequest: user.hasPendingReceivedFollowRequest,
			unreadAnnouncements: user.unreadAnnouncements,
			mutedWords: user.mutedWords,
			hardMutedWords: user.hardMutedWords,
			mutedInstances: user.mutedInstances,
			// @ts-expect-error 後方互換性
			mutingNotificationTypes: user.mutingNotificationTypes,
			notificationRecieveConfig: user.notificationRecieveConfig,
			emailNotificationTypes: user.emailNotificationTypes,
			achievements: user.achievements,
			loggedInDays: user.loggedInDays,
			policies: user.policies,
			twoFactorEnabled: user.twoFactorEnabled,
			usePasswordLessLogin: user.usePasswordLessLogin,
			securityKeys: user.securityKeys,
			...(security
				? {
						email: user.email,
						emailVerified: user.emailVerified,
						securityKeysList: user.securityKeysList,
					}
				: {}),
		});
	};

	let root: misskey.entities.SignupResponse;
	let alice: misskey.entities.SignupResponse;
	let aliceNote: misskey.entities.Note;

	let bob: misskey.entities.SignupResponse;

	// NOTE: これがないと落ちる（bob の updatedAt が null になってしまうため？）
	let bobNote: misskey.entities.Note;

	let carol: misskey.entities.SignupResponse;

	let usersReplying: misskey.entities.SignupResponse[];

	let userNoNote: misskey.entities.SignupResponse;
	let userNotExplorable: misskey.entities.SignupResponse;
	let userLocking: misskey.entities.SignupResponse;
	let userAdmin: misskey.entities.SignupResponse;
	let roleAdmin: misskey.entities.Role;
	let userModerator: misskey.entities.SignupResponse;
	let roleModerator: misskey.entities.Role;
	let userRolePublic: misskey.entities.SignupResponse;
	let rolePublic: misskey.entities.Role;
	let userRoleBadge: misskey.entities.SignupResponse;
	let roleBadge: misskey.entities.Role;
	let userSilenced: misskey.entities.SignupResponse;
	let roleSilenced: misskey.entities.Role;
	let userSuspended: misskey.entities.SignupResponse;
	let userDeletedBySelf: misskey.entities.SignupResponse;
	let userDeletedByAdmin: misskey.entities.SignupResponse;
	let userFollowingAlice: misskey.entities.SignupResponse;
	let userFollowedByAlice: misskey.entities.SignupResponse;
	let userBlockingAlice: misskey.entities.SignupResponse;
	let userBlockedByAlice: misskey.entities.SignupResponse;
	let userMutingAlice: misskey.entities.SignupResponse;
	let userMutedByAlice: misskey.entities.SignupResponse;
	let userRnMutingAlice: misskey.entities.SignupResponse;
	let userRnMutedByAlice: misskey.entities.SignupResponse;
	let userFollowRequesting: misskey.entities.SignupResponse;
	let userFollowRequested: misskey.entities.SignupResponse;

	let database: TestDatabase;

	// 連合の実サーバーは立てず、リモートユーザーをDBに直接用意する。
	// isExplorable はデフォルト true だが、既存の一覧系テストは origin: 'local' (デフォルト) で
	// 取得するため互いに干渉しない。
	let remoteUserCounter = 0;
	const createRemoteUser = async (
		options: { host?: string; tags?: string[] } = {},
	): Promise<{ id: string; username: string; host: string }> => {
		const suffix = `${Date.now().toString(36).slice(-6)}x${++remoteUserCounter}`;
		const host = options.host ?? `users-remote-${suffix}.example`;
		const id = genId();
		const username = `uremote${suffix}`;
		await createUserWithProfileAndPublickeyInDatabase(database, {
			user: {
				id,
				username,
				usernameLower: username.toLowerCase(),
				host,
				inbox: `https://${host}/inbox`,
				uri: `https://${host}/users/${id}`,
				// users/search-by-username-and-host は「非フォロー かつ updatedAt IS NULL」の
				// ユーザーを返さないため、アクティブなユーザーとして用意する。
				updatedAt: new Date(),
				...(options.tags ? { tags: options.tags } : {}),
			},
			profile: {
				userId: id,
				userHost: host,
			},
		});
		return { id, username, host };
	};

	afterAll(async () => {
		await database.close();
	});

	beforeAll(
		async () => {
			database = openTestDatabase();
			root = await signup({ username: 'root' });
			alice = await signup({ username: 'alice' });
			aliceNote = await post(alice, { text: 'test' });
			bob = await signup({ username: 'bob' });
			bobNote = await post(bob, { text: 'test' });
			carol = await signup({ username: 'carol' });

			// @alice -> @replyingへのリプライ。Promise.allで一気に作るとtimeoutしてしまうのでreduceで一つ一つawaitする
			usersReplying = await [...Array(10)]
				.map((_, i) => i)
				.reduce(
					async (acc, i) => {
						const u = await signup({ username: `replying${i}` });
						for (let j = 0; j < 10 - i; j++) {
							const p = await post(u, { text: `test${j}` });
							await post(alice, { text: `@${u.username} test${j}`, replyId: p.id });
						}

						return (await acc).concat(u);
					},
					Promise.resolve([] as misskey.entities.SignupResponse[]),
				);

			userNoNote = await signup({ username: 'userNoNote' });
			userNotExplorable = await signup({ username: 'userNotExplorable' });
			await post(userNotExplorable, { text: 'test' });
			await api('i/update', { isExplorable: false }, userNotExplorable);
			userLocking = await signup({ username: 'userLocking' });
			await post(userLocking, { text: 'test' });
			await api('i/update', { isLocked: true }, userLocking);
			userAdmin = await signup({ username: 'userAdmin' });
			roleAdmin = await role(root, { isAdministrator: true, name: 'Admin Role' });
			await api('admin/roles/assign', { userId: userAdmin.id, roleId: roleAdmin.id }, root);
			userModerator = await signup({ username: 'userModerator' });
			roleModerator = await role(root, { isModerator: true, name: 'Moderator Role' });
			await api('admin/roles/assign', { userId: userModerator.id, roleId: roleModerator.id }, root);
			userRolePublic = await signup({ username: 'userRolePublic' });
			rolePublic = await role(root, { isPublic: true, name: 'Public Role' });
			await api('admin/roles/assign', { userId: userRolePublic.id, roleId: rolePublic.id }, root);
			userRoleBadge = await signup({ username: 'userRoleBadge' });
			roleBadge = await role(root, { asBadge: true, name: 'Badge Role', isPublic: true });
			await api('admin/roles/assign', { userId: userRoleBadge.id, roleId: roleBadge.id }, root);
			userSilenced = await signup({ username: 'userSilenced' });
			await post(userSilenced, { text: 'test' });
			roleSilenced = await role(root, {}, { canPublicNote: { priority: 0, useDefault: false, value: false } });
			await api('admin/roles/assign', { userId: userSilenced.id, roleId: roleSilenced.id }, root);
			userSuspended = await signup({ username: 'userSuspended' });
			await post(userSuspended, { text: 'test' });
			await successfulApiCall({
				endpoint: 'i/update',
				parameters: { description: '#user_testuserSuspended' },
				user: userSuspended,
			});
			await api('admin/suspend-user', { userId: userSuspended.id }, root);
			userDeletedBySelf = await signup({ username: 'userDeletedBySelf', password: 'userDeletedBySelf' });
			await post(userDeletedBySelf, { text: 'test' });
			await api('i/delete-account', { password: 'userDeletedBySelf' }, userDeletedBySelf);
			userDeletedByAdmin = await signup({ username: 'userDeletedByAdmin' });
			await post(userDeletedByAdmin, { text: 'test' });
			await api('admin/delete-account', { userId: userDeletedByAdmin.id }, root);
			userFollowingAlice = await signup({ username: 'userFollowingAlice' });
			await post(userFollowingAlice, { text: 'test' });
			await api('following/create', { userId: alice.id }, userFollowingAlice);
			userFollowedByAlice = await signup({ username: 'userFollowedByAlice' });
			await post(userFollowedByAlice, { text: 'test' });
			await api('following/create', { userId: userFollowedByAlice.id }, alice);
			userBlockingAlice = await signup({ username: 'userBlockingAlice' });
			await post(userBlockingAlice, { text: 'test' });
			await api('blocking/create', { userId: alice.id }, userBlockingAlice);
			userBlockedByAlice = await signup({ username: 'userBlockedByAlice' });
			await post(userBlockedByAlice, { text: 'test' });
			await api('blocking/create', { userId: userBlockedByAlice.id }, alice);
			userMutingAlice = await signup({ username: 'userMutingAlice' });
			await post(userMutingAlice, { text: 'test' });
			await api('mute/create', { userId: alice.id }, userMutingAlice);
			userMutedByAlice = await signup({ username: 'userMutedByAlice' });
			await post(userMutedByAlice, { text: 'test' });
			await api('mute/create', { userId: userMutedByAlice.id }, alice);
			userRnMutingAlice = await signup({ username: 'userRnMutingAlice' });
			await post(userRnMutingAlice, { text: 'test' });
			await api('renote-mute/create', { userId: alice.id }, userRnMutingAlice);
			userRnMutedByAlice = await signup({ username: 'userRnMutedByAlice' });
			await post(userRnMutedByAlice, { text: 'test' });
			await api('renote-mute/create', { userId: userRnMutedByAlice.id }, alice);
			userFollowRequesting = await signup({ username: 'userFollowRequesting' });
			await post(userFollowRequesting, { text: 'test' });
			userFollowRequested = userLocking;
			await api('following/create', { userId: userFollowRequested.id }, userFollowRequesting);
		},
		1000 * 60 * 10,
	);

	beforeEach(async () => {
		alice = {
			...alice,
			...(await successfulApiCall({ endpoint: 'i', parameters: {}, user: alice })),
		};
		aliceNote = await successfulApiCall({ endpoint: 'notes/show', parameters: { noteId: aliceNote.id }, user: alice });
	});

	test('が作れる。（作りたての状態で自分のユーザー情報が取れる）', async () => {
		// SignupApiService.ts
		const response = (await successfulApiCall({
			endpoint: 'signup',
			parameters: { username: 'zoe', password: 'password' },
			user: undefined,
		})) as unknown as misskey.entities.SignupResponse; // BUG MeDetailedに足りないキーがある

		// signupの時はtokenが含まれる特別なMeDetailedが返ってくる
		expect(response.token).toMatch(/[a-zA-Z0-9]{16}/);

		// UserLite
		expect(response.id).toMatch(/[0-9a-z]{10}/);
		expect(response.name).toBe(null);
		expect(response.username).toBe('zoe');
		expect(response.host).toBe(null);
		response.avatarUrl && expect(response.avatarUrl).toMatch(/^[-a-zA-Z0-9@:%._\+~#&?=\/]+$/);
		expect(response.avatarBlurhash).toBe(null);
		expect(response.avatarDecorations).toStrictEqual([]);
		expect(response.isBot).toBe(false);
		expect(response.isCat).toBe(false);
		expect(response.instance).toBe(undefined);
		expect(response.emojis).toStrictEqual({});
		expect(response.onlineStatus).toBe('unknown');
		expect(response.badgeRoles).toStrictEqual([]);
		// UserDetailedNotMeOnly
		expect(response.url).toBe(null);
		expect(response.uri).toBe(null);
		expect(response.movedTo).toBe(null);
		expect(response.alsoKnownAs).toBe(null);
		expect(response.createdAt).toBe(new Date(response.createdAt).toISOString());
		expect(response.updatedAt).toBe(null);
		expect(response.lastFetchedAt).toBe(null);
		expect(response.bannerUrl).toBe(null);
		expect(response.bannerBlurhash).toBe(null);
		expect(response.isLocked).toBe(false);
		expect(response.isSilenced).toBe(false);
		expect(response.isSuspended).toBe(false);
		expect(response.description).toBe(null);
		expect(response.location).toBe(null);
		expect(response.birthday).toBe(null);
		expect(response.lang).toBe(null);
		expect(response.fields).toStrictEqual([]);
		expect(response.verifiedLinks).toStrictEqual([]);
		expect(response.followersCount).toBe(0);
		expect(response.followingCount).toBe(0);
		expect(response.notesCount).toBe(0);
		expect(response.pinnedNoteIds).toStrictEqual([]);
		expect(response.pinnedNotes).toStrictEqual([]);
		expect(response.pinnedPageId).toBe(null);
		expect(response.pinnedPage).toBe(null);
		expect(response.publicReactions).toBe(true);
		expect(response.followingVisibility).toBe('public');
		expect(response.followersVisibility).toBe('public');
		expect(response.chatScope).toBe('mutual');
		expect(response.canChat).toBe(true);
		expect(response.roles).toStrictEqual([]);
		expect(response.memo).toBe(null);

		// MeDetailedOnly
		expect(response.avatarId).toBe(null);
		expect(response.bannerId).toBe(null);
		expect(response.followedMessage).toBe(null);
		expect(response.isModerator).toBe(false);
		expect(response.isAdmin).toBe(false);
		expect(response.injectFeaturedNote).toBe(true);
		expect(response.receiveAnnouncementEmail).toBe(true);
		expect(response.alwaysMarkNsfw).toBe(false);
		expect(response.autoSensitive).toBe(false);
		expect(response.carefulBot).toBe(false);
		expect(response.autoAcceptFollowed).toBe(true);
		expect(response.noCrawle).toBe(false);
		expect(response.preventAiLearning).toBe(true);
		expect(response.isExplorable).toBe(true);
		expect(response.isDeleted).toBe(false);
		expect(response.twoFactorBackupCodesStock).toBe('none');
		expect(response.hideOnlineStatus).toBe(false);
		expect(response.hasUnreadSpecifiedNotes).toBe(false);
		expect(response.hasUnreadMentions).toBe(false);
		expect(response.hasUnreadAnnouncement).toBe(false);
		expect(response.hasUnreadAntenna).toBe(false);
		expect(response.hasUnreadChannel).toBe(false);
		expect(response.hasUnreadChatMessages).toBe(false);
		expect(response.hasUnreadNotification).toBe(false);
		expect(response.unreadNotificationsCount).toBe(0);
		expect(response.hasPendingReceivedFollowRequest).toBe(false);
		expect(response.unreadAnnouncements).toStrictEqual([]);
		expect(response.mutedWords).toStrictEqual([]);
		expect(response.mutedInstances).toStrictEqual([]);
		// @ts-expect-error 後方互換のため
		expect(response.mutingNotificationTypes).toStrictEqual([]);
		expect(response.notificationRecieveConfig).toStrictEqual({});
		expect(response.emailNotificationTypes).toStrictEqual(['follow', 'receiveFollowRequest']);
		expect(response.achievements).toStrictEqual([]);
		expect(response.loggedInDays).toStrictEqual(0);
		expect(response.policies).toStrictEqual(DEFAULT_POLICIES);
		expect(response.twoFactorEnabled).toBe(false);
		expect(response.usePasswordLessLogin).toBe(false);
		expect(response.securityKeys).toBe(false);
		expect(response.email).not.toBe(undefined);
		expect(response.emailVerified).toBe(false);
		expect(response.securityKeysList).toStrictEqual([]);
	});

	test('を読み取ることができること（自分）、キーが過不足なく入っていること。', async () => {
		const response = await successfulApiCall({
			endpoint: 'i',
			parameters: {},
			user: userNoNote,
		});
		const expected = meDetailed(userNoNote, true);
		expected.loggedInDays = 1; // iはloggedInDaysを更新する
		expect(response).toStrictEqual(expected);
	});

	test.each([
		{ parameters: () => ({ name: null }) },
		{ parameters: () => ({ name: 'x'.repeat(50) }) },
		{ parameters: () => ({ name: 'x' }) },
		{ parameters: () => ({ name: 'My name' }) },
		{ parameters: () => ({ description: null }) },
		{ parameters: () => ({ description: 'x'.repeat(1500) }) },
		{ parameters: () => ({ description: 'x' }) },
		{ parameters: () => ({ description: 'My description' }) },
		{ parameters: () => ({ followedMessage: null }) },
		{ parameters: () => ({ followedMessage: 'Thank you' }) },
		{ parameters: () => ({ location: null }) },
		{ parameters: () => ({ location: 'x'.repeat(50) }) },
		{ parameters: () => ({ location: 'x' }) },
		{ parameters: () => ({ location: 'My location' }) },
		{ parameters: () => ({ birthday: '0000-00-00' }) },
		{ parameters: () => ({ birthday: '9999-99-99' }) },
		{ parameters: () => ({ lang: 'en-US' as const }) },
		{ parameters: () => ({ fields: [] }) },
		{ parameters: () => ({ fields: [{ name: 'x', value: 'x' }] }) },
		{ parameters: () => ({ fields: [{ name: 'x'.repeat(3000), value: 'x'.repeat(3000) }] }) }, // BUG? fieldには制限がない
		{ parameters: () => ({ fields: Array(16).fill({ name: 'x', value: 'y' }) }) },
		{ parameters: () => ({ isLocked: true }) },
		{ parameters: () => ({ isLocked: false }) },
		{ parameters: () => ({ isExplorable: false }) },
		{ parameters: () => ({ isExplorable: true }) },
		{ parameters: () => ({ hideOnlineStatus: true }) },
		{ parameters: () => ({ hideOnlineStatus: false }) },
		{ parameters: () => ({ publicReactions: false }) },
		{ parameters: () => ({ publicReactions: true }) },
		{ parameters: () => ({ autoAcceptFollowed: true }) },
		{ parameters: () => ({ autoAcceptFollowed: false }) },
		{ parameters: () => ({ noCrawle: true }) },
		{ parameters: () => ({ noCrawle: false }) },
		{ parameters: () => ({ preventAiLearning: false }) },
		{ parameters: () => ({ preventAiLearning: true }) },
		{ parameters: () => ({ isBot: true }) },
		{ parameters: () => ({ isBot: false }) },
		{ parameters: () => ({ isCat: true }) },
		{ parameters: () => ({ isCat: false }) },
		{ parameters: () => ({ injectFeaturedNote: true }) },
		{ parameters: () => ({ injectFeaturedNote: false }) },
		{ parameters: () => ({ receiveAnnouncementEmail: true }) },
		{ parameters: () => ({ receiveAnnouncementEmail: false }) },
		{ parameters: () => ({ alwaysMarkNsfw: true }) },
		{ parameters: () => ({ alwaysMarkNsfw: false }) },
		{ parameters: () => ({ autoSensitive: true }) },
		{ parameters: () => ({ autoSensitive: false }) },
		{ parameters: () => ({ followingVisibility: 'private' as const }) },
		{ parameters: () => ({ followingVisibility: 'followers' as const }) },
		{ parameters: () => ({ followingVisibility: 'public' as const }) },
		{ parameters: () => ({ followersVisibility: 'private' as const }) },
		{ parameters: () => ({ followersVisibility: 'followers' as const }) },
		{ parameters: () => ({ followersVisibility: 'public' as const }) },
		{ parameters: () => ({ mutedWords: Array(19).fill(['xxxxx']) }) },
		{ parameters: () => ({ mutedWords: [['x'.repeat(194)]] }) },
		{ parameters: () => ({ mutedWords: [] }) },
		{ parameters: () => ({ mutedInstances: ['xxxx.xxxxx'] }) },
		{ parameters: () => ({ mutedInstances: [] }) },
		{ parameters: () => ({ notificationRecieveConfig: { mention: { type: 'following' } } }) },
		{ parameters: () => ({ notificationRecieveConfig: {} }) },
		{ parameters: () => ({ emailNotificationTypes: ['mention', 'reply', 'quote', 'follow', 'receiveFollowRequest'] }) },
		{ parameters: () => ({ emailNotificationTypes: [] }) },
	] as const)('を書き換えることができる($#)', async ({ parameters }) => {
		const response = await successfulApiCall({ endpoint: 'i/update', parameters: parameters(), user: alice });
		const expected = { ...meDetailed(alice, true), ...parameters() };
		expect(response, inspect(parameters())).toStrictEqual(expected);
	});

	test('を書き換えることができる(Avatar)', async () => {
		const aliceFile = (await uploadFile(alice)).body;
		const parameters = { avatarId: aliceFile!.id };
		const response = await successfulApiCall({ endpoint: 'i/update', parameters: parameters, user: alice });
		expect(response.avatarUrl ?? '.').toMatch(/^[-a-zA-Z0-9@:%._\+~#&?=\/]+$/);
		expect(response.avatarBlurhash ?? '.').toMatch(/[ -~]{54}/);
		const expected = {
			...meDetailed(alice, true),
			avatarId: aliceFile!.id,
			avatarBlurhash: response.avatarBlurhash,
			avatarUrl: response.avatarUrl,
		};
		expect(response, inspect(parameters)).toStrictEqual(expected);

		const parameters2 = { avatarId: null };
		const response2 = await successfulApiCall({ endpoint: 'i/update', parameters: parameters2, user: alice });
		const expected2 = {
			...meDetailed(alice, true),
			avatarId: null,
			avatarBlurhash: null,
			avatarUrl: alice.avatarUrl, // 解除した場合、identiconになる
		};
		expect(response2, inspect(parameters)).toStrictEqual(expected2);
	});

	test('を書き換えることができる(Banner)', async () => {
		const aliceFile = (await uploadFile(alice)).body;
		const parameters = { bannerId: aliceFile!.id };
		const response = await successfulApiCall({ endpoint: 'i/update', parameters: parameters, user: alice });
		expect(response.bannerUrl ?? '.').toMatch(/^[-a-zA-Z0-9@:%._\+~#&?=\/]+$/);
		expect(response.bannerBlurhash ?? '.').toMatch(/[ -~]{54}/);
		const expected = {
			...meDetailed(alice, true),
			bannerId: aliceFile!.id,
			bannerBlurhash: response.bannerBlurhash,
			bannerUrl: response.bannerUrl,
		};
		expect(response, inspect(parameters)).toStrictEqual(expected);

		const parameters2 = { bannerId: null };
		const response2 = await successfulApiCall({ endpoint: 'i/update', parameters: parameters2, user: alice });
		const expected2 = {
			...meDetailed(alice, true),
			bannerId: null,
			bannerBlurhash: null,
			bannerUrl: null,
		};
		expect(response2, inspect(parameters)).toStrictEqual(expected2);
	});

	test('を書き換えることができる(ピン止めノート)', async () => {
		const parameters = { noteId: aliceNote.id };
		const response = await successfulApiCall({ endpoint: 'i/pin', parameters, user: alice });
		const expected = { ...meDetailed(alice, false), pinnedNoteIds: [aliceNote.id], pinnedNotes: [aliceNote] };
		expect(response).toStrictEqual(expected);

		const response2 = await successfulApiCall({ endpoint: 'i/unpin', parameters, user: alice });
		const expected2 = meDetailed(alice, false);
		expect(response2).toStrictEqual(expected2);
	});

	test.each([
		{ label: '最大長', memo: 'x'.repeat(2048) },
		{ label: '空文字', memo: '', expects: null },
		{ label: 'null', memo: null },
	])('を書き換えることができる(メモを$labelに)', async ({ memo, expects }) => {
		const expected = { ...(await show(bob.id, alice)), memo: expects === undefined ? memo : expects };
		const parameters = { userId: bob.id, memo };
		await successfulApiCall({ endpoint: 'users/update-memo', parameters, user: alice });
		const response = await show(bob.id, alice);
		expect(response).toStrictEqual(expected);
	});

	test.each([
		{ label: 'ID昇順', parameters: { limit: 5 }, selector: (u: misskey.entities.UserLite): string => u.id },
		{
			label: 'フォロワー昇順',
			parameters: { sort: '+follower' },
			selector: (u: misskey.entities.UserDetailedNotMe): string => String(u.followersCount),
		},
		{
			label: 'フォロワー降順',
			parameters: { sort: '-follower' },
			selector: (u: misskey.entities.UserDetailedNotMe): string => String(u.followersCount),
		},
		{
			label: '登録日時昇順',
			parameters: { sort: '+createdAt' },
			selector: (u: misskey.entities.UserDetailedNotMe): string => u.createdAt,
		},
		{
			label: '登録日時降順',
			parameters: { sort: '-createdAt' },
			selector: (u: misskey.entities.UserDetailedNotMe): string => u.createdAt,
		},
		{
			label: '投稿日時昇順',
			parameters: { sort: '+updatedAt' },
			selector: (u: misskey.entities.UserDetailedNotMe): string => String(u.updatedAt),
		},
		{
			label: '投稿日時降順',
			parameters: { sort: '-updatedAt' },
			selector: (u: misskey.entities.UserDetailedNotMe): string => String(u.updatedAt),
		},
	] as const)('をリスト形式で取得することができる（$label）', async ({ parameters, selector }) => {
		const response = await successfulApiCall({ endpoint: 'users', parameters, user: alice });

		// 結果の並びを事前にアサートするのは困難なので返ってきたidに対応するユーザーが返っており、ソート順が正しいことだけを検証する
		const users = await Promise.all(response.map((u) => show(u.id, alice)));
		const expected = users.sort((x, y) => {
			const index = selector(x) < selector(y) ? -1 : selector(x) > selector(y) ? 1 : 0;
			return index * (parameters.sort?.startsWith('+') ? -1 : 1);
		});
		expect(response).toStrictEqual(expected);
	});
	test.each([
		{ label: '「見つけやすくする」がOFFのユーザーが含まれない', user: () => userNotExplorable, excluded: true },
		{ label: 'ミュートユーザーが含まれない', user: () => userMutedByAlice, excluded: true },
		{ label: 'ブロックされているユーザーが含まれない', user: () => userBlockedByAlice, excluded: true },
		{ label: 'ブロックしてきているユーザーが含まれる', user: () => userBlockingAlice, excluded: true },
		{ label: '承認制ユーザーが含まれる', user: () => userLocking },
		{ label: 'サイレンスユーザーが含まれる', user: () => userSilenced },
		{ label: 'サスペンドユーザーが含まれない', user: () => userSuspended, excluded: true },
		{ label: '削除済ユーザーが含まれる', user: () => userDeletedBySelf },
		{ label: '削除済(byAdmin)ユーザーが含まれる', user: () => userDeletedByAdmin },
	] as const)('をリスト形式で取得することができ、結果に$label', async ({ user, excluded }) => {
		const parameters = { limit: 100 };
		const response = await successfulApiCall({ endpoint: 'users', parameters, user: alice });
		const expected = (excluded ?? false) ? [] : [await show(user().id, alice)];
		expect(response.filter((u) => u.id === user().id)).toStrictEqual(expected);
	});
	test('をリスト形式で取得することができる（リモート, hostname指定）', async () => {
		const remote1 = await createRemoteUser();
		const remote2 = await createRemoteUser({ host: remote1.host });
		await createRemoteUser(); // 別ホスト (hostnameでフィルタされることの検証用)

		const parameters = { origin: 'remote', hostname: remote1.host, limit: 100 } as const;
		const response = await successfulApiCall({ endpoint: 'users', parameters, user: alice });
		// デフォルトはID昇順
		const expected = await Promise.all([remote1, remote2].map((u) => show(u.id, alice)));
		expect(response).toStrictEqual(expected);
	});
	test('をリスト形式で取得することができる（pagenation）', async () => {
		const expected = await successfulApiCall({ endpoint: 'users', parameters: { limit: 100 }, user: alice });
		// usersはoffsetのみサポートする (sinceId/untilIdは無い)
		await testPaginationConsistency(
			expected,
			async (paginationParam) => {
				return successfulApiCall({ endpoint: 'users', parameters: paginationParam, user: alice });
			},
			'offset',
			'asc',
		);
	});

	test.each([
		{ label: 'ID指定で自分自身を', parameters: () => ({ userId: alice.id }), user: () => alice, type: meDetailed },
		{
			label: 'ID指定で他人を',
			parameters: () => ({ userId: alice.id }),
			user: () => bob,
			type: userDetailedNotMeWithRelations,
		},
		{ label: 'ID指定かつ未認証', parameters: () => ({ userId: alice.id }), user: undefined, type: userDetailedNotMe },
		{
			label: '@指定で自分自身を',
			parameters: () => ({ username: alice.username }),
			user: () => alice,
			type: meDetailed,
		},
		{
			label: '@指定で他人を',
			parameters: () => ({ username: alice.username }),
			user: () => bob,
			type: userDetailedNotMeWithRelations,
		},
		{
			label: '@指定かつ未認証',
			parameters: () => ({ username: alice.username }),
			user: undefined,
			type: userDetailedNotMe,
		},
	] as const)('を取得することができる（$label）', async ({ parameters, user, type }) => {
		const response = await successfulApiCall({ endpoint: 'users/show', parameters: parameters(), user: user?.() });
		const expected = type(alice);
		expect(response).toStrictEqual(expected);
	});
	test.each([
		{
			label: 'Administratorになっている',
			user: () => userAdmin,
			me: () => userAdmin,
			selector: (user: misskey.entities.MeDetailed) => user.isAdmin,
		},
		{
			label: '自分以外から見たときはAdministratorか判定できない',
			user: () => userAdmin,
			// @ts-expect-error UserDetailedNotMe doesn't include isAdmin
			selector: (user: misskey.entities.UserDetailedNotMe) => user.isAdmin,
			expected: () => undefined,
		},
		{
			label: 'Moderatorになっている',
			user: () => userModerator,
			me: () => userModerator,
			selector: (user: misskey.entities.MeDetailed) => user.isModerator,
		},
		{
			label: '自分以外から見たときはModeratorか判定できない',
			user: () => userModerator,
			// @ts-expect-error UserDetailedNotMe doesn't include isModerator
			selector: (user: misskey.entities.UserDetailedNotMe) => user.isModerator,
			expected: () => undefined,
		},
		{
			label: '自分から見た場合に二要素認証関連のプロパティがセットされている',
			user: () => alice,
			me: () => alice,
			selector: (user: misskey.entities.MeDetailed) => user.twoFactorEnabled,
			expected: () => false,
		},
		{
			label: '自分以外から見た場合に二要素認証関連のプロパティがセットされていない',
			user: () => alice,
			me: () => bob,
			selector: (user: misskey.entities.UserDetailedNotMe) => user.twoFactorEnabled,
			expected: () => undefined,
		},
		{
			label: 'モデレーターから見た場合に二要素認証関連のプロパティがセットされている',
			user: () => alice,
			me: () => userModerator,
			selector: (user: misskey.entities.UserDetailedNotMe) => user.twoFactorEnabled,
			expected: () => false,
		},
		{
			label: 'サイレンスになっている',
			user: () => userSilenced,
			selector: (user: misskey.entities.UserDetailed) => user.isSilenced,
		},
		// FIXME: 落ちる
		//{ label: 'サスペンドになっている', user: () => userSuspended, selector: (user: misskey.entities.UserDetailed) => user.isSuspended },
		{
			label: '削除済みになっている',
			user: () => userDeletedBySelf,
			me: () => userDeletedBySelf,
			selector: (user: misskey.entities.MeDetailed) => user.isDeleted,
		},
		{
			label: '自分以外から見たときは削除済みか判定できない',
			user: () => userDeletedBySelf,
			// @ts-expect-error UserDetailedNotMe doesn't include isDeleted
			selector: (user: misskey.entities.UserDetailedNotMe) => user.isDeleted,
			expected: () => undefined,
		},
		{
			label: '削除済み(byAdmin)になっている',
			user: () => userDeletedByAdmin,
			me: () => userDeletedByAdmin,
			selector: (user: misskey.entities.MeDetailed) => user.isDeleted,
		},
		{
			label: '自分以外から見たときは削除済み(byAdmin)か判定できない',
			user: () => userDeletedByAdmin,
			// @ts-expect-error UserDetailedNotMe doesn't include isDeleted
			selector: (user: misskey.entities.UserDetailedNotMe) => user.isDeleted,
			expected: () => undefined,
		},
		{
			label: 'フォロー中になっている',
			user: () => userFollowedByAlice,
			selector: (user: misskey.entities.UserDetailed) => user.isFollowing,
		},
		{
			label: 'フォローされている',
			user: () => userFollowingAlice,
			selector: (user: misskey.entities.UserDetailed) => user.isFollowed,
		},
		{
			label: 'ブロック中になっている',
			user: () => userBlockedByAlice,
			selector: (user: misskey.entities.UserDetailed) => user.isBlocking,
		},
		{
			label: 'ブロックされている',
			user: () => userBlockingAlice,
			selector: (user: misskey.entities.UserDetailed) => user.isBlocked,
		},
		{
			label: 'ミュート中になっている',
			user: () => userMutedByAlice,
			selector: (user: misskey.entities.UserDetailed) => user.isMuted,
		},
		{
			label: 'リノートミュート中になっている',
			user: () => userRnMutedByAlice,
			selector: (user: misskey.entities.UserDetailed) => user.isRenoteMuted,
		},
		{
			label: 'フォローリクエスト中になっている',
			user: () => userFollowRequested,
			me: () => userFollowRequesting,
			selector: (user: misskey.entities.UserDetailed) => user.hasPendingFollowRequestFromYou,
		},
		{
			label: 'フォローリクエストされている',
			user: () => userFollowRequesting,
			me: () => userFollowRequested,
			selector: (user: misskey.entities.UserDetailed) => user.hasPendingFollowRequestToYou,
		},
	] as const)('を取得することができ、$labelこと', async ({ user, me, selector, expected }) => {
		const response = await successfulApiCall({
			endpoint: 'users/show',
			parameters: { userId: user().id },
			user: me?.() ?? alice,
		});
		expect(selector(response as any)).toBe((expected ?? ((): true => true))());
	});
	test('を取得することができ、Publicなロールがセットされていること', async () => {
		const response = await successfulApiCall({
			endpoint: 'users/show',
			parameters: { userId: userRolePublic.id },
			user: alice,
		});
		expect(response.badgeRoles).toStrictEqual([]);
		expect(response.roles).toStrictEqual([
			{
				id: rolePublic.id,
				name: rolePublic.name,
				color: rolePublic.color,
				iconUrl: rolePublic.iconUrl,
				description: rolePublic.description,
				isModerator: rolePublic.isModerator,
				isAdministrator: rolePublic.isAdministrator,
				displayOrder: rolePublic.displayOrder,
			},
		]);
	});
	test('を取得することができ、バッヂロールがセットされていること', async () => {
		const response = await successfulApiCall({
			endpoint: 'users/show',
			parameters: { userId: userRoleBadge.id },
			user: alice,
		});
		expect(response.badgeRoles).toStrictEqual([
			{
				name: roleBadge.name,
				iconUrl: roleBadge.iconUrl,
				displayOrder: roleBadge.displayOrder,
			},
		]);
		expect(response.roles).toStrictEqual([
			{
				id: roleBadge.id,
				name: roleBadge.name,
				color: roleBadge.color,
				iconUrl: roleBadge.iconUrl,
				description: roleBadge.description,
				isModerator: roleBadge.isModerator,
				isAdministrator: roleBadge.isAdministrator,
				displayOrder: roleBadge.displayOrder,
			},
		]);
	});
	test('をID指定のリスト形式で取得することができる（空）', async () => {
		const parameters = { userIds: [] };
		const response = await successfulApiCall({ endpoint: 'users/show', parameters, user: alice });
		const expected: [] = [];
		expect(response).toStrictEqual(expected);
	});
	test('をID指定のリスト形式で取得することができる', async () => {
		const parameters = { userIds: [bob.id, alice.id, carol.id] };
		const response = await successfulApiCall({ endpoint: 'users/show', parameters, user: alice });
		const expected = [
			await successfulApiCall({ endpoint: 'users/show', parameters: { userId: bob.id }, user: alice }),
			await successfulApiCall({ endpoint: 'users/show', parameters: { userId: alice.id }, user: alice }),
			await successfulApiCall({ endpoint: 'users/show', parameters: { userId: carol.id }, user: alice }),
		];
		expect(response).toStrictEqual(expected);
	});
	test.each([
		{ label: '「見つけやすくする」がOFFのユーザーが含まれる', user: () => userNotExplorable },
		{ label: 'ミュートユーザーが含まれる', user: () => userMutedByAlice },
		{ label: 'ブロックされているユーザーが含まれる', user: () => userBlockedByAlice },
		{ label: 'ブロックしてきているユーザーが含まれる', user: () => userBlockingAlice },
		{ label: '承認制ユーザーが含まれる', user: () => userLocking },
		{ label: 'サイレンスユーザーが含まれる', user: () => userSilenced },
		{ label: 'サスペンドユーザーが（モデレーターが見るときは）含まれる', user: () => userSuspended, me: () => root },
		// BUG サスペンドユーザーを一般ユーザーから見るとrootユーザーが返ってくる
		//{ label: 'サスペンドユーザーが（一般ユーザーが見るときは）含まれない', user: () => userSuspended, me: () => bob, excluded: true },
		{ label: '削除済ユーザーが含まれる', user: () => userDeletedBySelf },
		{ label: '削除済(byAdmin)ユーザーが含まれる', user: () => userDeletedByAdmin },
		// @ts-expect-error excluded は上でコメントアウトされているので
	] as const)('をID指定のリスト形式で取得することができ、結果に$label', async ({ user, me, excluded }) => {
		const parameters = { userIds: [user().id] };
		const response = await successfulApiCall({ endpoint: 'users/show', parameters, user: me?.() ?? alice });
		const expected = (excluded ?? false) ? [] : [await show(user().id, me?.() ?? alice)];
		expect(response).toStrictEqual(expected);
	});
	test('をID指定のリスト形式で取得することができる(リモート)', async () => {
		const remote = await createRemoteUser();
		const parameters = { userIds: [remote.id, bob.id] };
		const response = await successfulApiCall({ endpoint: 'users/show', parameters, user: alice });
		const expected = [await show(remote.id, alice), await show(bob.id, alice)];
		expect(response).toStrictEqual(expected);
	});

	test('を検索することができる', async () => {
		const parameters = { query: 'carol', limit: 10 };
		const response = await successfulApiCall({ endpoint: 'users/search', parameters, user: alice });
		const expected = [await show(carol.id, alice)];
		expect(response).toStrictEqual(expected);
	});
	test('を検索することができる(UserLite)', async () => {
		const parameters = { query: 'carol', detail: false, limit: 10 };
		const response = await successfulApiCall({ endpoint: 'users/search', parameters, user: alice });
		const expected = [userLite(await show(carol.id, alice))];
		expect(response).toStrictEqual(expected);
	});
	test.each([
		{ label: '「見つけやすくする」がOFFのユーザーが含まれる', user: () => userNotExplorable },
		{ label: 'ミュートユーザーが含まれない', user: () => userMutedByAlice, excluded: true },
		{ label: 'ブロックされているユーザーが含まれる', user: () => userBlockedByAlice },
		{ label: 'ブロックしてきているユーザーが含まれる', user: () => userBlockingAlice },
		{ label: '承認制ユーザーが含まれる', user: () => userLocking },
		{ label: 'サイレンスユーザーが含まれる', user: () => userSilenced },
		{ label: 'サスペンドユーザーが含まれない', user: () => userSuspended, excluded: true },
		{ label: '削除済ユーザーが含まれる', user: () => userDeletedBySelf },
		{ label: '削除済(byAdmin)ユーザーが含まれる', user: () => userDeletedByAdmin },
	] as const)('を検索することができ、結果に$labelが含まれる', async ({ user, excluded }) => {
		const parameters = { query: user().username, limit: 1 };
		const response = await successfulApiCall({ endpoint: 'users/search', parameters, user: alice });
		const expected = (excluded ?? false) ? [] : [await show(user().id, alice)];
		expect(response).toStrictEqual(expected);
	});
	test('を検索することができる(リモート)', async () => {
		const remote = await createRemoteUser();
		const parameters = { query: remote.username, origin: 'remote', limit: 10 } as const;
		const response = await successfulApiCall({ endpoint: 'users/search', parameters, user: alice });
		const expected = [await show(remote.id, alice)];
		expect(response).toStrictEqual(expected);
	});
	test('を検索することができる(pagenation)', async () => {
		// 検索結果は updatedAt DESC NULLS LAST で並ぶため、それぞれ投稿して
		// updatedAt を相異なる値にしないとoffsetページングが非決定的になる
		const searchPrefix = `pgsrch${Date.now().toString(36).slice(-6)}`;
		const created: misskey.entities.SignupResponse[] = [];
		for (let i = 0; i < 4; i++) {
			const u = await signup({ username: `${searchPrefix}${i}` });
			await post(u, { text: 'hi' });
			created.push(u);
		}

		const parameters = { query: searchPrefix, limit: 100 } as const;
		// notes/createによるuser.updatedAtの反映は非同期なので、全員分が反映されて
		// 並び順 (updatedAt DESC = 作成の逆順) が安定するまで待ってから期待値を固定する
		const orderStabilized = [...created]
			.reverse()
			.map((u) => u.id)
			.join(',');
		let expected = await successfulApiCall({ endpoint: 'users/search', parameters, user: alice });
		for (let i = 0; i < 30 && expected.map((u) => u.id).join(',') !== orderStabilized; i++) {
			await new Promise((resolve) => setTimeout(resolve, 100));
			expected = await successfulApiCall({ endpoint: 'users/search', parameters, user: alice });
		}
		expect(expected.map((u) => u.id).join(',')).toStrictEqual(orderStabilized);
		// users/searchはoffsetのみサポートする
		await testPaginationConsistency(
			expected,
			async (paginationParam) => {
				return successfulApiCall({
					endpoint: 'users/search',
					parameters: { ...parameters, ...paginationParam },
					user: alice,
				});
			},
			'offset',
			'asc',
		);
	});

	test.each([
		{ label: '自分', parameters: { username: 'alice' }, user: () => [alice] },
		{ label: '自分かつusernameが大文字', parameters: { username: 'ALICE' }, user: () => [alice] },
		{
			label: 'ローカルのフォロイーでノートなし',
			parameters: { username: 'userFollowedByAlice' },
			user: () => [userFollowedByAlice],
		},
		{ label: 'ローカルでノートなしは検索に載らない', parameters: { username: 'userNoNote' }, user: () => [] },
		{ label: 'ローカルの他人1', parameters: { username: 'bob' }, user: () => [bob] },
		{ label: 'ローカルの他人2', parameters: { username: 'bob', host: null }, user: () => [bob] },
		{ label: 'ローカルの他人3', parameters: { username: 'bob', host: '.' }, user: () => [bob] },
		{ label: 'ローカル', parameters: { host: null, limit: 1 }, user: () => [userFollowedByAlice] },
		{ label: 'ローカル', parameters: { host: '.', limit: 1 }, user: () => [userFollowedByAlice] },
	])('をID&ホスト指定で検索できる($label)', async ({ parameters, user }) => {
		const response = await successfulApiCall({
			endpoint: 'users/search-by-username-and-host',
			parameters,
			user: alice,
		});
		const expected = await Promise.all(user().map((u) => show(u.id, alice)));
		expect(response).toStrictEqual(expected);
	});
	test.each([
		{ label: '「見つけやすくする」がOFFのユーザーが含まれる', user: () => userNotExplorable },
		{ label: 'ミュートユーザーが含まれる', user: () => userMutedByAlice },
		{ label: 'ブロックされているユーザーが含まれる', user: () => userBlockedByAlice },
		{ label: 'ブロックしてきているユーザーが含まれる', user: () => userBlockingAlice },
		{ label: '承認制ユーザーが含まれる', user: () => userLocking },
		{ label: 'サイレンスユーザーが含まれる', user: () => userSilenced },
		{ label: 'サスペンドユーザーが含まれない', user: () => userSuspended, excluded: true },
		{ label: '削除済ユーザーが含まれる', user: () => userDeletedBySelf },
		{ label: '削除済(byAdmin)ユーザーが含まれる', user: () => userDeletedByAdmin },
	] as const)('をID&ホスト指定で検索でき、結果に$label', async ({ user, excluded }) => {
		const parameters = { username: user().username };
		const response = await successfulApiCall({
			endpoint: 'users/search-by-username-and-host',
			parameters,
			user: alice,
		});
		const expected = (excluded ?? false) ? [] : [await show(user().id, alice)];
		expect(response).toStrictEqual(expected);
	});
	test('をID&ホスト指定で検索できる(リモート)', async () => {
		const remote = await createRemoteUser();
		const parameters = { username: remote.username, host: remote.host };
		const response = await successfulApiCall({
			endpoint: 'users/search-by-username-and-host',
			parameters,
			user: alice,
		});
		const expected = [await show(remote.id, alice)];
		expect(response).toStrictEqual(expected);
	});

	test('がよくリプライをするユーザーのリストを取得できる', async () => {
		const parameters = { userId: alice.id, limit: 5 };
		const response = await successfulApiCall({
			endpoint: 'users/get-frequently-replied-users',
			parameters,
			user: alice,
		});
		const expected = await Promise.all(
			usersReplying.slice(0, parameters.limit).map(async (s, i) => ({
				user: await show(s.id, alice),
				weight: (usersReplying.length - i) / usersReplying.length,
			})),
		);
		expect(response).toStrictEqual(expected);
	});
	test.each([
		{ label: '「見つけやすくする」がOFFのユーザーが含まれる', user: () => userNotExplorable },
		{ label: 'ミュートユーザーが含まれる', user: () => userMutedByAlice },
		{ label: 'ブロックされているユーザーが含まれる', user: () => userBlockedByAlice },
		{ label: 'ブロックしてきているユーザーが含まれない', user: () => userBlockingAlice, excluded: true },
		{ label: '承認制ユーザーが含まれる', user: () => userLocking },
		{ label: 'サイレンスユーザーが含まれる', user: () => userSilenced },
		//{ label: 'サスペンドユーザーが含まれない', user: () => userSuspended, excluded: true },
		{ label: '削除済ユーザーが含まれる', user: () => userDeletedBySelf },
		{ label: '削除済(byAdmin)ユーザーが含まれる', user: () => userDeletedByAdmin },
	] as const)('がよくリプライをするユーザーのリストを取得でき、結果に$label', async ({ user, excluded }) => {
		const replyTo = (
			await successfulApiCall({ endpoint: 'users/notes', parameters: { userId: user().id }, user: undefined })
		)[0];
		assert.ok(replyTo);
		await post(alice, { text: `@${user().username} test`, replyId: replyTo.id });
		const parameters = { userId: alice.id, limit: 100 };
		const response = await successfulApiCall({
			endpoint: 'users/get-frequently-replied-users',
			parameters,
			user: alice,
		});
		const expected = (excluded ?? false) ? [] : [await show(user().id, alice)];
		expect(response.map((s) => s.user).filter((u) => u.id === user().id)).toStrictEqual(expected);
	});

	test.each([
		{
			label: 'フォロワー昇順',
			sort: { sort: '+follower' },
			selector: (u: misskey.entities.UserDetailedNotMe): string => String(u.followersCount),
		},
		{
			label: 'フォロワー降順',
			sort: { sort: '-follower' },
			selector: (u: misskey.entities.UserDetailedNotMe): string => String(u.followersCount),
		},
		{
			label: '登録日時昇順',
			sort: { sort: '+createdAt' },
			selector: (u: misskey.entities.UserDetailedNotMe): string => u.createdAt,
		},
		{
			label: '登録日時降順',
			sort: { sort: '-createdAt' },
			selector: (u: misskey.entities.UserDetailedNotMe): string => u.createdAt,
		},
		{
			label: '投稿日時昇順',
			sort: { sort: '+updatedAt' },
			selector: (u: misskey.entities.UserDetailedNotMe): string => String(u.updatedAt),
		},
		{
			label: '投稿日時降順',
			sort: { sort: '-updatedAt' },
			selector: (u: misskey.entities.UserDetailedNotMe): string => String(u.updatedAt),
		},
	] as const)('をハッシュタグ指定で取得することができる($label)', async ({ sort, selector }) => {
		const hashtag = 'test_hashtag';
		await successfulApiCall({ endpoint: 'i/update', parameters: { description: `#${hashtag}` }, user: alice });
		const parameters = { tag: hashtag, limit: 5, ...sort };
		const response = await successfulApiCall({ endpoint: 'hashtags/users', parameters, user: alice });
		const users = await Promise.all(response.map((u) => show(u.id, alice)));
		const expected = users.sort((x, y) => {
			const index = selector(x) < selector(y) ? -1 : selector(x) > selector(y) ? 1 : 0;
			return index * (parameters.sort.startsWith('+') ? -1 : 1);
		});
		expect(response).toStrictEqual(expected);
	});
	test.each([
		{ label: '「見つけやすくする」がOFFのユーザーが含まれる', user: () => userNotExplorable },
		{ label: 'ミュートユーザーが含まれる', user: () => userMutedByAlice },
		{ label: 'ブロックされているユーザーが含まれる', user: () => userBlockedByAlice },
		{ label: 'ブロックしてきているユーザーが含まれる', user: () => userBlockingAlice },
		{ label: '承認制ユーザーが含まれる', user: () => userLocking },
		{ label: 'サイレンスユーザーが含まれる', user: () => userSilenced },
		{ label: 'サスペンドユーザーが含まれない', user: () => userSuspended, excluded: true },
		{ label: '削除済ユーザーが含まれる', user: () => userDeletedBySelf },
		{ label: '削除済(byAdmin)ユーザーが含まれる', user: () => userDeletedByAdmin },
	] as const)('をハッシュタグ指定で取得することができ、結果に$label', async ({ user, excluded }) => {
		const hashtag = `user_test${user().username}`;
		if (user() !== userSuspended) {
			// サスペンドユーザーはupdateできない。
			await successfulApiCall({ endpoint: 'i/update', parameters: { description: `#${hashtag}` }, user: user() });
		}
		const parameters = { tag: hashtag, limit: 100, sort: '-follower' } as const;
		const response = await successfulApiCall({ endpoint: 'hashtags/users', parameters, user: alice });
		const expected = (excluded ?? false) ? [] : [await show(user().id, alice)];
		expect(response).toStrictEqual(expected);
	});
	test('をハッシュタグ指定で取得することができる(リモート)', async () => {
		const hashtag = `remotetag${Date.now().toString(36).slice(-6)}`;
		const remote = await createRemoteUser({ tags: [hashtag] });
		const parameters = { tag: hashtag, limit: 100, sort: '-follower', origin: 'remote' } as const;
		const response = await successfulApiCall({ endpoint: 'hashtags/users', parameters, user: alice });
		const expected = [await show(remote.id, alice)];
		expect(response).toStrictEqual(expected);
	});

	test('のオススメを取得することができる', async () => {
		const parameters = {};
		const response = await successfulApiCall({ endpoint: 'users/recommendation', parameters, user: alice });
		expect(response.length).not.toBe(0);
		// 呼び出し主体(alice)視点のUserDetailedとして返る
		const expected = await Promise.all(response.map((u) => show(u.id, alice)));
		expect(response).toStrictEqual(expected);
	});

	test('のピン止めユーザーを取得することができる', async () => {
		await successfulApiCall({
			endpoint: 'admin/update-meta',
			parameters: { pinnedUsers: [bob.username, `@${carol.username}`] },
			user: root,
		});
		const parameters = {} as const;
		const response = await successfulApiCall({ endpoint: 'pinned-users', parameters, user: alice });
		const expected = await Promise.all([bob, carol].map((u) => show(u.id, alice)));
		expect(response).toStrictEqual(expected);
	});

	test('を管理人として確認することができる(admin/show-user)', async () => {
		const user = await signup();
		const response = await successfulApiCall({
			endpoint: 'admin/show-user',
			parameters: { userId: user.id },
			user: root,
		});
		expect(response.email).toBe(null);
		expect(response.emailVerified).toBe(false);
		expect(response.isModerator).toBe(false);
		expect(response.isSilenced).toBe(false);
		expect(response.isSuspended).toBe(false);
		expect(response.moderationNote).toBe('');
		expect(response.signins).toStrictEqual([]);
		expect(response.roles).toStrictEqual([]);
		expect(response.roleAssigns).toStrictEqual([]);
		expect(response.policies).toStrictEqual(DEFAULT_POLICIES);
	});
	test('を管理人として確認することができる(admin/show-users)', async () => {
		const response = await successfulApiCall({
			endpoint: 'admin/show-users',
			parameters: { username: carol.username, limit: 10 },
			user: root,
		});
		const expected = [await show(carol.id)];
		expect(response).toStrictEqual(expected);
	});
	test('をサーバー向けに取得することができる(federation/users)', async () => {
		const remote1 = await createRemoteUser();
		const remote2 = await createRemoteUser({ host: remote1.host });
		const parameters = { host: remote1.host, limit: 10 };
		const response = await successfulApiCall({ endpoint: 'federation/users', parameters, user: alice });
		// ID降順ページネーション
		const expected = await Promise.all([remote2, remote1].map((u) => show(u.id, alice)));
		expect(response).toStrictEqual(expected);
	});
});
