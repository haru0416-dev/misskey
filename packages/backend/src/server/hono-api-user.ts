/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ms from 'ms';
import { sql, type SQL } from 'drizzle-orm';
import type { Config } from '@/config.js';
import * as Acct from '@/misc/acct.js';
import { maximum } from '@/misc/prelude/array.js';
import { listFrequentlyRepliedUsersFromDatabase } from '@/core/NoteStore.js';
import { listAvatarDecorationsFromDatabase } from '@/core/AvatarDecorationStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase, listUserProfilesByUserIdsFromDatabase } from '@/core/UserProfileStore.js';
import { DEFAULT_POLICIES, type RolePolicies } from '@/core/role-policies.js';
import {
	deserializeUser,
	fetchLocalUserByUsernameFromDatabase,
	fetchUserByIdFromDatabase,
	fetchUserByIdOrFailFromDatabase,
	fetchUserByUsernameAndHostFromDatabase,
	listExplorableUsersFromDatabase,
	listRecommendedUsersFromDatabase,
	listUsersByIdsFromDatabase,
	listUsersByUrisOrIdsFromDatabase,
} from '@/core/UserStore.js';
import { blockingExistsInDatabase, listBlockeeIdsByBlockerIdFromDatabase, listBlockerIdsByBlockeeIdFromDatabase } from '@/core/BlockingStore.js';
import { followRequestExistsInDatabase, listFollowRequestFolloweeIdsByFollowerIdFromDatabase, listFollowRequestFollowerIdsByFolloweeIdFromDatabase } from '@/core/FollowRequestStore.js';
import { fetchFollowingByFollowerIdAndFolloweeIdFromDatabase, followingExistsInDatabase, listAllFollowingsByFollowerIdFromDatabase, listFollowerIdsByFolloweeIdFromDatabase } from '@/core/FollowingStore.js';
import { listMuteeIdsByMuterIdFromDatabase, mutingExistsInDatabase } from '@/core/MutingStore.js';
import { listRenoteMuteeIdsByMuterIdFromDatabase, renoteMutingExistsInDatabase } from '@/core/RenoteMutingStore.js';
import { deleteUserMemoFromDatabase, fetchUserMemoTextFromDatabase, listUserMemoTextsByUserIdFromDatabase, upsertUserMemoInDatabase } from '@/core/UserMemoStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import type { UserRow } from '@/db/schema/user.js';
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
	me?: { id: MiUser['id'] } | null,
): Promise<UserDetailedNotMeHonoApiResponse> {
	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);
	const memo = me ? await fetchUserMemoTextFromDatabase(deps.db, me.id, user.id) : null;

	return packUserDetailedNotMeCoreForHonoApi(deps, user, profile, memo);
}

export async function packUserDetailedNotMeManyForHonoApi(
	deps: UserPackingDependencies,
	srcs: (MiUser['id'] | MiUser)[],
	me?: { id: MiUser['id'] } | null,
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
	const memoByTargetUserId = me ? await listUserMemoTextsByUserIdFromDatabase(deps.db, me.id) : null;

	return await Promise.all(users.map(async user => packUserDetailedNotMeCoreForHonoApi(
		deps,
		user,
		profileByUserId.get(user.id) ?? await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id),
		memoByTargetUserId ? (memoByTargetUserId.get(user.id) ?? null) : null,
	)));
}

export async function resolveAlsoKnownAsForHonoApi(deps: UserPackingDependencies, alsoKnownAs: string[] | null): Promise<string[] | null> {
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
	memo: string | null = null,
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
		memo,
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
	const memo = await fetchUserMemoTextFromDatabase(deps.db, user.id, user.id);

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
		memo,
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

	return await packUserDetailedNotMeForHonoApi(deps, user, me);
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
	const packedOthers = await packUserDetailedNotMeManyForHonoApi(deps, others, me);

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

const usersRelationParamDef = {
	type: 'object',
	properties: {
		userId: {
			oneOf: [
				{ type: 'string', format: 'misskey:id' },
				{
					type: 'array',
					items: { type: 'string', format: 'misskey:id' },
				},
			],
		},
	},
	required: ['userId'],
} as const;

type UsersRelationParams = { userId: string | string[] };

export type HonoApiUsersRelationDependencies = {
	db: MiDrizzleDatabase;
};

async function getUserRelationForHonoApi(deps: HonoApiUsersRelationDependencies, me: MiUser['id'], target: MiUser['id']) {
	const [
		following,
		isFollowed,
		hasPendingFollowRequestFromYou,
		hasPendingFollowRequestToYou,
		isBlocking,
		isBlocked,
		isMuted,
		isRenoteMuted,
	] = await Promise.all([
		fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, me, target),
		followingExistsInDatabase(deps.db, target, me),
		followRequestExistsInDatabase(deps.db, me, target),
		followRequestExistsInDatabase(deps.db, target, me),
		blockingExistsInDatabase(deps.db, me, target),
		blockingExistsInDatabase(deps.db, target, me),
		mutingExistsInDatabase(deps.db, me, target),
		renoteMutingExistsInDatabase(deps.db, me, target),
	]);

	return {
		id: target,
		following,
		isFollowing: following != null,
		isFollowed,
		hasPendingFollowRequestFromYou,
		hasPendingFollowRequestToYou,
		isBlocking,
		isBlocked,
		isMuted,
		isRenoteMuted,
	};
}

