/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import * as Acct from '@/misc/acct.js';
import { listAvatarDecorationsFromDatabase } from '@/core/AvatarDecorationStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase, listUserProfilesByUserIdsFromDatabase } from '@/core/UserProfileStore.js';
import { DEFAULT_POLICIES, type RolePolicies } from '@/core/role-policies.js';
import {
	fetchLocalUserByUsernameFromDatabase,
	fetchUserByIdFromDatabase,
	fetchUserByIdOrFailFromDatabase,
	fetchUserByUsernameAndHostFromDatabase,
	listUsersByIdsFromDatabase,
	listUsersByUrisOrIdsFromDatabase,
} from '@/core/UserStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { Packed } from '@/misc/json-schema.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { MiMeta } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import { HonoApiError } from './hono-api-error.js';
import type { HonoChartWriters } from './hono-chart-runtime.js';
import { isHonoApiModerator, type HonoApiRolePolicyDependencies } from './hono-api-role-policy.js';
import { parseHonoApiParams } from './hono-api-validation.js';

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

async function resolveAlsoKnownAsForHonoApi(deps: UserPackingDependencies, alsoKnownAs: string[] | null): Promise<string[] | null> {
	if (alsoKnownAs == null || alsoKnownAs.length === 0) return null;

	const localPrefix = `${deps.config.url}/users/`;
	const remoteUris = alsoKnownAs.filter(uri => !uri.startsWith(localPrefix));
	const remoteUsers = remoteUris.length > 0 ? await listUsersByUrisOrIdsFromDatabase(deps.db, { uris: remoteUris, ids: [] }) : [];
	const remoteIdByUri = new Map(remoteUsers.map(u => [u.uri, u.id]));

	return alsoKnownAs
		.map(uri => uri.startsWith(localPrefix) ? uri.slice(localPrefix.length) : (remoteIdByUri.get(uri) ?? null))
		.filter((id): id is string => id != null);
}

