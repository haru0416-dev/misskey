/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import { listAvatarDecorationsFromDatabase } from '@/core/AvatarDecorationStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase, listUserProfilesByUserIdsFromDatabase } from '@/core/UserProfileStore.js';
import { DEFAULT_POLICIES, type RolePolicies } from '@/core/role-policies.js';
import { fetchUserByIdOrFailFromDatabase, listUsersByIdsFromDatabase } from '@/core/UserStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { Packed } from '@/misc/json-schema.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { MiMeta } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserProfile } from '@/models/UserProfile.js';

export type MeDetailedHonoApiResponse = Record<string, unknown>;
export type UserDetailedNotMeHonoApiResponse = Record<string, unknown>;

export type UserPackingDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
};

type HonoApiAvatarDecorationLite = {
	id: string;
	angle?: number;
	flipH?: boolean;
	offsetX?: number;
	offsetY?: number;
	url: string;
};

type PackMeDetailedOptions = {
	includeSecrets: boolean;
	profile?: MiUserProfile;
};

export function getHonoApiUserPolicies(config: Config, meta: MiMeta): RolePolicies {
	const policies = { ...DEFAULT_POLICIES, ...meta.policies };
	const serverMaxFileSizeMb = Math.floor(config.maxFileSize / (1024 * 1024));

	return {
		...policies,
		maxFileSizeMb: Math.min(serverMaxFileSizeMb, policies.maxFileSizeMb),
	};
}

function packUserLiteCoreForHonoApi(
	deps: UserPackingDependencies,
	user: MiUser,
	avatarDecorations: HonoApiAvatarDecorationLite[],
): Packed<'UserLite'> {
	return {
		id: user.id,
		name: user.name,
		username: user.username,
		host: user.host,
		avatarUrl: (user.avatarId == null ? null : user.avatarUrl) ?? getIdenticonUrl(deps.config, deps.meta, user),
		avatarBlurhash: user.avatarId == null ? null : user.avatarBlurhash,
		avatarDecorations,
		isBot: user.isBot,
		isCat: user.isCat,
		requireSigninToViewContents: user.requireSigninToViewContents === false ? undefined : true,
		makeNotesFollowersOnlyBefore: user.makeNotesFollowersOnlyBefore ?? undefined,
		makeNotesHiddenBefore: user.makeNotesHiddenBefore ?? undefined,
		instance: undefined,
		emojis: {},
		onlineStatus: getOnlineStatus(user),
		badgeRoles: [],
	};
}

async function buildHonoApiAvatarDecorations(
	deps: UserPackingDependencies,
	users: MiUser[],
): Promise<Map<MiUser['id'], HonoApiAvatarDecorationLite[]>> {
	const usersWithDecorations = users.filter(user => user.avatarDecorations.length > 0);
	if (usersWithDecorations.length === 0) return new Map();

	const decorations = await listAvatarDecorationsFromDatabase(deps.db);
	const decorationById = new Map(decorations.map(decoration => [decoration.id, decoration]));
	const map = new Map<MiUser['id'], HonoApiAvatarDecorationLite[]>();

	for (const user of usersWithDecorations) {
		map.set(user.id, user.avatarDecorations.flatMap(userDecoration => {
			const decoration = decorationById.get(userDecoration.id);
			if (decoration == null) return [];
			return [{
				id: userDecoration.id,
				angle: userDecoration.angle || undefined,
				flipH: userDecoration.flipH || undefined,
				offsetX: userDecoration.offsetX || undefined,
				offsetY: userDecoration.offsetY || undefined,
				url: decoration.url,
			}];
		}));
	}

	return map;
}

export async function packUserLiteForHonoApi(
	deps: UserPackingDependencies,
	src: MiUser['id'] | MiUser,
): Promise<Packed<'UserLite'>> {
	const user = typeof src === 'object' ? src : await fetchUserByIdOrFailFromDatabase(deps.db, src);
	const avatarDecorations = await buildHonoApiAvatarDecorations(deps, [user]);

	return packUserLiteCoreForHonoApi(deps, user, avatarDecorations.get(user.id) ?? []);
}

export async function packUserLiteManyForHonoApi(
	deps: UserPackingDependencies,
	srcs: (MiUser['id'] | MiUser)[],
): Promise<Packed<'UserLite'>[]> {
	const explicitUsers = srcs.filter((src): src is MiUser => typeof src === 'object');
	const ids = srcs.filter((src): src is string => typeof src === 'string');
	const fetchedUsers = ids.length > 0 ? await listUsersByIdsFromDatabase(deps.db, ids, { includeSuspended: true }) : [];
	const userById = new Map([...explicitUsers, ...fetchedUsers].map(user => [user.id, user]));
	for (const missingId of ids.filter(id => !userById.has(id))) {
		const user = await fetchUserByIdOrFailFromDatabase(deps.db, missingId);
		userById.set(user.id, user);
	}

	const users = srcs.map(src => typeof src === 'object' ? src : userById.get(src)!);
	const avatarDecorations = await buildHonoApiAvatarDecorations(deps, users);

	return users.map(user => packUserLiteCoreForHonoApi(deps, user, avatarDecorations.get(user.id) ?? []));
}