async function getUserRelationsForHonoApi(deps: HonoApiUsersRelationDependencies, me: MiUser['id'], targets: MiUser['id'][]) {
	const [
		followers,
		followees,
		followersRequests,
		followeesRequests,
		blockers,
		blockees,
		muters,
		renoteMuters,
	] = await Promise.all([
		listAllFollowingsByFollowerIdFromDatabase(deps.db, me)
			.then(f => new Map(f.map(it => [it.followeeId, it]))),
		listFollowerIdsByFolloweeIdFromDatabase(deps.db, me),
		listFollowRequestFolloweeIdsByFollowerIdFromDatabase(deps.db, me),
		listFollowRequestFollowerIdsByFolloweeIdFromDatabase(deps.db, me),
		listBlockeeIdsByBlockerIdFromDatabase(deps.db, me),
		listBlockerIdsByBlockeeIdFromDatabase(deps.db, me),
		listMuteeIdsByMuterIdFromDatabase(deps.db, me),
		listRenoteMuteeIdsByMuterIdFromDatabase(deps.db, me),
	]);

	return new Map(
		targets.map(target => {
			const following = followers.get(target) ?? null;

			return [
				target,
				{
					id: target,
					following,
					isFollowing: following != null,
					isFollowed: followees.includes(target),
					hasPendingFollowRequestFromYou: followersRequests.includes(target),
					hasPendingFollowRequestToYou: followeesRequests.includes(target),
					isBlocking: blockers.includes(target),
					isBlocked: blockees.includes(target),
					isMuted: muters.includes(target),
					isRenoteMuted: renoteMuters.includes(target),
				},
			];
		}),
	);
}

export async function handleHonoApiUsersRelation(
	deps: HonoApiUsersRelationDependencies,
	me: { id: MiUser['id'] },
	body: Record<string, unknown>,
): Promise<unknown> {
	const params = parseHonoApiParams(usersRelationParamDef, body) as UsersRelationParams;

	return Array.isArray(params.userId)
		? await getUserRelationsForHonoApi(deps, me.id, params.userId).then(it => [...it.values()])
		: await getUserRelationForHonoApi(deps, me.id, params.userId).then(it => [it]);
}

function limitOffsetSqlForHonoApi(options: { limit?: number; offset?: number }): SQL {
	return sql.join([
		options.limit == null ? sql`` : sql`LIMIT ${options.limit}`,
		options.offset == null ? sql`` : sql`OFFSET ${options.offset}`,
	], sql` `);
}

