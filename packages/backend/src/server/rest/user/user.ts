/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { DAY } from '@/const.js';
import { z } from 'zod';
import { sql, type SQL } from 'drizzle-orm';
import type * as Redis from 'ioredis';
import type { Config } from '@/config.js';
import * as Acct from '@/misc/acct.js';
import { maximum } from '@/misc/prelude/array.js';
import { listFrequentlyRepliedUsersFromDatabase, listHydratedNotesByIdsFromDatabase } from '@/core/note/NoteStore.js';
import { listAvatarDecorationsFromDatabaseCached } from '@/core/avatar-decoration/AvatarDecorationStore.js';
import { getIdenticonUrl } from '@/core/drive/IdenticonUrl.js';
import {
	listUserNotePiningsByUserIdFromDatabase,
	listUserNotePiningsByUserIdsFromDatabase,
} from '@/core/user/UserNotePiningStore.js';
import { listRoleAssignmentsByUserIdsFromDatabase } from '@/core/role/RoleAssignmentStore.js';
import { listRolesFromDatabase } from '@/core/role/RoleStore.js';
import {
	countUserSecurityKeysByUserIdFromDatabase,
	listUserIdsWithSecurityKeysFromDatabase,
	listUserSecurityKeySummariesByUserIdFromDatabase,
} from '@/core/account/UserSecurityKeyStore.js';
import {
	fetchUserProfileByUserIdOrFailFromDatabase,
	listUserProfilesByUserIdsFromDatabase,
} from '@/core/user/UserProfileStore.js';
import { DEFAULT_POLICIES, type RolePolicies } from '@/core/role/role-policies.js';
import {
	deserializeUser,
	fetchLocalUserByUsernameFromDatabase,
	fetchUserByIdFromDatabase,
	fetchUserByIdOrFailFromDatabase,
	fetchUserByUsernameAndHostFromDatabase,
	listExplorableUsersFromDatabase,
	listRecommendedUsersFromDatabase,
	listUsersByIdsFromDatabase,
	listUsersByUsernamesAndHostsFromDatabase,
	listUsersByUrisOrIdsFromDatabase,
} from '@/core/user/UserStore.js';
import {
	blockingExistsInDatabase,
	listBlockeeIdsByBlockerIdAndBlockeeIdsFromDatabase,
	listBlockerIdsByBlockeeIdAndBlockerIdsFromDatabase,
} from '@/core/user/BlockingStore.js';
import {
	followRequestExistsInDatabase,
	listFollowRequestFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabase,
	listFollowRequestFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase,
} from '@/core/user/FollowRequestStore.js';
import {
	fetchFollowingByFollowerIdAndFolloweeIdFromDatabase,
	followingExistsInDatabase,
	listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase,
	listFollowingsByFollowerIdAndFolloweeIdsFromDatabase,
} from '@/core/user/FollowingStore.js';
import { listMuteeIdsByMuterIdAndMuteeIdsFromDatabase, mutingExistsInDatabase } from '@/core/user/MutingStore.js';
import {
	listRenoteMuteeIdsByMuterIdAndMuteeIdsFromDatabase,
	renoteMutingExistsInDatabase,
} from '@/core/user/RenoteMutingStore.js';
import {
	deleteUserMemoFromDatabase,
	fetchUserMemoTextFromDatabase,
	listUserMemoTextsByUserIdFromDatabase,
	upsertUserMemoInDatabase,
} from '@/core/user/UserMemoStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { omitUndefined } from '@/misc/clone.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { misskeyId, uniqueItems } from '@/misc/zod-params.js';
import type { UserRow } from '@/db/schema/user.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { Packed } from '@/misc/json-schema.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { MiMeta } from '@/models/_.js';
import type { MiRole } from '@/models/Role.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserNotePining } from '@/models/UserNotePining.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import { HonoApiError } from '../error.js';
import { packNoteManyForHonoApi, populateEmojis, populateEmojisMany, type HonoApiNoteDependencies } from '../note/note.js';
import type { HonoChartWriters } from '@/server/chart-runtime.js';
import {
	computeHonoApiUserRoles,
	getHonoApiRolePolicies,
	getHonoApiUserRoles,
	isHonoApiModerator,
	type HonoApiRolePolicyDependencies,
} from '../role/role-policy.js';
import { parseHonoApiParams } from '../validation.js';

export type MeDetailedHonoApiResponse = Record<string, unknown>;
export type UserDetailedNotMeHonoApiResponse = Record<string, unknown> & { id: MiUser['id'] };

export type UserPackingDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	/** pinnedNotes を detail:true で pack するのに必要。省略時 pinnedNotes は空配列になる (pinnedNoteIds は常に入る)。 */
	redis?: Redis.Redis;
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

function getHonoApiUserPolicies(config: Config, meta: MiMeta): RolePolicies {
	const policies = { ...DEFAULT_POLICIES, ...meta.policies };
	const serverMaxFileSizeMb = Math.floor(config.limits.maximumFileSizeBytes / (1024 * 1024));

	return {
		...policies,
		maxFileSizeMb: Math.min(serverMaxFileSizeMb, policies.maxFileSizeMb),
	};
}