async function packUserDetailedNotMeCoreForHonoApi(
	deps: UserPackingDependencies,
	user: MiUser,
	profile: MiUserProfile,
): Promise<UserDetailedNotMeHonoApiResponse> {
	const policies = getHonoApiUserPolicies(deps.config, deps.meta);
	const alsoKnownAs = await resolveAlsoKnownAsForHonoApi(deps, user.alsoKnownAs);

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
		alsoKnownAs,
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

export function getIdenticonUrl(config: Config, meta: MiMeta, user: MiUser): string {
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
	const alsoKnownAs = await resolveAlsoKnownAsForHonoApi(deps, user.alsoKnownAs);

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
		alsoKnownAs,
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

export async function packUserDetailedForHonoApi(
	deps: UserPackingDependencies,
	user: MiUser,
	me: { id: MiUser['id'] } | null | undefined,
): Promise<MeDetailedHonoApiResponse | UserDetailedNotMeHonoApiResponse> {
	if (me != null && me.id === user.id) {
		return await packMeDetailedForHonoApi(deps, user, { includeSecrets: false });
	}

	return await packUserDetailedNotMeForHonoApi(deps, user);
}

export async function packUserDetailedManyForHonoApi(
	deps: UserPackingDependencies,
	srcs: (MiUser['id'] | MiUser)[],
	me: { id: MiUser['id'] } | null | undefined,
): Promise<(MeDetailedHonoApiResponse | UserDetailedNotMeHonoApiResponse)[]> {
	if (me == null) {
		return await packUserDetailedNotMeManyForHonoApi(deps, srcs);
	}

	const explicitUsers = srcs.filter((src): src is MiUser => typeof src === 'object');
	const ids = srcs.filter((src): src is string => typeof src === 'string');
	const fetchedUsers = ids.length > 0 ? await listUsersByIdsFromDatabase(deps.db, ids, { includeSuspended: true }) : [];
	const userById = new Map([...explicitUsers, ...fetchedUsers].map(user => [user.id, user]));
	for (const missingId of ids.filter(id => !userById.has(id))) {
		const user = await fetchUserByIdOrFailFromDatabase(deps.db, missingId);
		userById.set(user.id, user);
	}

	const users = srcs.map(src => typeof src === 'object' ? src : userById.get(src)!);
	const meIndex = users.findIndex(user => user.id === me.id);
	const others = meIndex === -1 ? users : users.filter((_, index) => index !== meIndex);
	const packedOthers = await packUserDetailedNotMeManyForHonoApi(deps, others);

	if (meIndex === -1) return packedOthers;

	const packedMe = await packMeDetailedForHonoApi(deps, users[meIndex]!, { includeSecrets: false });
	const result: (MeDetailedHonoApiResponse | UserDetailedNotMeHonoApiResponse)[] = [];
	let otherIndex = 0;
	for (let i = 0; i < users.length; i++) {
		result.push(i === meIndex ? packedMe : packedOthers[otherIndex++]!);
	}
	return result;
}

const pinnedUsersParamDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

export async function handleHonoApiPinnedUsers(
	deps: UserPackingDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<(MeDetailedHonoApiResponse | UserDetailedNotMeHonoApiResponse)[]> {
	parseHonoApiParams(pinnedUsersParamDef, body);

	const users = await Promise.all(deps.meta.pinnedUsers
		.map(acct => Acct.parse(acct))
		.map(acct => fetchUserByUsernameAndHostFromDatabase(deps.db, acct.username, acct.host)));

	return await packUserDetailedManyForHonoApi(deps, users.filter(user => user != null), me);
}

export type HonoApiUsersShowDependencies = UserPackingDependencies & HonoApiRolePolicyDependencies & {
	chartWriters: HonoChartWriters;
};

function usersShowFailedToResolveRemoteUserError(): HonoApiError {
	return new HonoApiError({ status: 500, message: 'Failed to resolve remote user.', code: 'FAILED_TO_RESOLVE_REMOTE_USER', id: 'ef7b9be4-9cba-4e6f-ab41-90ed171c7d3c', kind: 'server' });
}

function usersShowNoSuchUserError(): HonoApiError {
	return new HonoApiError({ status: 404, message: 'No such user.', code: 'NO_SUCH_USER', id: '4362f8dc-731f-4ad8-a694-be5a88922a24' });
}

const usersShowParamDef = {
	allOf: [
		{
			anyOf: [
				{ type: 'object', properties: { userId: { type: 'string', format: 'misskey:id' } }, required: ['userId'] },
				{ type: 'object', properties: { userIds: { type: 'array', uniqueItems: true, items: { type: 'string', format: 'misskey:id' } } }, required: ['userIds'] },
				{ type: 'object', properties: { username: { type: 'string' } }, required: ['username'] },
			],
		},
		{
			type: 'object',
			properties: {
				host: { type: 'string', nullable: true },
			},
		},
	],
} as const;

type UsersShowParams =
	| { userId: string; host?: string | null }
	| { userIds: string[]; host?: string | null }
	| { username: string; host?: string | null };

export async function handleHonoApiUsersShow(
	deps: HonoApiUsersShowDependencies,
	me: MiUser | null | undefined,
	body: Record<string, unknown>,
	ip: string | null,
): Promise<(MeDetailedHonoApiResponse | UserDetailedNotMeHonoApiResponse) | (MeDetailedHonoApiResponse | UserDetailedNotMeHonoApiResponse)[]> {
	const params = parseHonoApiParams(usersShowParamDef, body) as UsersShowParams;

	const isModerator = await isHonoApiModerator(deps, me ?? null);

	if ('username' in params) {
		params.username = params.username.trim();
	}

	if ('userIds' in params) {
		if (params.userIds.length === 0) return [];

		const users = await listUsersByIdsFromDatabase(deps.db, params.userIds, { includeSuspended: isModerator });

		const ordered: MiUser[] = [];
		for (const id of params.userIds) {
			const user = users.find(x => x.id === id);
			if (user != null) ordered.push(user);
		}

		const packedMap = new Map((await packUserDetailedManyForHonoApi(deps, ordered, me)).map((packed, i) => [ordered[i]!.id, packed]));
		return ordered.map(u => packedMap.get(u.id)!);
	}

	let user: MiUser | null;

	if (typeof params.host === 'string' && 'username' in params) {
		if (deps.meta.ugcVisibilityForVisitor === 'local' && me == null) {
			throw usersShowNoSuchUserError();
		}

		user = await fetchUserByUsernameAndHostFromDatabase(deps.db, params.username, params.host).catch(() => {
			throw usersShowFailedToResolveRemoteUserError();
		});
		if (user == null) throw usersShowFailedToResolveRemoteUserError();
	} else if ('userId' in params) {
		user = await fetchUserByIdFromDatabase(deps.db, params.userId);
	} else {
		user = await fetchLocalUserByUsernameFromDatabase(deps.db, params.username);
	}

	if (user == null || (!isModerator && user.isSuspended)) {
		throw usersShowNoSuchUserError();
	}

	if (deps.meta.ugcVisibilityForVisitor === 'local' && user.host != null && me == null) {
		throw usersShowNoSuchUserError();
	}

	if (user.host == null) {
		if (me == null && ip != null) {
			void deps.chartWriters.perUserPvChart.commitByVisitor(user, ip);
		} else if (me && me.id !== user.id) {
			void deps.chartWriters.perUserPvChart.commitByUser(user, me.id);
		}
	}

	return await packUserDetailedForHonoApi(deps, user, me);
}