async function searchUsersForHonoApi(
	deps: { db: MiDrizzleDatabase },
	query: string,
	meId: MiUser['id'] | null,
	options: { limit?: number; offset?: number; origin?: 'local' | 'remote' | 'combined' } = {},
): Promise<MiUser[]> {
	const activeThreshold = new Date(Date.now() - (1000 * 60 * 60 * 24 * 30));
	const isUsername = query.startsWith('@') && !query.includes(' ') && query.indexOf('@', 1) === -1;
	const isLocalUsername = /^\w{1,20}$/.test(query);

	const nameConditions: SQL[] = [
		sql`("user"."name" ILIKE ${'%' + sqlLikeEscape(query) + '%'} ${
			isUsername
				? sql`OR "user"."usernameLower" LIKE ${sqlLikeEscape(query.replace('@', '').toLowerCase()) + '%'}`
				: isLocalUsername
					? sql`OR "user"."usernameLower" LIKE ${'%' + sqlLikeEscape(query.toLowerCase()) + '%'}`
					: sql``
		})`,
		sql`("user"."updatedAt" IS NULL OR "user"."updatedAt" > ${activeThreshold})`,
		sql`"user"."isSuspended" = FALSE`,
	];

	if (meId != null) {
		nameConditions.push(sql`"user"."id" NOT IN (SELECT "muteeId" FROM "muting" WHERE "muterId" = ${meId})`);
	}

	if (options.origin === 'local') {
		nameConditions.push(sql`"user"."host" IS NULL`);
	} else if (options.origin === 'remote') {
		nameConditions.push(sql`"user"."host" IS NOT NULL`);
	}

	const nameResult = await deps.db.execute<UserRow>(sql`
		SELECT "user".*
		FROM "user"
		WHERE ${sql.join(nameConditions, sql` AND `)}
		ORDER BY "user"."updatedAt" DESC NULLS LAST
		${limitOffsetSqlForHonoApi(options)}
	`);
	let users = nameResult.rows.map(row => deserializeUser(row));

	if (users.length < (options.limit ?? 30)) {
		const profileConditions: SQL[] = [
			sql`"prof"."description" ILIKE ${'%' + sqlLikeEscape(query) + '%'}`,
		];

		if (meId != null) {
			profileConditions.push(sql`"prof"."userId" NOT IN (SELECT "muteeId" FROM "muting" WHERE "muterId" = ${meId})`);
		}

		if (options.origin === 'local') {
			profileConditions.push(sql`"prof"."userHost" IS NULL`);
		} else if (options.origin === 'remote') {
			profileConditions.push(sql`"prof"."userHost" IS NOT NULL`);
		}

		const profileUserQuery = sql`
			SELECT "prof"."userId"
			FROM "user_profile" AS "prof"
			WHERE ${sql.join(profileConditions, sql` AND `)}
		`;

		const profileResult = await deps.db.execute<UserRow>(sql`
			SELECT "user".*
			FROM "user"
			WHERE "user"."id" IN (${profileUserQuery})
				AND ("user"."updatedAt" IS NULL OR "user"."updatedAt" > ${activeThreshold})
				AND "user"."isSuspended" = FALSE
			ORDER BY "user"."updatedAt" DESC NULLS LAST
			${limitOffsetSqlForHonoApi(options)}
		`);

		users = users.concat(profileResult.rows.map(row => deserializeUser(row)));
	}

	return users;
}

const usersSearchParamDef = {
	type: 'object',
	properties: {
		query: { type: 'string' },
		offset: { type: 'integer', default: 0 },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		origin: { type: 'string', enum: ['local', 'remote', 'combined'], default: 'combined' },
		detail: { type: 'boolean', default: true },
	},
	required: ['query'],
} as const;

type UsersSearchParams = {
	query: string;
	offset: number;
	limit: number;
	origin: 'local' | 'remote' | 'combined';
	detail: boolean;
};

export async function handleHonoApiUsersSearch(
	deps: UserPackingDependencies,
	me: MiUser | null | undefined,
	body: Record<string, unknown>,
): Promise<unknown[]> {
	const params = parseHonoApiParams(usersSearchParamDef, body) as UsersSearchParams;
	const users = await searchUsersForHonoApi(deps, params.query.trim(), me?.id ?? null, {
		offset: params.offset,
		limit: params.limit,
		origin: params.origin,
	});

	return params.detail
		? await packUserDetailedManyForHonoApi(deps, users, me)
		: await packUserLiteManyForHonoApi(deps, users);
}

function buildBaseUserSearchConditionsForHonoApi(
	config: Config,
	params: { username?: string | null; host?: string | null },
): SQL[] {
	const conditions: SQL[] = [];

	if (params.username) {
		conditions.push(sql`"user"."usernameLower" LIKE ${sqlLikeEscape(params.username.toLowerCase()) + '%'}`);
	}

	if (params.host) {
		if (params.host === config.hostname || params.host === '.') {
			conditions.push(sql`"user"."host" IS NULL`);
		} else {
			conditions.push(sql`"user"."host" LIKE ${sqlLikeEscape(params.host.toLowerCase()) + '%'}`);
		}
	}

	conditions.push(sql`"user"."isSuspended" = FALSE`);

	return conditions;
}

function defaultActiveThresholdForHonoApi(): Date {
	return new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
}