function packUserLiteCoreForHonoApi(
	deps: UserPackingDependencies,
	user: MiUser,
	avatarDecorations: HonoApiAvatarDecorationLite[],
	emojis: Record<string, string>,
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
		emojis,
		onlineStatus: getOnlineStatus(user),
		badgeRoles: [],
	};
}

async function buildHonoApiAvatarDecorations(
	deps: UserPackingDependencies,
	users: MiUser[],
): Promise<Map<MiUser['id'], HonoApiAvatarDecorationLite[]>> {
	const usersWithDecorations = users.filter((user) => user.avatarDecorations.length > 0);
	if (usersWithDecorations.length === 0) return new Map();

	const decorations = await listAvatarDecorationsFromDatabaseCached(deps.db);
	const decorationById = new Map(decorations.map((decoration) => [decoration.id, decoration]));
	const map = new Map<MiUser['id'], HonoApiAvatarDecorationLite[]>();

	for (const user of usersWithDecorations) {
		map.set(
			user.id,
			user.avatarDecorations.flatMap((userDecoration) => {
				const decoration = decorationById.get(userDecoration.id);
				if (decoration == null) return [];
				return [
					{
						id: userDecoration.id,
						...(userDecoration.angle ? { angle: userDecoration.angle } : {}),
						...(userDecoration.flipH ? { flipH: true } : {}),
						...(userDecoration.offsetX ? { offsetX: userDecoration.offsetX } : {}),
						...(userDecoration.offsetY ? { offsetY: userDecoration.offsetY } : {}),
						url: decoration.url,
					},
				];
			}),
		);
	}

	return map;
}

export async function packUserLiteForHonoApi(
	deps: UserPackingDependencies,
	src: MiUser['id'] | MiUser,
): Promise<Packed<'UserLite'>> {
	const user = typeof src === 'object' ? src : await fetchUserByIdOrFailFromDatabase(deps.db, src);
	const avatarDecorations = await buildHonoApiAvatarDecorations(deps, [user]);
	const emojis = await populateEmojis(deps, user.emojis, user.host);

	return packUserLiteCoreForHonoApi(deps, user, avatarDecorations.get(user.id) ?? [], emojis);
}

/** srcs (MiUser本体 or ID) を MiUser[] に解決する。バッチ取得で見つからなかったIDは1件ずつ fetchUserByIdOrFailFromDatabase にフォールバックする (見つからなければ throw)。 */
async function resolveUsersFromSrcsForHonoApi(
	deps: UserPackingDependencies,
	srcs: (MiUser['id'] | MiUser)[],
): Promise<MiUser[]> {
	const explicitUsers = srcs.filter((src): src is MiUser => typeof src === 'object');
	const ids = [...new Set(srcs.filter((src): src is string => typeof src === 'string'))];
	const fetchedUsers = ids.length > 0 ? await listUsersByIdsFromDatabase(deps.db, ids, { includeSuspended: true }) : [];
	const userById = new Map([...explicitUsers, ...fetchedUsers].map((user) => [user.id, user]));
	const missingIds = ids.filter((id) => !userById.has(id));
	if (missingIds.length > 0) {
		for (const user of await Promise.all(missingIds.map((id) => fetchUserByIdOrFailFromDatabase(deps.db, id)))) {
			userById.set(user.id, user);
		}
	}

	return srcs.map((src) => (typeof src === 'object' ? src : userById.get(src)!));
}

async function populateUserEmojisManyForHonoApi(
	deps: UserPackingDependencies,
	users: MiUser[],
): Promise<Map<MiUser['id'], Record<string, string>>> {
	const resolved = await populateEmojisMany(
		deps,
		users.map((user) => ({
			emojiNames: user.emojis,
			noteUserHost: user.host,
		})),
	);

	return new Map(users.map((user, index) => [user.id, resolved[index]!]));
}

export async function packUserLiteManyForHonoApi(
	deps: UserPackingDependencies,
	srcs: (MiUser['id'] | MiUser)[],
): Promise<Packed<'UserLite'>[]> {
	const users = await resolveUsersFromSrcsForHonoApi(deps, srcs);
	const avatarDecorations = await buildHonoApiAvatarDecorations(deps, users);
	const emojisByUserId = await populateUserEmojisManyForHonoApi(deps, users);

	return users.map((user) =>
		packUserLiteCoreForHonoApi(deps, user, avatarDecorations.get(user.id) ?? [], emojisByUserId.get(user.id) ?? {}),
	);
}

type UserRelationForPack = Awaited<ReturnType<typeof getUserRelationForHonoApi>>;

type UserDetailedExtras = {
	roles: {
		id: string;
		name: string;
		color: string | null;
		iconUrl: string | null;
		description: string;
		isModerator: boolean;
		isAdministrator: boolean;
		displayOrder: number;
	}[];
	badgeRoles: { name: string; iconUrl: string | null; displayOrder: number }[] | undefined;
	isSilenced: boolean;
	canChat: boolean;
	pinnedNoteIds: string[];
	pinnedNotes: unknown[];
	iAmModerator: boolean;
	relation: UserRelationForPack | null;
	twoFactor: { twoFactorEnabled: boolean; usePasswordLessLogin: boolean; securityKeys: boolean } | null;
	moderationNote: string | undefined;
};

/**
 * relation は me が別ユーザーの場合のみ、twoFactor は本人またはモデレーターが閲覧する場合のみ返す。
 */
