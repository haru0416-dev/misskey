/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta, MiRole, MiUser, MiUserProfile } from '@/models/_.js';

const {
	getApiRolePoliciesMock,
	getApiUserRolesMock,
	isApiAdministratorMock,
	isApiModeratorMock,
	listUserNotePiningsByUserIdFromDatabaseMock,
} = vi.hoisted(() => ({
	getApiRolePoliciesMock: vi.fn(),
	getApiUserRolesMock: vi.fn(),
	isApiAdministratorMock: vi.fn(),
	isApiModeratorMock: vi.fn(),
	listUserNotePiningsByUserIdFromDatabaseMock: vi.fn(),
}));

vi.mock('@/server/rest/role/role-policy.js', () => ({
	computeApiUserRoles: vi.fn(),
	getApiRolePolicies: getApiRolePoliciesMock,
	getApiUserRoles: getApiUserRolesMock,
	isApiAdministrator: isApiAdministratorMock,
	isApiModerator: isApiModeratorMock,
}));

vi.mock('@/core/user/UserMemoStore.js', () => ({
	deleteUserMemoFromDatabase: vi.fn(),
	fetchUserMemoTextFromDatabase: vi.fn(async () => null),
	listUserMemoTextsByUserIdFromDatabase: vi.fn(),
	upsertUserMemoInDatabase: vi.fn(),
}));

vi.mock('@/core/user/UserNotePiningStore.js', () => ({
	listUserNotePiningsByUserIdFromDatabase: listUserNotePiningsByUserIdFromDatabaseMock,
	listUserNotePiningsByUserIdsFromDatabase: vi.fn(),
}));

vi.mock('@/server/rest/note/note.js', () => ({
	packNoteManyForApi: vi.fn(async () => []),
	populateEmojis: vi.fn(async () => ({})),
	populateEmojisMany: vi.fn(async () => []),
}));

import { packMeDetailedForApi } from '@/server/rest/user/user.js';

const userId = '019f587c6bc4785ead8d511d603959f0';

function createUser(): MiUser {
	return {
		id: userId,
		name: 'Alice',
		username: 'alice',
		host: null,
		avatarId: null,
		avatarUrl: null,
		avatarBlurhash: null,
		avatarDecorations: [],
		bannerId: null,
		bannerUrl: null,
		bannerBlurhash: null,
		emojis: [],
		alsoKnownAs: null,
		updatedAt: null,
		lastFetchedAt: null,
		lastActiveDate: null,
		isBot: false,
		isCat: false,
		isLocked: false,
		isSuspended: false,
		isExplorable: true,
		isDeleted: false,
		hideOnlineStatus: false,
		requireSigninToViewContents: false,
		makeNotesFollowersOnlyBefore: null,
		makeNotesHiddenBefore: null,
		followersCount: 0,
		followingCount: 0,
		notesCount: 0,
		chatScope: 'everyone',
	} as unknown as MiUser;
}

function createProfile(): MiUserProfile {
	return {
		userId,
		url: null,
		description: null,
		location: null,
		birthday: null,
		lang: null,
		fields: [],
		verifiedLinks: [],
		pinnedPageId: null,
		publicReactions: false,
		followingVisibility: 'public',
		followersVisibility: 'public',
		twoFactorEnabled: false,
		usePasswordLessLogin: false,
		followedMessage: null,
		injectFeaturedNote: true,
		receiveAnnouncementEmail: false,
		alwaysMarkNsfw: false,
		autoSensitive: false,
		carefulBot: false,
		autoAcceptFollowed: false,
		noCrawle: false,
		preventAiLearning: false,
		twoFactorBackupSecret: [],
		mutedWords: [],
		hardMutedWords: [],
		mutedInstances: [],
		notificationRecieveConfig: {},
		emailNotificationTypes: [],
		achievements: [],
		loggedInDates: [],
		moderationNote: '',
	} as unknown as MiUserProfile;
}

const policies = {
	canPublicNote: true,
	chatAvailability: 'available',
};

async function packWithRoles(roles: MiRole[], rootUserId: string | null = null) {
	getApiUserRolesMock.mockResolvedValue(roles);
	getApiRolePoliciesMock.mockResolvedValue(policies);

	return await packMeDetailedForApi(
		{
			config: {
				instance: { url: 'https://example.test/' },
				runtime: { host: 'example.test' },
			} as Config,
			db: {} as MiDrizzleDatabase,
			meta: {
				rootUserId,
				showRoleBadgesOfRemoteUsers: true,
				iconUrl: null,
			} as MiMeta,
		},
		createUser(),
		{
			includeSecrets: false,
			profile: createProfile(),
		},
	);
}

describe('packMeDetailedForApi', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		listUserNotePiningsByUserIdFromDatabaseMock.mockResolvedValue([]);
	});

	test('reuses one role snapshot for policies, permissions, and detailed extras', async () => {
		const administratorRole = {
			id: 'administrator',
			name: 'Administrator',
			color: null,
			iconUrl: null,
			description: '',
			isPublic: true,
			isModerator: false,
			isAdministrator: true,
			asBadge: false,
			displayOrder: 0,
		} as MiRole;
		const response = await packWithRoles([administratorRole]);

		expect(getApiUserRolesMock).toHaveBeenCalledOnce();
		expect(getApiRolePoliciesMock).toHaveBeenCalledOnce();
		expect(getApiRolePoliciesMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), [administratorRole]);
		expect(isApiModeratorMock).not.toHaveBeenCalled();
		expect(isApiAdministratorMock).not.toHaveBeenCalled();
		expect(response).toMatchObject({
			isAdmin: true,
			isModerator: true,
			roles: [{ id: administratorRole.id }],
			policies,
		});
	});

	test.each([
		{
			name: 'root user',
			roles: [],
			rootUserId: userId,
			isAdmin: true,
			isModerator: true,
		},
		{
			name: 'moderator role',
			roles: [{ isAdministrator: false, isModerator: true } as MiRole],
			rootUserId: null,
			isAdmin: false,
			isModerator: true,
		},
		{
			name: 'regular user',
			roles: [],
			rootUserId: null,
			isAdmin: false,
			isModerator: false,
		},
	])('preserves role flags for $name', async ({ roles, rootUserId, isAdmin, isModerator }) => {
		const response = await packWithRoles(roles, rootUserId);

		expect(response).toMatchObject({ isAdmin, isModerator });
	});
});