function buildSearchUserQueriesForHonoApi(
	config: Config,
	me: MiUser,
	params: { username?: string | null; host?: string | null; activeThreshold?: Date },
): SQL[][] {
	const activeThreshold = params.activeThreshold ?? defaultActiveThresholdForHonoApi();
	const followingUserQuery = sql`SELECT "followeeId" FROM "following" WHERE "followerId" = ${me.id}`;
	const baseConditions = buildBaseUserSearchConditionsForHonoApi(config, params);

	return [
		[
			...baseConditions,
			sql`"user"."id" IN (${followingUserQuery})`,
			sql`"user"."updatedAt" > ${activeThreshold}`,
		],
		[
			...baseConditions,
			sql`"user"."id" IN (${followingUserQuery})`,
			sql`("user"."updatedAt" IS NULL OR "user"."updatedAt" <= ${activeThreshold})`,
		],
		[
			...baseConditions,
			sql`"user"."id" NOT IN (${followingUserQuery})`,
			sql`"user"."updatedAt" > ${activeThreshold}`,
		],
		[
			...baseConditions,
			sql`"user"."id" NOT IN (${followingUserQuery})`,
			sql`"user"."updatedAt" <= ${activeThreshold}`,
		],
	];
}

function buildSearchUserNoLoginQueriesForHonoApi(
	config: Config,
	params: { username?: string | null; host?: string | null; activeThreshold?: Date },
): SQL[][] {
	const activeThreshold = params.activeThreshold ?? defaultActiveThresholdForHonoApi();
	const baseConditions = buildBaseUserSearchConditionsForHonoApi(config, params);

	return [
		[
			...baseConditions,
			sql`("user"."updatedAt" IS NULL OR "user"."updatedAt" > ${activeThreshold})`,
		],
		[
			...baseConditions,
			sql`"user"."updatedAt" <= ${activeThreshold}`,
		],
	];
}

async function selectSearchUserIdsForHonoApi(
	deps: { db: MiDrizzleDatabase },
	conditions: SQL[],
	limit: number,
): Promise<MiUser['id'][]> {
	if (limit <= 0) return [];

	const result = await deps.db.execute<{ id: MiUser['id'] }>(sql`
		SELECT "user"."id" AS "id"
		FROM "user"
		WHERE ${sql.join(conditions, sql` AND `)}
		ORDER BY "user"."usernameLower" ASC
		LIMIT ${limit}
	`);

	return result.rows.map(row => row.id);
}

const usersSearchByUsernameAndHostParamDef = {
	allOf: [
		{
			anyOf: [
				{
					type: 'object',
					properties: {
						username: { type: 'string', nullable: true },
					},
					required: ['username'],
				},
				{
					type: 'object',
					properties: {
						host: { type: 'string', nullable: true },
					},
					required: ['host'],
				},
			],
		},
		{
			type: 'object',
			properties: {
				limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
				detail: { type: 'boolean', default: true },
			},
		},
	],
} as const;

type UsersSearchByUsernameAndHostParams = {
	username?: string | null;
	host?: string | null;
	limit: number;
	detail: boolean;
};

export async function handleHonoApiUsersSearchByUsernameAndHost(
	deps: UserPackingDependencies,
	me: MiUser | null | undefined,
	body: Record<string, unknown>,
): Promise<unknown[]> {
	const params = parseHonoApiParams(usersSearchByUsernameAndHostParamDef, body) as UsersSearchByUsernameAndHostParams;

	const searchParams = {
		username: 'username' in params ? params.username : undefined,
		host: 'host' in params ? params.host : undefined,
	};

	const queries = me
		? buildSearchUserQueriesForHonoApi(deps.config, me, searchParams)
		: buildSearchUserNoLoginQueriesForHonoApi(deps.config, searchParams);

	let resultSet = new Set<MiUser['id']>();
	const limit = params.limit;
	for (const conditions of queries) {
		const ids = await selectSearchUserIdsForHonoApi(deps, conditions, limit - resultSet.size);
		resultSet = new Set([...resultSet, ...ids]);
		if (resultSet.size >= limit) break;
	}

	const ids = [...resultSet].slice(0, limit);
	return params.detail
		? await packUserDetailedManyForHonoApi(deps, ids, me)
		: await packUserLiteManyForHonoApi(deps, ids);
}

const usersRecommendationParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', default: 0 },
	},
	required: [],
} as const;

type UsersRecommendationParams = {
	limit: number;
	offset: number;
};