async function buildUserDetailedExtrasForHonoApi(
	deps: UserPackingDependencies,
	user: MiUser,
	profile: MiUserProfile,
	me: { id: MiUser['id'] } | null | undefined,
	hint?: {
		iAmModerator?: boolean;
		relation?: UserRelationForPack | null;
		/** 一覧pack用の事前計算値。ユーザー毎の roles(2クエリ)/pins(1クエリ) を回避する */
		userRoles?: MiRole[];
		policies?: RolePolicies;
		pins?: MiUserNotePining[];
		pinnedNotes?: Packed<'Note'>[];
		hasSecurityKey?: boolean;
	},
): Promise<UserDetailedExtras> {
	const isMe = me != null && me.id === user.id;
	let iAmModerator = hint?.iAmModerator ?? false;
	if (hint?.iAmModerator === undefined && me != null) {
		const meUser = isMe ? user : await fetchUserByIdFromDatabase(deps.db, me.id);
		iAmModerator = meUser != null && (await isHonoApiModerator(deps, meUser));
	}

	const userRoles = hint?.userRoles ?? (await getHonoApiUserRoles(deps, user));
	const policies = hint?.policies ?? (await getHonoApiRolePolicies(deps, user, userRoles));

	const pins = hint?.pins ?? (await listUserNotePiningsByUserIdFromDatabase(deps.db, user.id, { order: 'desc' }));
	const pinnedNoteIds = pins.map((pin) => pin.noteId);
	let pinnedNotes: unknown[] = hint?.pinnedNotes ?? [];
	if (hint?.pinnedNotes == null && pinnedNoteIds.length > 0 && deps.redis != null) {
		const notes = await listHydratedNotesByIdsFromDatabase(deps.db, pinnedNoteIds);
		const noteById = new Map(notes.map((note) => [note.id, note]));
		const orderedNotes = pinnedNoteIds.map((id) => noteById.get(id)).filter((note) => note != null);
		pinnedNotes = await packNoteManyForHonoApi(
			deps as UserPackingDependencies & HonoApiNoteDependencies,
			orderedNotes,
			me,
			{ detail: true },
		);
	}

	const relation =
		hint?.relation !== undefined
			? hint.relation
			: me != null && !isMe
				? await getUserRelationForHonoApi(deps, me.id, user.id)
				: null;

	const twoFactor =
		isMe || iAmModerator
			? {
					twoFactorEnabled: profile.twoFactorEnabled,
					usePasswordLessLogin: profile.usePasswordLessLogin,
					securityKeys: profile.twoFactorEnabled
						? (hint?.hasSecurityKey ?? (await countUserSecurityKeysByUserIdFromDatabase(deps.db, user.id)) >= 1)
						: false,
				}
			: null;

	return {
		roles: userRoles
			.filter((role) => role.isPublic)
			.sort((a, b) => b.displayOrder - a.displayOrder)
			.map((role) => ({
				id: role.id,
				name: role.name,
				color: role.color,
				iconUrl: role.iconUrl,
				description: role.description,
				isModerator: role.isModerator,
				isAdministrator: role.isAdministrator,
				displayOrder: role.displayOrder,
			})),
		badgeRoles:
			deps.meta.showRoleBadgesOfRemoteUsers || user.host == null
				? userRoles
						.filter((role) => role.asBadge && (role.isPublic || iAmModerator))
						.sort((a, b) => b.displayOrder - a.displayOrder)
						.map((role) => ({ name: role.name, iconUrl: role.iconUrl, displayOrder: role.displayOrder }))
				: undefined,
		isSilenced: !policies.canPublicNote,
		canChat: policies.chatAvailability === 'available',
		pinnedNoteIds,
		pinnedNotes,
		iAmModerator,
		relation,
		twoFactor,
		moderationNote: iAmModerator ? (profile.moderationNote ?? '') : undefined,
	};
}

export async function packUserDetailedNotMeForHonoApi(
	deps: UserPackingDependencies,
	user: MiUser,
	me?: { id: MiUser['id'] } | null,
): Promise<UserDetailedNotMeHonoApiResponse> {
	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);
	const memo = me ? await fetchUserMemoTextFromDatabase(deps.db, me.id, user.id) : null;
	const extras = await buildUserDetailedExtrasForHonoApi(deps, user, profile, me);

	return packUserDetailedNotMeCoreForHonoApi(deps, user, profile, memo, extras);
}