export async function packUserDetailedNotMeForHonoApi(
	deps: UserPackingDependencies,
	user: MiUser,
): Promise<UserDetailedNotMeHonoApiResponse> {
	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);

	return packUserDetailedNotMeCoreForHonoApi(deps, user, profile);
}

export async function packUserDetailedNotMeManyForHonoApi(
	deps: UserPackingDependencies,
	srcs: (MiUser['id'] | MiUser)[],
): Promise<UserDetailedNotMeHonoApiResponse[]> {
	const explicitUsers = srcs.filter((src): src is MiUser => typeof src === 'object');
	const ids = srcs.filter((src): src is string => typeof src === 'string');
	const fetchedUsers = ids.length > 0 ? await listUsersByIdsFromDatabase(deps.db, ids, { includeSuspended: true }) : [];
	const userById = new Map([...explicitUsers, ...fetchedUsers].map(user => [user.id, user]));
	for (const missingId of ids.filter(id => !userById.has(id))) {
		const user = await fetchUserByIdOrFailFromDatabase(deps.db, missingId);
		userById.set(user.id, user);
	}

	const users = srcs.map(src => typeof src === 'object' ? src : userById.get(src)!);
	const profiles = await listUserProfilesByUserIdsFromDatabase(deps.db, [...new Set(users.map(user => user.id))]);
	const profileByUserId = new Map(profiles.map(profile => [profile.userId, profile]));

	return await Promise.all(users.map(async user => packUserDetailedNotMeCoreForHonoApi(
		deps,
		user,
		profileByUserId.get(user.id) ?? await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id),
	)));
}

function packUserDetailedNotMeCoreForHonoApi(
	deps: UserPackingDependencies,
	user: MiUser,
	profile: MiUserProfile,
): UserDetailedNotMeHonoApiResponse {
	const policies = getHonoApiUserPolicies(deps.config, deps.meta);

	return {
		id: user.id,
		name: user.name,
		username: user.username,
		host: user.host,
		avatarUrl: (user.avatarId == null ? null : user.avatarUrl) ?? getIdenticonUrl(deps.config, deps.meta, user),
		avatarBlurhash: user.avatarId == null ? null : user.avatarBlurhash,
		avatarDecorations: user.avatarDecorations,
		isBot: user.isBot,
		isCat: user.isCat,
		requireSigninToViewContents: user.requireSigninToViewContents === false ? undefined : true,
		makeNotesFollowersOnlyBefore: user.makeNotesFollowersOnlyBefore ?? undefined,
		makeNotesHiddenBefore: user.makeNotesHiddenBefore ?? undefined,
		instance: undefined,
		emojis: {},
		onlineStatus: getOnlineStatus(user),
		badgeRoles: [],
		url: profile.url,
		uri: user.uri,
		movedTo: null,
		alsoKnownAs: user.alsoKnownAs,
		createdAt: parseId(deps.config, user.id).date.toISOString(),
		updatedAt: user.updatedAt ? user.updatedAt.toISOString() : null,
		lastFetchedAt: user.lastFetchedAt ? user.lastFetchedAt.toISOString() : null,
		bannerUrl: user.bannerId == null ? null : user.bannerUrl,
		bannerBlurhash: user.bannerId == null ? null : user.bannerBlurhash,
		isLocked: user.isLocked,
		isSilenced: !policies.canPublicNote,
		isSuspended: user.isSuspended,
		description: profile.description,
		location: profile.location,
		birthday: profile.birthday,
		lang: profile.lang,
		fields: profile.fields,
		verifiedLinks: profile.verifiedLinks,
		followersCount: user.followersCount,
		followingCount: user.followingCount,
		notesCount: user.notesCount,
		pinnedNoteIds: [],
		pinnedNotes: [],
		pinnedPageId: profile.pinnedPageId,
		pinnedPage: null,
		publicReactions: user.host == null ? profile.publicReactions : false,
		followingVisibility: profile.followingVisibility,
		followersVisibility: profile.followersVisibility,
		chatScope: user.chatScope,
		canChat: policies.chatAvailability === 'available',
		roles: [],
		memo: null,
	};
}

function getOnlineStatus(user: MiUser): 'unknown' | 'online' | 'active' | 'offline' {
	if (user.hideOnlineStatus) return 'unknown';
	if (user.lastActiveDate == null) return 'unknown';

	const elapsed = Date.now() - user.lastActiveDate.getTime();

	return (
		elapsed < 1000 * 60 * 10 ? 'online' :
		elapsed < 1000 * 60 * 60 * 24 * 3 ? 'active' :
		'offline'
	);
}

function getIdenticonUrl(config: Config, meta: MiMeta, user: MiUser): string {
	if ((user.host == null || user.host === config.host) && user.username.includes('.') && meta.iconUrl) {
		return meta.iconUrl;
	}

	return `${config.url}/identicon/${user.username.toLowerCase()}@${user.host ?? config.host}`;
}