export async function handleHonoApiUsersRecommendation(
	deps: UserPackingDependencies,
	me: MiUser,
	body: Record<string, unknown>,
): Promise<unknown[]> {
	const params = parseHonoApiParams(usersRecommendationParamDef, body) as UsersRecommendationParams;
	const users = await listRecommendedUsersFromDatabase(deps.db, me.id, {
		limit: params.limit,
		offset: params.offset,
		updatedAfter: new Date(Date.now() - ms('7days')),
	});

	return await packUserDetailedManyForHonoApi(deps, users, me);
}

const usersGetFrequentlyRepliedUsersParamDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
	},
	required: ['userId'],
} as const;

type UsersGetFrequentlyRepliedUsersParams = {
	userId: string;
	limit: number;
};

function usersGetFrequentlyRepliedUsersNoSuchUserError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such user.',
		code: 'NO_SUCH_USER',
		id: 'e6965129-7b2a-40a4-bae2-cd84cd434822',
	});
}

export async function handleHonoApiUsersGetFrequentlyRepliedUsers(
	deps: UserPackingDependencies,
	me: MiUser | null | undefined,
	body: Record<string, unknown>,
): Promise<{ user: unknown; weight: number }[]> {
	const params = parseHonoApiParams(usersGetFrequentlyRepliedUsersParamDef, body) as UsersGetFrequentlyRepliedUsersParams;

	const user = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (user == null) throw usersGetFrequentlyRepliedUsersNoSuchUserError();

	const repliedUsers = await listFrequentlyRepliedUsersFromDatabase(deps.db, user.id, params.limit);
	if (repliedUsers.length === 0) return [];

	const peak = maximum(repliedUsers.map(row => row.count));
	const topRepliedUserIds = repliedUsers.map(row => row.userId);
	const repliedUserCounts = new Map(repliedUsers.map(row => [row.userId, row.count]));

	const userMap = new Map((await packUserDetailedManyForHonoApi(deps, topRepliedUserIds, me)).map(u => [(u as { id: string }).id, u]));

	return await Promise.all(topRepliedUserIds.map(async userId => ({
		user: userMap.get(userId) ?? await packUserDetailedForHonoApi(deps, await fetchUserByIdOrFailFromDatabase(deps.db, userId), me),
		weight: repliedUserCounts.get(userId)! / peak,
	})));
}

const usersParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', default: 0 },
		sort: { type: 'string', enum: ['+follower', '-follower', '+createdAt', '-createdAt', '+updatedAt', '-updatedAt'] },
		state: { type: 'string', enum: ['all', 'alive'], default: 'all' },
		origin: { type: 'string', enum: ['combined', 'local', 'remote'], default: 'local' },
		hostname: { type: 'string', nullable: true, default: null },
	},
	required: [],
} as const;

type UsersParams = {
	limit: number;
	offset: number;
	sort?: '+follower' | '-follower' | '+createdAt' | '-createdAt' | '+updatedAt' | '-updatedAt';
	state: 'all' | 'alive';
	origin: 'combined' | 'local' | 'remote';
	hostname: string | null;
};

export async function handleHonoApiUsers(
	deps: UserPackingDependencies,
	me: MiUser | null | undefined,
	body: Record<string, unknown>,
): Promise<unknown[]> {
	const params = parseHonoApiParams(usersParamDef, body) as UsersParams;

	const users = await listExplorableUsersFromDatabase(deps.db, {
		limit: params.limit,
		offset: params.offset,
		sort: params.sort,
		state: params.state,
		origin: params.origin,
		hostname: params.hostname,
		meId: me?.id,
	});

	return await packUserDetailedManyForHonoApi(deps, users, me);
}

const usersUpdateMemoParamDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		memo: { type: 'string', nullable: true },
	},
	required: ['userId', 'memo'],
} as const;

type UsersUpdateMemoParams = {
	userId: string;
	memo: string | null;
};

function usersUpdateMemoNoSuchUserError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such user.',
		code: 'NO_SUCH_USER',
		id: '6fef56f3-e765-4957-88e5-c6f65329b8a5',
	});
}

export async function handleHonoApiUsersUpdateMemo(
	deps: UserPackingDependencies,
	me: MiUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(usersUpdateMemoParamDef, body) as UsersUpdateMemoParams;

	const target = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (target == null) throw usersUpdateMemoNoSuchUserError();

	if (params.memo === '' || params.memo == null) {
		await deleteUserMemoFromDatabase(deps.db, me.id, target.id);
		return;
	}

	await upsertUserMemoInDatabase(deps.db, {
		id: genId(deps.config),
		userId: me.id,
		targetUserId: target.id,
		memo: params.memo,
	});
}