export async function packUserDetailedNotMeManyForHonoApi(
	deps: UserPackingDependencies,
	srcs: (MiUser['id'] | MiUser)[],
	me?: { id: MiUser['id'] } | null,
): Promise<UserDetailedNotMeHonoApiResponse[]> {
	const users = await resolveUsersFromSrcsForHonoApi(deps, srcs);
	const userIds = [...new Set(users.map((user) => user.id))];
	const profiles = await listUserProfilesByUserIdsFromDatabase(deps.db, userIds);
	const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));
	const memoByTargetUserId = me ? await listUserMemoTextsByUserIdFromDatabase(deps.db, me.id) : null;

	const meUser = me != null ? await fetchUserByIdFromDatabase(deps.db, me.id) : null;
	const iAmModerator = meUser != null && (await isHonoApiModerator(deps, meUser));
	const relationByUserId =
		me != null
			? await getUserRelationsForHonoApi(
					deps,
					me.id,
					users.filter((user) => user.id !== me.id).map((user) => user.id),
				)
			: null;

	// ロール・割り当て・ピンは一覧単位の3クエリで取得する。
	// ユーザー単位で取得すると、3分間に role_assignment/role 各68k回、pining 54k回のクエリが発生する。
	const [allRoles, allAssignments, allPins] = await Promise.all([
		listRolesFromDatabase(deps.db),
		listRoleAssignmentsByUserIdsFromDatabase(deps.db, userIds),
		listUserNotePiningsByUserIdsFromDatabase(deps.db, userIds, { order: 'desc' }),
	]);
	const [securityKeyUserIds, alsoKnownAsByUserId, emojisByUserId] = await Promise.all([
		me != null
			? listUserIdsWithSecurityKeysFromDatabase(
					deps.db,
					users
						.filter((user) => (iAmModerator || user.id === me.id) && profileByUserId.get(user.id)?.twoFactorEnabled)
						.map((user) => user.id),
				)
			: Promise.resolve([]),
		resolveAlsoKnownAsManyForHonoApi(deps, users),
		populateUserEmojisManyForHonoApi(deps, users),
	]);
	const securityKeyUserIdSet = new Set(securityKeyUserIds);
	const assignmentsByUserId = new Map<string, typeof allAssignments>();
	for (const assignment of allAssignments) {
		let list = assignmentsByUserId.get(assignment.userId);
		if (!list) {
			list = [];
			assignmentsByUserId.set(assignment.userId, list);
		}
		list.push(assignment);
	}
	const pinsByUserId = new Map<string, typeof allPins>();
	for (const pin of allPins) {
		let list = pinsByUserId.get(pin.userId);
		if (!list) {
			list = [];
			pinsByUserId.set(pin.userId, list);
		}
		list.push(pin);
	}
	const allPinnedNoteIds = [...new Set(allPins.map((pin) => pin.noteId))];
	const packedPinnedNoteById = new Map<string, Packed<'Note'>>();
	if (allPinnedNoteIds.length > 0 && deps.redis != null) {
		const notes = await listHydratedNotesByIdsFromDatabase(deps.db, allPinnedNoteIds);
		const noteById = new Map(notes.map((note) => [note.id, note]));
		const orderedNotes = allPinnedNoteIds.map((id) => noteById.get(id)).filter((note) => note != null);
		const packedPinnedNotes = await packNoteManyForHonoApi(
			deps as UserPackingDependencies & HonoApiNoteDependencies,
			orderedNotes,
			me,
			{ detail: true },
		);
		for (const note of packedPinnedNotes) {
			packedPinnedNoteById.set(note.id, note);
		}
	}

	return await Promise.all(
		users.map(async (user) => {
			const profile =
				profileByUserId.get(user.id) ?? (await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id));
			const pins = pinsByUserId.get(user.id) ?? [];
			const hasSecurityKey =
				me != null && (iAmModerator || user.id === me.id) && profile.twoFactorEnabled
					? securityKeyUserIdSet.has(user.id)
					: undefined;
			const extras = await buildUserDetailedExtrasForHonoApi(
				deps,
				user,
				profile,
				me,
				omitUndefined({
					iAmModerator,
					relation: relationByUserId?.get(user.id) ?? null,
					userRoles: computeHonoApiUserRoles(deps, user, allRoles, assignmentsByUserId.get(user.id) ?? []),
					pins,
					pinnedNotes: pins.map((pin) => packedPinnedNoteById.get(pin.noteId)).filter((note) => note != null),
					hasSecurityKey,
				}),
			);
			return packUserDetailedNotMeCoreForHonoApi(
				deps,
				user,
				profile,
				memoByTargetUserId ? (memoByTargetUserId.get(user.id) ?? null) : null,
				extras,
				omitUndefined({
					alsoKnownAs: alsoKnownAsByUserId.get(user.id),
					emojis: emojisByUserId.get(user.id),
				}),
			);
		}),
	);
}

export async function resolveAlsoKnownAsForHonoApi(
	deps: UserPackingDependencies,
	alsoKnownAs: string[] | null,
): Promise<string[] | null> {
	if (alsoKnownAs == null || alsoKnownAs.length === 0) return null;

	const localPrefix = `${deps.config.instance.url}/users/`;
	const remoteUris = alsoKnownAs.filter((uri) => !uri.startsWith(localPrefix));
	const remoteUsers =
		remoteUris.length > 0 ? await listUsersByUrisOrIdsFromDatabase(deps.db, { uris: remoteUris, ids: [] }) : [];
	const remoteIdByUri = new Map(remoteUsers.map((u) => [u.uri, u.id]));

	return alsoKnownAs
		.map((uri) => (uri.startsWith(localPrefix) ? uri.slice(localPrefix.length) : (remoteIdByUri.get(uri) ?? null)))
		.filter((id): id is string => id != null);
}