function backupCodesStock(profile: MiUserProfile): 'none' | 'partial' | 'full' {
	const count = profile.twoFactorBackupSecret?.length ?? 0;
	if (count === 5) return 'full';
	return count > 0 ? 'partial' : 'none';
}

export async function packMeDetailedForHonoApi(
	deps: UserPackingDependencies,
	user: MiUser,
	options: PackMeDetailedOptions,
): Promise<MeDetailedHonoApiResponse> {
	const profile = options.profile ?? await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);
	const policies = getHonoApiUserPolicies(deps.config, deps.meta);
	const isRoot = deps.meta.rootUserId === user.id;

	return {
		id: user.id,
		name: user.name,
		username: user.username,
		host: user.host,
		avatarUrl: (user.avatarId == null ? null : user.avatarUrl) ?? getIdenticonUrl(deps.config, deps.meta, user),
		avatarBlurhash: user.avatarId == null ? null : user.avatarBlurhash,
		avatarDecorations: user.avatarDecorations,
		isBot: user.isBot,
		isCat: user.isCat,
		requireSigninToViewContents: user.requireSigninToViewContents === false ? undefined : true,
		makeNotesFollowersOnlyBefore: user.makeNotesFollowersOnlyBefore ?? undefined,
		makeNotesHiddenBefore: user.makeNotesHiddenBefore ?? undefined,
		instance: undefined,
		emojis: {},
		onlineStatus: getOnlineStatus(user),
		badgeRoles: [],
		url: profile.url,
		uri: user.uri,
		movedTo: null,
		alsoKnownAs: user.alsoKnownAs,
		createdAt: parseId(deps.config, user.id).date.toISOString(),
		updatedAt: user.updatedAt ? user.updatedAt.toISOString() : null,
		lastFetchedAt: user.lastFetchedAt ? user.lastFetchedAt.toISOString() : null,
		bannerUrl: user.bannerId == null ? null : user.bannerUrl,
		bannerBlurhash: user.bannerId == null ? null : user.bannerBlurhash,
		isLocked: user.isLocked,
		isSilenced: !policies.canPublicNote,
		isSuspended: user.isSuspended,
		description: profile.description,
		location: profile.location,
		birthday: profile.birthday,
		lang: profile.lang,
		fields: profile.fields,
		verifiedLinks: profile.verifiedLinks,
		followersCount: user.followersCount,
		followingCount: user.followingCount,
		notesCount: user.notesCount,
		pinnedNoteIds: [],
		pinnedNotes: [],
		pinnedPageId: profile.pinnedPageId,
		pinnedPage: null,
		publicReactions: user.host == null ? profile.publicReactions : false,
		followingVisibility: profile.followingVisibility,
		followersVisibility: profile.followersVisibility,
		chatScope: user.chatScope,
		canChat: policies.chatAvailability === 'available',
		roles: [],
		memo: null,
		twoFactorEnabled: profile.twoFactorEnabled,
		usePasswordLessLogin: profile.usePasswordLessLogin,
		securityKeys: false,
		avatarId: user.avatarId,
		bannerId: user.bannerId,
		followedMessage: profile.followedMessage,
		isModerator: isRoot,
		isAdmin: isRoot,
		injectFeaturedNote: profile.injectFeaturedNote,
		receiveAnnouncementEmail: profile.receiveAnnouncementEmail,
		alwaysMarkNsfw: profile.alwaysMarkNsfw,
		autoSensitive: profile.autoSensitive,
		carefulBot: profile.carefulBot,
		autoAcceptFollowed: profile.autoAcceptFollowed,
		noCrawle: profile.noCrawle,
		preventAiLearning: profile.preventAiLearning,
		isExplorable: user.isExplorable,
		isDeleted: user.isDeleted,
		twoFactorBackupCodesStock: backupCodesStock(profile),
		hideOnlineStatus: user.hideOnlineStatus,
		hasUnreadSpecifiedNotes: false,
		hasUnreadMentions: false,
		hasUnreadAnnouncement: false,
		hasUnreadAntenna: false,
		hasUnreadChannel: false,
		hasUnreadChatMessages: false,
		hasUnreadNotification: false,
		unreadNotificationsCount: 0,
		hasPendingReceivedFollowRequest: false,
		unreadAnnouncements: [],
		mutedWords: profile.mutedWords,
		hardMutedWords: profile.hardMutedWords,
		mutedInstances: profile.mutedInstances,
		mutingNotificationTypes: [],
		notificationRecieveConfig: profile.notificationRecieveConfig,
		emailNotificationTypes: profile.emailNotificationTypes,
		achievements: profile.achievements,
		loggedInDays: profile.loggedInDates.length,
		policies,
		...(options.includeSecrets ? {
			email: profile.email,
			emailVerified: profile.emailVerified,
			securityKeysList: [],
		} : {}),
	};
}