async function resolveAlsoKnownAsManyForHonoApi(
	deps: UserPackingDependencies,
	users: MiUser[],
): Promise<Map<MiUser['id'], string[] | null>> {
	const localPrefix = `${deps.config.instance.url}/users/`;
	const remoteUris = [
		...new Set(users.flatMap((user) => user.alsoKnownAs ?? []).filter((uri) => !uri.startsWith(localPrefix))),
	];
	const remoteUsers =
		remoteUris.length > 0 ? await listUsersByUrisOrIdsFromDatabase(deps.db, { uris: remoteUris, ids: [] }) : [];
	const remoteIdByUri = new Map(
		remoteUsers.filter((user): user is MiUser & { uri: string } => user.uri != null).map((user) => [user.uri, user.id]),
	);

	const resolvedByUserId = new Map<MiUser['id'], string[] | null>();
	for (const user of users) {
		if (user.alsoKnownAs == null || user.alsoKnownAs.length === 0) {
			resolvedByUserId.set(user.id, null);
			continue;
		}

		resolvedByUserId.set(
			user.id,
			user.alsoKnownAs
				.map((uri) => (uri.startsWith(localPrefix) ? uri.slice(localPrefix.length) : (remoteIdByUri.get(uri) ?? null)))
				.filter((id): id is string => id != null),
		);
	}

	return resolvedByUserId;
}

async function packUserDetailedNotMeCoreForHonoApi(
	deps: UserPackingDependencies,
	user: MiUser,
	profile: MiUserProfile,
	memo: string | null,
	extras: UserDetailedExtras,
	hint?: {
		alsoKnownAs?: string[] | null;
		emojis?: Record<string, string>;
	},
): Promise<UserDetailedNotMeHonoApiResponse> {
	const alsoKnownAs =
		hint?.alsoKnownAs !== undefined ? hint.alsoKnownAs : await resolveAlsoKnownAsForHonoApi(deps, user.alsoKnownAs);
	const emojis = hint?.emojis ?? (await populateEmojis(deps, user.emojis, user.host));

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
		emojis,
		onlineStatus: getOnlineStatus(user),
		badgeRoles: extras.badgeRoles,
		url: profile.url,
		uri: user.uri,
		movedTo: null,
		alsoKnownAs,
		createdAt: parseId(user.id).date.toISOString(),
		updatedAt: user.updatedAt ? user.updatedAt.toISOString() : null,
		lastFetchedAt: user.lastFetchedAt ? user.lastFetchedAt.toISOString() : null,
		bannerUrl: user.bannerId == null ? null : user.bannerUrl,
		bannerBlurhash: user.bannerId == null ? null : user.bannerBlurhash,
		isLocked: user.isLocked,
		isSilenced: extras.isSilenced,
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
		pinnedNoteIds: extras.pinnedNoteIds,
		pinnedNotes: extras.pinnedNotes,
		pinnedPageId: profile.pinnedPageId,
		pinnedPage: null,
		publicReactions: user.host == null ? profile.publicReactions : false,
		followingVisibility: profile.followingVisibility,
		followersVisibility: profile.followersVisibility,
		chatScope: user.chatScope,
		canChat: extras.canChat,
		roles: extras.roles,
		memo,
		moderationNote: extras.moderationNote,
		...extras.twoFactor,
		...(extras.relation
			? {
					isFollowing: extras.relation.isFollowing,
					isFollowed: extras.relation.isFollowed,
					hasPendingFollowRequestFromYou: extras.relation.hasPendingFollowRequestFromYou,
					hasPendingFollowRequestToYou: extras.relation.hasPendingFollowRequestToYou,
					isBlocking: extras.relation.isBlocking,
					isBlocked: extras.relation.isBlocked,
					isMuted: extras.relation.isMuted,
					isRenoteMuted: extras.relation.isRenoteMuted,
					notify: extras.relation.following?.notify ?? 'none',
					withReplies: extras.relation.following?.withReplies ?? false,
					followedMessage: extras.relation.isFollowing ? profile.followedMessage : undefined,
				}
			: {}),
	};
}

function getOnlineStatus(user: MiUser): 'unknown' | 'online' | 'active' | 'offline' {
	if (user.hideOnlineStatus) return 'unknown';
	if (user.lastActiveDate == null) return 'unknown';

	const elapsed = Date.now() - user.lastActiveDate.getTime();

	return elapsed < 1000 * 60 * 10 ? 'online' : elapsed < 1000 * 60 * 60 * 24 * 3 ? 'active' : 'offline';
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
	const profile = options.profile ?? (await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id));
	const userRoles = await getHonoApiUserRoles(deps, user);
	const policies = await getHonoApiRolePolicies(deps, user, userRoles);
	const isRoot = deps.meta.rootUserId === user.id;
	const isAdmin = isRoot || userRoles.some((role) => role.isAdministrator);
	const isModerator = isRoot || userRoles.some((role) => role.isModerator || role.isAdministrator);
	const alsoKnownAs = await resolveAlsoKnownAsForHonoApi(deps, user.alsoKnownAs);
	const memo = await fetchUserMemoTextFromDatabase(deps.db, user.id, user.id);
	const extras = await buildUserDetailedExtrasForHonoApi(
		deps,
		user,
		profile,
		{ id: user.id },
		{
			iAmModerator: isModerator,
			relation: null,
			userRoles,
			policies,
		},
	);

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
		emojis: await populateEmojis(deps, user.emojis, user.host),
		onlineStatus: getOnlineStatus(user),
		badgeRoles: extras.badgeRoles,
		url: profile.url,
		uri: user.uri,
		movedTo: null,
		alsoKnownAs,
		createdAt: parseId(user.id).date.toISOString(),
		updatedAt: user.updatedAt ? user.updatedAt.toISOString() : null,
		lastFetchedAt: user.lastFetchedAt ? user.lastFetchedAt.toISOString() : null,
		bannerUrl: user.bannerId == null ? null : user.bannerUrl,
		bannerBlurhash: user.bannerId == null ? null : user.bannerBlurhash,
		isLocked: user.isLocked,
		isSilenced: extras.isSilenced,
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
		pinnedNoteIds: extras.pinnedNoteIds,
		pinnedNotes: extras.pinnedNotes,
		pinnedPageId: profile.pinnedPageId,
		pinnedPage: null,
		publicReactions: user.host == null ? profile.publicReactions : false,
		followingVisibility: profile.followingVisibility,
		followersVisibility: profile.followersVisibility,
		chatScope: user.chatScope,
		canChat: extras.canChat,
		roles: extras.roles,
		memo,
		twoFactorEnabled: profile.twoFactorEnabled,
		usePasswordLessLogin: profile.usePasswordLessLogin,
		securityKeys: profile.twoFactorEnabled
			? (await countUserSecurityKeysByUserIdFromDatabase(deps.db, user.id)) >= 1
			: false,
		avatarId: user.avatarId,
		bannerId: user.bannerId,
		followedMessage: profile.followedMessage,
		isModerator,
		isAdmin,
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
		...(options.includeSecrets
			? {
					email: profile.email,
					emailVerified: profile.emailVerified,
					securityKeysList: profile.twoFactorEnabled
						? await listUserSecurityKeySummariesByUserIdFromDatabase(deps.db, user.id)
						: [],
				}
			: {}),
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

	const users = await resolveUsersFromSrcsForHonoApi(deps, srcs);
	const meIndex = users.findIndex((user) => user.id === me.id);
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

export const pinnedUsersParamDef = z.object({});

export async function handleHonoApiPinnedUsers(
	deps: UserPackingDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<(MeDetailedHonoApiResponse | UserDetailedNotMeHonoApiResponse)[]> {
	parseHonoApiParams(pinnedUsersParamDef, body);

	const accounts = deps.meta.pinnedUsers.map((acct) => Acct.parse(acct));
	const users = await listUsersByUsernamesAndHostsFromDatabase(deps.db, accounts);
	const userByAccount = new Map(users.map((user) => [`${user.username.toLowerCase()}@${user.host ?? ''}`, user]));
	const orderedUsers = accounts
		.map((account) => userByAccount.get(`${account.username.toLowerCase()}@${account.host ?? ''}`))
		.filter((user) => user != null);

	return await packUserDetailedManyForHonoApi(deps, orderedUsers, me);
}

export type HonoApiUsersShowDependencies = UserPackingDependencies &
	HonoApiRolePolicyDependencies & {
		chartWriters: HonoChartWriters;
	};

function usersShowFailedToResolveRemoteUserError(): HonoApiError {
	return new HonoApiError({
		status: 500,
		message: 'Failed to resolve remote user.',
		code: 'FAILED_TO_RESOLVE_REMOTE_USER',
		id: 'ef7b9be4-9cba-4e6f-ab41-90ed171c7d3c',
		kind: 'server',
	});
}

function usersShowNoSuchUserError(): HonoApiError {
	return new HonoApiError({
		status: 404,
		message: 'No such user.',
		code: 'NO_SUCH_USER',
		id: '4362f8dc-731f-4ad8-a694-be5a88922a24',
	});
}

/**
 * 旧 ajv の `allOf` (anyOf分岐セレクタ + host共通プロパティ) を、分岐ごとに独立した
 * z.object を z.union で束ねる形で再現する。各分岐は自分の識別子プロパティのみを検証し、
 * 他の分岐のプロパティは (元の ajv の anyOf+properties と同様) 検証対象外になる。
 */
const usersShowHostSchema = z.string().nullable().optional().describe('The local host is represented with `null`.');

export const usersShowParamDef = z.union([
	z.object({ userId: misskeyId(), host: usersShowHostSchema }),
	z.object({ userIds: uniqueItems(z.array(misskeyId())), host: usersShowHostSchema }),
	z.object({ username: z.string(), host: usersShowHostSchema }),
]);

type UsersShowParams =
	| { userId: string; host?: string | null }
	| { userIds: string[]; host?: string | null }
	| { username: string; host?: string | null };

export async function handleHonoApiUsersShow(
	deps: HonoApiUsersShowDependencies,
	me: MiUser | null | undefined,
	body: Record<string, unknown>,
	ip: string | null,
): Promise<
	| (MeDetailedHonoApiResponse | UserDetailedNotMeHonoApiResponse)
	| (MeDetailedHonoApiResponse | UserDetailedNotMeHonoApiResponse)[]
> {
	const params = parseHonoApiParams(usersShowParamDef, body);

	const isModerator = await isHonoApiModerator(deps, me ?? null);

	if ('username' in params) {
		params.username = params.username.trim();
	}

	if ('userIds' in params) {
		if (params.userIds.length === 0) return [];

		const users = await listUsersByIdsFromDatabase(deps.db, params.userIds, { includeSuspended: isModerator });
		const userById = new Map(users.map((user) => [user.id, user]));

		const ordered: MiUser[] = [];
		for (const id of params.userIds) {
			const user = userById.get(id);
			if (user != null) ordered.push(user);
		}

		const packedMap = new Map(
			(await packUserDetailedManyForHonoApi(deps, ordered, me)).map((packed, i) => [ordered[i]!.id, packed]),
		);
		return ordered.map((u) => packedMap.get(u.id)!);
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

export const usersRelationParamDef = z.object({
	userId: z.union([misskeyId(), z.array(misskeyId())]),
});

type UsersRelationParams = { userId: string | string[] };

export type HonoApiUsersRelationDependencies = {
	db: MiDrizzleDatabase;
};

async function getUserRelationForHonoApi(
	deps: HonoApiUsersRelationDependencies,
	me: MiUser['id'],
	target: MiUser['id'],
) {
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

async function getUserRelationsForHonoApi(
	deps: HonoApiUsersRelationDependencies,
	me: MiUser['id'],
	targets: MiUser['id'][],
) {
	const targetIds = [...new Set(targets)];
	if (targetIds.length === 0) return new Map();

	const [followers, followees, followersRequests, followeesRequests, blockers, blockees, muters, renoteMuters] =
		await Promise.all([
			listFollowingsByFollowerIdAndFolloweeIdsFromDatabase(deps.db, me, targetIds).then(
				(f) => new Map(f.map((it) => [it.followeeId, it])),
			),
			listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase(deps.db, me, targetIds),
			listFollowRequestFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabase(deps.db, me, targetIds),
			listFollowRequestFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase(deps.db, me, targetIds),
			listBlockeeIdsByBlockerIdAndBlockeeIdsFromDatabase(deps.db, me, targetIds),
			listBlockerIdsByBlockeeIdAndBlockerIdsFromDatabase(deps.db, me, targetIds),
			listMuteeIdsByMuterIdAndMuteeIdsFromDatabase(deps.db, me, targetIds),
			listRenoteMuteeIdsByMuterIdAndMuteeIdsFromDatabase(deps.db, me, targetIds),
		]);
	const followeeSet = new Set(followees);
	const followersRequestSet = new Set(followersRequests);
	const followeesRequestSet = new Set(followeesRequests);
	const blockerSet = new Set(blockers);
	const blockeeSet = new Set(blockees);
	const muterSet = new Set(muters);
	const renoteMuterSet = new Set(renoteMuters);

	return new Map(
		targetIds.map((target) => {
			const following = followers.get(target) ?? null;

			return [
				target,
				{
					id: target,
					following,
					isFollowing: following != null,
					isFollowed: followeeSet.has(target),
					hasPendingFollowRequestFromYou: followersRequestSet.has(target),
					hasPendingFollowRequestToYou: followeesRequestSet.has(target),
					isBlocking: blockerSet.has(target),
					isBlocked: blockeeSet.has(target),
					isMuted: muterSet.has(target),
					isRenoteMuted: renoteMuterSet.has(target),
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
	const params = parseHonoApiParams(usersRelationParamDef, body);

	return Array.isArray(params.userId)
		? await getUserRelationsForHonoApi(deps, me.id, params.userId).then((it) => [...it.values()])
		: await getUserRelationForHonoApi(deps, me.id, params.userId).then((it) => [it]);
}

function limitOffsetSqlForHonoApi(options: { limit?: number; offset?: number }): SQL {
	return sql.join(
		[
			options.limit == null ? sql`` : sql`LIMIT ${options.limit}`,
			options.offset == null ? sql`` : sql`OFFSET ${options.offset}`,
		],
		sql` `,
	);
}

async function searchUsersForHonoApi(
	deps: { db: MiDrizzleDatabase },
	query: string,
	meId: MiUser['id'] | null,
	options: { limit?: number; offset?: number; origin?: 'local' | 'remote' | 'combined' } = {},
): Promise<MiUser[]> {
	const activeThreshold = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
	const isUsername = query.startsWith('@') && !query.includes(' ') && !query.includes('@', 1);
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
	let users = nameResult.rows.map((row) => deserializeUser(row));

	if (users.length < (options.limit ?? 30)) {
		const profileConditions: SQL[] = [sql`"prof"."description" ILIKE ${'%' + sqlLikeEscape(query) + '%'}`];

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

		users = users.concat(profileResult.rows.map((row) => deserializeUser(row)));
	}

	return users;
}

export const usersSearchParamDef = z.object({
	query: z.string(),
	offset: z.number().int().default(0),
	limit: z.number().int().min(1).max(100).default(10),
	origin: z.enum(['local', 'remote', 'combined']).default('combined'),
	detail: z.boolean().default(true),
});

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
	const params = parseHonoApiParams(usersSearchParamDef, body);
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
		if (params.host === config.runtime.hostname || params.host === '.') {
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
		[...baseConditions, sql`"user"."id" IN (${followingUserQuery})`, sql`"user"."updatedAt" > ${activeThreshold}`],
		[
			...baseConditions,
			sql`"user"."id" IN (${followingUserQuery})`,
			sql`("user"."updatedAt" IS NULL OR "user"."updatedAt" <= ${activeThreshold})`,
		],
		[...baseConditions, sql`"user"."id" NOT IN (${followingUserQuery})`, sql`"user"."updatedAt" > ${activeThreshold}`],
		[...baseConditions, sql`"user"."id" NOT IN (${followingUserQuery})`, sql`"user"."updatedAt" <= ${activeThreshold}`],
	];
}

function buildSearchUserNoLoginQueriesForHonoApi(
	config: Config,
	params: { username?: string | null; host?: string | null; activeThreshold?: Date },
): SQL[][] {
	const activeThreshold = params.activeThreshold ?? defaultActiveThresholdForHonoApi();
	const baseConditions = buildBaseUserSearchConditionsForHonoApi(config, params);

	return [
		[...baseConditions, sql`("user"."updatedAt" IS NULL OR "user"."updatedAt" > ${activeThreshold})`],
		[...baseConditions, sql`"user"."updatedAt" <= ${activeThreshold}`],
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

	return result.rows.map((row) => row.id);
}

/**
 * 旧 ajv の `allOf` (username/host いずれかを要求する anyOf 分岐セレクタ + limit/detail 共通プロパティ) を、
 * usersShowParamDef と同様に分岐ごとの z.object を z.union で束ねる形で再現する。
 */
const usersSearchByUsernameAndHostCommon = {
	limit: z.number().int().min(1).max(100).default(10),
	detail: z.boolean().default(true),
};

export const usersSearchByUsernameAndHostParamDef = z.union([
	z.object({ username: z.string().nullable(), ...usersSearchByUsernameAndHostCommon }),
	z.object({ host: z.string().nullable(), ...usersSearchByUsernameAndHostCommon }),
]);

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
	const params = parseHonoApiParams(usersSearchByUsernameAndHostParamDef, body);

	const searchParams = omitUndefined({
		username: 'username' in params ? params.username : undefined,
		host: 'host' in params ? params.host : undefined,
	});

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

export const usersRecommendationParamDef = z.object({
	limit: z.number().int().min(1).max(100).default(10),
	offset: z.number().int().default(0),
});

type UsersRecommendationParams = {
	limit: number;
	offset: number;
};

export async function handleHonoApiUsersRecommendation(
	deps: UserPackingDependencies,
	me: MiUser,
	body: Record<string, unknown>,
): Promise<unknown[]> {
	const params = parseHonoApiParams(usersRecommendationParamDef, body);
	const users = await listRecommendedUsersFromDatabase(deps.db, me.id, {
		limit: params.limit,
		offset: params.offset,
		updatedAfter: new Date(Date.now() - 7 * DAY),
	});

	return await packUserDetailedManyForHonoApi(deps, users, me);
}

export const usersGetFrequentlyRepliedUsersParamDef = z.object({
	userId: misskeyId(),
	limit: z.number().int().min(1).max(100).default(10),
});

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
	const params = parseHonoApiParams(usersGetFrequentlyRepliedUsersParamDef, body);

	const user = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (user == null) throw usersGetFrequentlyRepliedUsersNoSuchUserError();

	const repliedUsers = await listFrequentlyRepliedUsersFromDatabase(deps.db, user.id, params.limit);
	if (repliedUsers.length === 0) return [];

	const peak = maximum(repliedUsers.map((row) => row.count));
	const topRepliedUserIds = repliedUsers.map((row) => row.userId);
	const repliedUserCounts = new Map(repliedUsers.map((row) => [row.userId, row.count]));

	const userMap = new Map(
		(await packUserDetailedManyForHonoApi(deps, topRepliedUserIds, me)).map((u) => [(u as { id: string }).id, u]),
	);

	return await Promise.all(
		topRepliedUserIds.map(async (userId) => ({
			user:
				userMap.get(userId) ??
				(await packUserDetailedForHonoApi(deps, await fetchUserByIdOrFailFromDatabase(deps.db, userId), me)),
			weight: repliedUserCounts.get(userId)! / peak,
		})),
	);
}

export const usersParamDef = z.object({
	limit: z.number().int().min(1).max(100).default(10),
	offset: z.number().int().default(0),
	sort: z.enum(['+follower', '-follower', '+createdAt', '-createdAt', '+updatedAt', '-updatedAt']).optional(),
	state: z.enum(['all', 'alive']).default('all'),
	origin: z.enum(['combined', 'local', 'remote']).default('local'),
	hostname: z.string().nullable().default(null),
});

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
	const params = parseHonoApiParams(usersParamDef, body);

	const users = await listExplorableUsersFromDatabase(
		deps.db,
		omitUndefined({
			limit: params.limit,
			offset: params.offset,
			sort: params.sort,
			state: params.state,
			origin: params.origin,
			hostname: params.hostname,
			meId: me?.id,
		}),
	);

	return await packUserDetailedManyForHonoApi(deps, users, me);
}

export const usersUpdateMemoParamDef = z.object({
	userId: misskeyId(),
	memo: z.string().nullable(),
});

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
	const params = parseHonoApiParams(usersUpdateMemoParamDef, body);

	const target = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (target == null) throw usersUpdateMemoNoSuchUserError();

	if (params.memo === '' || params.memo == null) {
		await deleteUserMemoFromDatabase(deps.db, me.id, target.id);
		return;
	}

	await upsertUserMemoInDatabase(deps.db, {
		id: genId(),
		userId: me.id,
		targetUserId: target.id,
		memo: params.memo,
	});
}
