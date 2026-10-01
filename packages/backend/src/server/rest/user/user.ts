/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { endpointMetas as usersContracts } from '@/server/rest/contracts/users.js';
import type { ContractErrors } from '../endpoint-contract.js';
import type { ApiParams } from '../validation.js';
import { DAY } from '@/const.js';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { estimateRows } from '@/db/estimate.js';
import type { SQL } from 'drizzle-orm';
import type { Config } from '@/config.js';
import * as Acct from '@/misc/acct.js';
import { maximum } from '@/misc/prelude/array.js';
import { listFrequentlyRepliedUsersFromDatabase, listHydratedNotesByIdsFromDatabase } from '@/core/note/NoteStore.js';
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
import type { RolePolicies } from '@/core/role/role-policies.js';
import {
	deserializeUser,
	fetchLocalUserByUsernameFromDatabase,
	fetchUserByIdFromDatabase,
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
import type { MiRole } from '@/models/Role.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserNotePining } from '@/models/UserNotePining.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import { ApiError } from '../error.js';
import { populateEmojis } from '../../../core/note/note-packing.js';
import { packNoteManyForApi } from '../note/note.js';
import type { NoteDependencies } from '../../../core/note/note-packing.js';
import type { ChartWriters } from '@/core/chart/chart-runtime.js';
import {
	computeUserRoles,
	getRolePolicies,
	getUserRoles,
	getUserProfilePolicies,
	userIsModerator,
} from '../../../core/role/role-policy.js';
import type { RolePolicyDependencies } from '../../../core/role/role-policy.js';
import { parseApiParams } from '../validation.js';
import type { AvatarDecorationLite, UserPackingDependencies } from '@/core/user/user-packing.js';
import {
	buildAvatarDecorations,
	getOnlineStatus,
	packUserLiteMany,
	populateUserEmojisMany,
} from '@/core/user/user-packing.js';

export type MeDetailedApiResponse = Packed<'MeDetailed'>;
export type UserDetailedNotMeApiResponse = Packed<'UserDetailedNotMe'>;

type PackMeDetailedOptions = {
	includeSecrets: boolean;
	profile?: MiUserProfile;
};

/**
 * srcs を MiUser へ解決する。一覧のクエリの後で削除が確定したユーザーは null にする (並びは srcs と同じ)。
 * ユーザーの削除は user 行の DELETE で、プロフィールやフォロー等も同じ文の cascade で消える。
 */
async function resolveUsersOrNullFromSrcsForApi(
	deps: UserPackingDependencies,
	srcs: (MiUser['id'] | MiUser)[],
): Promise<(MiUser | null)[]> {
	const ids = [...new Set(srcs.filter((src): src is string => typeof src === 'string'))];
	const fetchedUsers = ids.length > 0 ? await listUsersByIdsFromDatabase(deps.db, ids, { includeSuspended: true }) : [];
	const userById = new Map(fetchedUsers.map((user) => [user.id, user]));
	return srcs.map((src) => (typeof src === 'object' ? src : (userById.get(src) ?? null)));
}

type UserRelationForPack = Awaited<ReturnType<typeof getUserRelationForApi>>;

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
	pinnedNotes: Packed<'Note'>[];
	iAmModerator: boolean;
	relation: UserRelationForPack | null;
	twoFactor: { twoFactorEnabled: boolean; usePasswordLessLogin: boolean; securityKeys: boolean } | null;
	moderationNote: string | undefined;
};

/**
 * relation は me が別ユーザーの場合のみ、twoFactor は本人またはモデレーターが閲覧する場合のみ返す。
 */
async function buildUserDetailedExtrasForApi(
	deps: UserPackingDependencies,
	user: MiUser,
	profile: MiUserProfile,
	me: { id: MiUser['id'] } | null | undefined,
	hint?: {
		iAmModerator?: boolean;
		relation?: UserRelationForPack | null;
		/** 一覧の一括取得結果を渡し、ユーザーごとのロール・ピン取得を避ける。 */
		userRoles?: MiRole[];
		policies?: Pick<RolePolicies, 'canPublicNote' | 'chatAvailability'>;
		pins?: MiUserNotePining[];
		pinnedNotes?: Packed<'Note'>[];
		hasSecurityKey?: boolean;
	},
): Promise<UserDetailedExtras> {
	const isMe = me != null && me.id === user.id;
	let iAmModerator = hint?.iAmModerator ?? false;
	if (hint?.iAmModerator === undefined && me != null) {
		const meUser = isMe ? user : await fetchUserByIdFromDatabase(deps.db, me.id);
		iAmModerator = meUser != null && (await userIsModerator(deps, meUser));
	}

	const userRoles = hint?.userRoles ?? (await getUserRoles(deps, user));
	const policies = hint?.policies ?? getUserProfilePolicies(deps, userRoles);

	const pins = hint?.pins ?? (await listUserNotePiningsByUserIdFromDatabase(deps.db, user.id, { order: 'desc' }));
	const pinnedNoteIds = pins.map((pin) => pin.noteId);
	let pinnedNotes: Packed<'Note'>[] = hint?.pinnedNotes ?? [];
	if (hint?.pinnedNotes == null && pinnedNoteIds.length > 0 && deps.redis != null) {
		const notes = await listHydratedNotesByIdsFromDatabase(deps.db, pinnedNoteIds);
		const noteById = new Map(notes.map((note) => [note.id, note]));
		const orderedNotes = pinnedNoteIds.map((id) => noteById.get(id)).filter((note) => note != null);
		pinnedNotes = await packNoteManyForApi(deps as UserPackingDependencies & NoteDependencies, orderedNotes, me, {
			detail: true,
		});
	}

	const relation =
		hint?.relation !== undefined
			? hint.relation
			: me != null && !isMe
				? await getUserRelationForApi(deps, me.id, user.id)
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

export async function packUserDetailedNotMeForApi(
	deps: UserPackingDependencies,
	user: MiUser,
	me?: { id: MiUser['id'] } | null,
): Promise<UserDetailedNotMeApiResponse> {
	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);
	const memo = me ? await fetchUserMemoTextFromDatabase(deps.db, me.id, user.id) : null;
	const extras = await buildUserDetailedExtrasForApi(deps, user, profile, me);

	return packUserDetailedNotMeCoreForApi(deps, user, profile, memo, extras);
}

/**
 * srcs と同じ並びで詳細を返す。一覧のクエリの後で削除が確定したユーザー (行もプロフィールも無い) は null にするので、
 * 呼び出し側はその要素 (と対応する関係の行) を返さない。
 */
export async function packUserDetailedNotMeManyForApi(
	deps: UserPackingDependencies,
	srcs: (MiUser['id'] | MiUser)[],
	me?: { id: MiUser['id'] } | null,
): Promise<(UserDetailedNotMeApiResponse | null)[]> {
	const resolved = await resolveUsersOrNullFromSrcsForApi(deps, srcs);
	const candidates = resolved.filter((user) => user != null);
	const profiles = await listUserProfilesByUserIdsFromDatabase(deps.db, [
		...new Set(candidates.map((user) => user.id)),
	]);
	const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));
	// プロフィールはユーザーと同じトランザクションで作られるので、無ければ削除済み。
	const users = candidates.filter((user) => profileByUserId.has(user.id));
	const userIds = [...new Set(users.map((user) => user.id))];
	const memoByTargetUserId = me ? await listUserMemoTextsByUserIdFromDatabase(deps.db, me.id, userIds) : null;

	const meUser = me != null ? await fetchUserByIdFromDatabase(deps.db, me.id) : null;
	const iAmModerator = meUser != null && (await userIsModerator(deps, meUser));
	const relationByUserId =
		me != null
			? await getUserRelationsForApi(
					deps,
					me.id,
					users.filter((user) => user.id !== me.id).map((user) => user.id),
				)
			: null;

	// ロール・割り当て・ピンを一覧単位で取得し、ユーザーごとの問い合わせを避ける。
	const [allRoles, allAssignments, allPins] = await Promise.all([
		listRolesFromDatabase(deps.db),
		listRoleAssignmentsByUserIdsFromDatabase(deps.db, userIds),
		listUserNotePiningsByUserIdsFromDatabase(deps.db, userIds, { order: 'desc' }),
	]);
	const [securityKeyUserIds, migrationIdsByUserId, emojisByUserId] = await Promise.all([
		me != null
			? listUserIdsWithSecurityKeysFromDatabase(
					deps.db,
					users
						.filter((user) => (iAmModerator || user.id === me.id) && profileByUserId.get(user.id)?.twoFactorEnabled)
						.map((user) => user.id),
				)
			: Promise.resolve([]),
		resolveMigrationIdsManyForApi(deps, users),
		populateUserEmojisMany(deps, users),
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
		const packedPinnedNotes = await packNoteManyForApi(
			deps as UserPackingDependencies & NoteDependencies,
			orderedNotes,
			me,
			{ detail: true },
		);
		for (const note of packedPinnedNotes) {
			packedPinnedNoteById.set(note.id, note);
		}
	}

	const avatarDecorationsByUserId = await buildAvatarDecorations(deps, users);

	const packed = await Promise.all(
		users.map(async (user) => {
			const profile = profileByUserId.get(user.id)!;
			const pins = pinsByUserId.get(user.id) ?? [];
			const hasSecurityKey =
				me != null && (iAmModerator || user.id === me.id) && profile.twoFactorEnabled
					? securityKeyUserIdSet.has(user.id)
					: undefined;
			const extras = await buildUserDetailedExtrasForApi(
				deps,
				user,
				profile,
				me,
				omitUndefined({
					iAmModerator,
					relation: relationByUserId?.get(user.id) ?? null,
					userRoles: computeUserRoles(deps, user, allRoles, assignmentsByUserId.get(user.id) ?? []),
					pins,
					pinnedNotes: pins.map((pin) => packedPinnedNoteById.get(pin.noteId)).filter((note) => note != null),
					hasSecurityKey,
				}),
			);
			return packUserDetailedNotMeCoreForApi(
				deps,
				user,
				profile,
				memoByTargetUserId ? (memoByTargetUserId.get(user.id) ?? null) : null,
				extras,
				omitUndefined({
					...migrationIdsByUserId.get(user.id),
					emojis: emojisByUserId.get(user.id),
					avatarDecorations: avatarDecorationsByUserId.get(user.id) ?? [],
				}),
			);
		}),
	);
	const packedById = new Map(packed.map((user) => [user.id, user]));
	return resolved.map((user) => (user == null ? null : (packedById.get(user.id) ?? null)));
}

export async function resolveAlsoKnownAsForApi(
	deps: UserPackingDependencies,
	alsoKnownAs: string[] | null,
): Promise<string[] | null> {
	if (alsoKnownAs == null || alsoKnownAs.length === 0) {
		return null;
	}

	const localPrefix = `${deps.config.instance.url}/users/`;
	const remoteUris = alsoKnownAs.filter((uri) => !uri.startsWith(localPrefix));
	const remoteUsers =
		remoteUris.length > 0 ? await listUsersByUrisOrIdsFromDatabase(deps.db, { uris: remoteUris, ids: [] }) : [];
	const remoteIdByUri = new Map(remoteUsers.map((u) => [u.uri, u.id]));

	return alsoKnownAs
		.map((uri) => (uri.startsWith(localPrefix) ? uri.slice(localPrefix.length) : (remoteIdByUri.get(uri) ?? null)))
		.filter((id): id is string => id != null);
}

type UserMigrationIds = {
	alsoKnownAs: string[] | null;
	movedTo: string | null;
};

async function resolveMigrationIdsManyForApi(
	deps: UserPackingDependencies,
	users: MiUser[],
): Promise<Map<MiUser['id'], UserMigrationIds>> {
	const localPrefix = `${deps.config.instance.url}/users/`;
	const remoteUris = [
		...new Set(
			users
				.flatMap((user) => [...(user.alsoKnownAs ?? []), ...(user.movedToUri == null ? [] : [user.movedToUri])])
				.filter((uri) => !uri.startsWith(localPrefix)),
		),
	];
	const remoteUsers =
		remoteUris.length > 0 ? await listUsersByUrisOrIdsFromDatabase(deps.db, { uris: remoteUris, ids: [] }) : [];
	const remoteIdByUri = new Map(
		remoteUsers.filter((user): user is MiUser & { uri: string } => user.uri != null).map((user) => [user.uri, user.id]),
	);
	const resolveUri = (uri: string): string | null =>
		uri.startsWith(localPrefix) ? uri.slice(localPrefix.length) : (remoteIdByUri.get(uri) ?? null);

	const resolvedByUserId = new Map<MiUser['id'], UserMigrationIds>();
	for (const user of users) {
		resolvedByUserId.set(user.id, {
			alsoKnownAs: user.alsoKnownAs?.length
				? user.alsoKnownAs.map(resolveUri).filter((id): id is string => id != null)
				: null,
			movedTo: user.movedToUri == null ? null : resolveUri(user.movedToUri),
		});
	}

	return resolvedByUserId;
}

async function packUserDetailedNotMeCoreForApi(
	deps: UserPackingDependencies,
	user: MiUser,
	profile: MiUserProfile,
	memo: string | null,
	extras: UserDetailedExtras,
	hint?: {
		alsoKnownAs?: string[] | null;
		movedTo?: string | null;
		emojis?: Record<string, string>;
		avatarDecorations?: AvatarDecorationLite[];
	},
): Promise<UserDetailedNotMeApiResponse> {
	// DB の値は id と表示位置だけなので、UserLite と同じく画像の url を補ってから返す。
	const avatarDecorations = hint?.avatarDecorations ?? (await buildAvatarDecorations(deps, [user])).get(user.id) ?? [];
	const alsoKnownAs =
		hint?.alsoKnownAs !== undefined ? hint.alsoKnownAs : await resolveAlsoKnownAsForApi(deps, user.alsoKnownAs);
	const emojis = hint?.emojis ?? (await populateEmojis(deps, user.emojis, user.host));

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
		badgeRoles: extras.badgeRoles,
		url: profile.url,
		uri: user.uri,
		movedTo:
			hint?.movedTo !== undefined
				? hint.movedTo
				: ((await resolveAlsoKnownAsForApi(deps, user.movedToUri == null ? null : [user.movedToUri]))?.[0] ?? null),
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

function backupCodesStock(profile: MiUserProfile): 'none' | 'partial' | 'full' {
	const count = profile.twoFactorBackupSecret?.length ?? 0;
	if (count === 5) {
		return 'full';
	}
	return count > 0 ? 'partial' : 'none';
}

export async function packMeDetailedForApi(
	deps: UserPackingDependencies,
	user: MiUser,
	options: PackMeDetailedOptions,
): Promise<MeDetailedApiResponse> {
	const profile = options.profile ?? (await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id));
	const userRoles = await getUserRoles(deps, user);
	const policies = await getRolePolicies(deps, user, userRoles);
	const isRoot = deps.meta.rootUserId === user.id;
	const isAdmin = isRoot || userRoles.some((role) => role.isAdministrator);
	const isModerator = isRoot || userRoles.some((role) => role.isModerator || role.isAdministrator);
	const alsoKnownAs = await resolveAlsoKnownAsForApi(deps, user.alsoKnownAs);
	const memo = await fetchUserMemoTextFromDatabase(deps.db, user.id, user.id);
	const extras = await buildUserDetailedExtrasForApi(
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

	const avatarDecorations = (await buildAvatarDecorations(deps, [user])).get(user.id) ?? [];

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
		emojis: await populateEmojis(deps, user.emojis, user.host),
		onlineStatus: getOnlineStatus(user),
		badgeRoles: extras.badgeRoles,
		url: profile.url,
		uri: user.uri,
		movedTo: (await resolveAlsoKnownAsForApi(deps, user.movedToUri == null ? null : [user.movedToUri]))?.[0] ?? null,
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
						? (await listUserSecurityKeySummariesByUserIdFromDatabase(deps.db, user.id)).map((key) => ({
								id: key.id,
								name: key.name,
								lastUsed: key.lastUsed.toISOString(),
							}))
						: [],
				}
			: {}),
	};
}

export async function packUserDetailedForApi(
	deps: UserPackingDependencies,
	user: MiUser,
	me: { id: MiUser['id'] } | null | undefined,
): Promise<MeDetailedApiResponse | UserDetailedNotMeApiResponse> {
	if (me != null && me.id === user.id) {
		return await packMeDetailedForApi(deps, user, { includeSecrets: false });
	}

	return await packUserDetailedNotMeForApi(deps, user, me);
}

/** packUserDetailedNotMeManyForApi と同じく srcs の並びで返し、削除が確定したユーザーは null にする。 */
export async function packUserDetailedManyForApi(
	deps: UserPackingDependencies,
	srcs: (MiUser['id'] | MiUser)[],
	me: { id: MiUser['id'] } | null | undefined,
): Promise<(MeDetailedApiResponse | UserDetailedNotMeApiResponse | null)[]> {
	if (me == null) {
		return await packUserDetailedNotMeManyForApi(deps, srcs);
	}

	const isMe = (src: MiUser['id'] | MiUser) => (typeof src === 'object' ? src.id : src) === me.id;
	const others = srcs.filter((src) => !isMe(src));
	const packedOthers = await packUserDetailedNotMeManyForApi(deps, others, me);
	const meSrc = srcs.find(isMe);
	if (meSrc == null) {
		return packedOthers;
	}

	const meUser = typeof meSrc === 'object' ? meSrc : await fetchUserByIdFromDatabase(deps.db, me.id);
	const packedMe = meUser != null ? await packMeDetailedForApi(deps, meUser, { includeSecrets: false }) : null;
	let otherIndex = 0;
	return srcs.map((src) => (isMe(src) ? packedMe : (packedOthers[otherIndex++] ?? null)));
}

export const pinnedUsersParamDef = z.object({});

export async function handleApiPinnedUsers(
	deps: UserPackingDependencies,
	me: { id: MiUser['id'] } | null | undefined,
): Promise<(MeDetailedApiResponse | UserDetailedNotMeApiResponse)[]> {
	const accounts = deps.meta.pinnedUsers.map((acct) => Acct.parse(acct));
	const users = await listUsersByUsernamesAndHostsFromDatabase(deps.db, accounts);
	const userByAccount = new Map(users.map((user) => [`${user.username.toLowerCase()}@${user.host ?? ''}`, user]));
	const orderedUsers = accounts
		.map((account) => userByAccount.get(`${account.username.toLowerCase()}@${account.host ?? ''}`))
		.filter((user) => user != null);

	return (await packUserDetailedManyForApi(deps, orderedUsers, me)).filter((user) => user != null);
}

export type ApiUsersShowDependencies = UserPackingDependencies &
	RolePolicyDependencies & {
		chartWriters: ChartWriters;
		resolveUser: (username: string, host: string) => Promise<MiUser>;
	};

function usersShowFailedToResolveRemoteUserError(): ApiError {
	return new ApiError({
		status: 500,
		message: 'Failed to resolve remote user.',
		code: 'FAILED_TO_RESOLVE_REMOTE_USER',
		id: 'ef7b9be4-9cba-4e6f-ab41-90ed171c7d3c',
		kind: 'server',
	});
}

function usersShowNoSuchUserError(): ApiError {
	return new ApiError({
		status: 404,
		message: 'No such user.',
		code: 'NO_SUCH_USER',
		id: '4362f8dc-731f-4ad8-a694-be5a88922a24',
	});
}

/**
 * 各分岐は自分の識別子プロパティだけを検証し、他の分岐のプロパティは検証しない。
 * この分岐独立性を保つため、個別の z.object を z.union で束ねる。
 */
const usersShowHostSchema = z.string().nullable().optional().describe('The local host is represented with `null`.');

export const usersShowParamDef = z.union([
	z.object({ userId: misskeyId(), host: usersShowHostSchema }),
	// 詳細取得に伴う DB 問い合わせと応答サイズを制限する。
	z.object({ userIds: uniqueItems(z.array(misskeyId()).max(100)), host: usersShowHostSchema }),
	z.object({ username: z.string(), host: usersShowHostSchema }),
]);

export async function handleApiUsersShow(
	deps: ApiUsersShowDependencies,
	me: MiUser | null | undefined,
	body: Record<string, unknown>,
	ip: string | null,
): Promise<
	(MeDetailedApiResponse | UserDetailedNotMeApiResponse) | (MeDetailedApiResponse | UserDetailedNotMeApiResponse)[]
> {
	const params = parseApiParams(usersShowParamDef, body);

	const isModerator = await userIsModerator(deps, me ?? null);

	if ('username' in params) {
		params.username = params.username.trim();
	}

	if ('userIds' in params) {
		if (params.userIds.length === 0) {
			return [];
		}

		const users = await listUsersByIdsFromDatabase(deps.db, params.userIds, { includeSuspended: isModerator });
		const userById = new Map(users.map((user) => [user.id, user]));

		const hideRemote = deps.meta.ugcVisibilityForVisitor === 'local' && me == null;
		const ordered: MiUser[] = [];
		for (const id of params.userIds) {
			const user = userById.get(id);
			if (user != null && !(hideRemote && user.host != null)) {
				ordered.push(user);
			}
		}

		return (await packUserDetailedManyForApi(deps, ordered, me)).filter((user) => user != null);
	}

	let user: MiUser | null;

	if (typeof params.host === 'string' && 'username' in params) {
		if (deps.meta.ugcVisibilityForVisitor === 'local' && me == null) {
			throw usersShowNoSuchUserError();
		}

		user = await deps.resolveUser(params.username, params.host).catch(() => {
			throw usersShowFailedToResolveRemoteUserError();
		});
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

	return await packUserDetailedForApi(deps, user, me);
}

export const usersRelationParamDef = z.object({
	userId: z.union([misskeyId(), z.array(misskeyId())]),
});

export type ApiUsersRelationDependencies = {
	db: MiDrizzleDatabase;
};

async function getUserRelationForApi(deps: ApiUsersRelationDependencies, me: MiUser['id'], target: MiUser['id']) {
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

async function getUserRelationsForApi(deps: ApiUsersRelationDependencies, me: MiUser['id'], targets: MiUser['id'][]) {
	const targetIds = [...new Set(targets)];
	if (targetIds.length === 0) {
		return new Map();
	}

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

export async function handleApiUsersRelation(
	deps: ApiUsersRelationDependencies,
	me: { id: MiUser['id'] },
	body: Record<string, unknown>,
) {
	const params = parseApiParams(usersRelationParamDef, body);

	return Array.isArray(params.userId)
		? await getUserRelationsForApi(deps, me.id, params.userId).then((it) => [...it.values()])
		: await getUserRelationForApi(deps, me.id, params.userId).then((it) => [it]);
}

function limitOffsetSqlForApi(options: { limit?: number; offset?: number }): SQL {
	return sql.join(
		[
			options.limit == null ? sql`` : sql`LIMIT ${options.limit}`,
			options.offset == null ? sql`` : sql`OFFSET ${options.offset}`,
		],
		sql` `,
	);
}

/**
 * 名前・ユーザー名・自己紹介の一致をそれぞれ trigram index で集める経路を使う、一致件数の見積もりの上限。
 * 3 つの条件を 1 つの OR で書くと、自己紹介が別の表なので user を全件走査する (利用者 10.5 万人で一致の少ない語
 * 41〜114 ms、利用者数に比例)。集める経路は一致件数に比例し、少ない語で 3〜12 ms、2,222 件で 10 ms、
 * 1.7 万件で 135 ms (全件走査は 48 ms)。見積もりは多い語ではよく合い (1.7 万件を 1.7 万件)、少ない語では
 * 少なめに外れる (250 件を 21〜32 件) が、どちらも集める経路になるので判断は変わらない。
 */
const SPARSE_USER_SEARCH_ESTIMATED_MATCHES = 5_000;

// 名前 (とユーザー名) の一致を先に、自己紹介だけの一致を後に並べた 1 本の列から offset / limit で切り出す。
// 2 本の問い合わせにそれぞれ offset / limit をかけて連結すると、両方に一致する利用者が 2 回入り、
// ページを進めたときに抜けや重複が出る。
async function searchUsersForApi(
	deps: { db: MiDrizzleDatabase },
	query: string,
	meId: MiUser['id'] | null,
	options: { limit?: number; offset?: number; origin?: 'local' | 'remote' | 'combined' } = {},
): Promise<MiUser[]> {
	const activeThreshold = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
	const isUsername = query.startsWith('@') && !query.includes(' ') && !query.includes('@', 1);
	const isLocalUsername = /^\w{1,20}$/.test(query);

	const namePattern = '%' + sqlLikeEscape(query) + '%';
	const usernamePattern = isUsername
		? sqlLikeEscape(query.replace('@', '').toLowerCase()) + '%'
		: isLocalUsername
			? '%' + sqlLikeEscape(query.toLowerCase()) + '%'
			: null;
	const nameMatch = sql`("user"."name" ILIKE ${namePattern} ${
		usernamePattern != null ? sql`OR "user"."usernameLower" LIKE ${usernamePattern}` : sql``
	})`;
	const descriptionMatch = sql`"user"."id" IN (
		SELECT "prof"."userId" FROM "user_profile" AS "prof"
		WHERE "prof"."description" ILIKE ${namePattern}
	)`;
	// 同じ一致を、条件ごとに index で集めた id の列として書いたもの。
	const matchedIds = sql.join(
		[
			sql`SELECT "id" FROM "user" WHERE "name" ILIKE ${namePattern}`,
			...(usernamePattern != null ? [sql`SELECT "id" FROM "user" WHERE "usernameLower" LIKE ${usernamePattern}`] : []),
			sql`SELECT "userId" FROM "user_profile" WHERE "description" ILIKE ${namePattern}`,
		],
		sql` UNION ALL `,
	);
	const sparse = (await estimateRows(deps.db, matchedIds)) < SPARSE_USER_SEARCH_ESTIMATED_MATCHES;

	const conditions: SQL[] = [
		sparse ? sql`"user"."id" IN (${matchedIds})` : sql`(${nameMatch} OR ${descriptionMatch})`,
		sql`("user"."updatedAt" IS NULL OR "user"."updatedAt" > ${activeThreshold})`,
		sql`"user"."isSuspended" = FALSE`,
	];

	if (meId != null) {
		conditions.push(sql`"user"."id" NOT IN (SELECT "muteeId" FROM "muting" WHERE "muterId" = ${meId})`);
	}

	if (options.origin === 'local') {
		conditions.push(sql`"user"."host" IS NULL`);
	} else if (options.origin === 'remote') {
		conditions.push(sql`"user"."host" IS NOT NULL`);
	}

	const result = await deps.db.execute<UserRow>(sql`
		SELECT "user".*
		FROM "user"
		WHERE ${sql.join(conditions, sql` AND `)}
		ORDER BY (${nameMatch}) IS TRUE DESC, "user"."updatedAt" DESC NULLS LAST, "user"."id" DESC
		${limitOffsetSqlForApi(options)}
	`);
	return result.rows.map((row) => deserializeUser(row));
}

export const usersSearchParamDef = z.object({
	query: z.string(),
	offset: z.int().nonnegative().default(0),
	limit: z.int().min(1).max(100).default(10),
	origin: z.enum(['local', 'remote', 'combined']).default('combined'),
	detail: z.boolean().default(true),
});

export async function handleApiUsersSearch(
	deps: UserPackingDependencies,
	me: MiUser | null | undefined,
	params: ApiParams<typeof usersSearchParamDef>,
) {
	const users = await searchUsersForApi(deps, params.query.trim(), me?.id ?? null, {
		offset: params.offset,
		limit: params.limit,
		origin: params.origin,
	});

	return params.detail
		? (await packUserDetailedManyForApi(deps, users, me)).filter((user) => user != null)
		: await packUserLiteMany(deps, users);
}

function buildBaseUserSearchConditionsForApi(
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

function defaultActiveThresholdForApi(): Date {
	return new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
}

function buildSearchUserQueriesForApi(
	config: Config,
	me: MiUser,
	params: { username?: string | null; host?: string | null; activeThreshold?: Date },
): SQL[][] {
	const activeThreshold = params.activeThreshold ?? defaultActiveThresholdForApi();
	const followingUserQuery = sql`SELECT "followeeId" FROM "following" WHERE "followerId" = ${me.id}`;
	const baseConditions = buildBaseUserSearchConditionsForApi(config, params);

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

function buildSearchUserNoLoginQueriesForApi(
	config: Config,
	params: { username?: string | null; host?: string | null; activeThreshold?: Date },
): SQL[][] {
	const activeThreshold = params.activeThreshold ?? defaultActiveThresholdForApi();
	const baseConditions = buildBaseUserSearchConditionsForApi(config, params);

	return [
		[...baseConditions, sql`("user"."updatedAt" IS NULL OR "user"."updatedAt" > ${activeThreshold})`],
		[...baseConditions, sql`"user"."updatedAt" <= ${activeThreshold}`],
	];
}

async function selectSearchUserIdsForApi(
	deps: { db: MiDrizzleDatabase },
	conditions: SQL[],
	limit: number,
): Promise<MiUser['id'][]> {
	if (limit <= 0) {
		return [];
	}

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
 * username と host の分岐を独立して検証するため、個別の z.object を z.union で束ねる。
 */
const usersSearchByUsernameAndHostCommon = {
	limit: z.int().min(1).max(100).default(10),
	detail: z.boolean().default(true),
};

export const usersSearchByUsernameAndHostParamDef = z.union([
	z.object({ username: z.string().nullable(), ...usersSearchByUsernameAndHostCommon }),
	z.object({ host: z.string().nullable(), ...usersSearchByUsernameAndHostCommon }),
]);

export async function handleApiUsersSearchByUsernameAndHost(
	deps: UserPackingDependencies,
	me: MiUser | null | undefined,
	params: ApiParams<typeof usersSearchByUsernameAndHostParamDef>,
) {
	const searchParams = omitUndefined({
		username: 'username' in params ? params.username : undefined,
		host: 'host' in params ? params.host : undefined,
	});

	const queries = me
		? buildSearchUserQueriesForApi(deps.config, me, searchParams)
		: buildSearchUserNoLoginQueriesForApi(deps.config, searchParams);

	let resultSet = new Set<MiUser['id']>();
	const limit = params.limit;
	for (const conditions of queries) {
		const ids = await selectSearchUserIdsForApi(deps, conditions, limit - resultSet.size);
		resultSet = new Set([...resultSet, ...ids]);
		if (resultSet.size >= limit) {
			break;
		}
	}

	const ids = [...resultSet].slice(0, limit);
	return params.detail
		? (await packUserDetailedManyForApi(deps, ids, me)).filter((user) => user != null)
		: await packUserLiteMany(deps, ids);
}

export const usersRecommendationParamDef = z.object({
	limit: z.int().min(1).max(100).default(10),
	offset: z.int().nonnegative().default(0),
});

export async function handleApiUsersRecommendation(
	deps: UserPackingDependencies,
	me: MiUser,
	params: ApiParams<typeof usersRecommendationParamDef>,
) {
	const users = await listRecommendedUsersFromDatabase(deps.db, me.id, {
		limit: params.limit,
		offset: params.offset,
		updatedAfter: new Date(Date.now() - 7 * DAY),
	});

	return (await packUserDetailedManyForApi(deps, users, me)).filter((user) => user != null);
}

export const usersGetFrequentlyRepliedUsersParamDef = z.object({
	userId: misskeyId(),
	limit: z.int().min(1).max(100).default(10),
});

export async function handleApiUsersGetFrequentlyRepliedUsers(
	deps: UserPackingDependencies,
	me: MiUser | null | undefined,
	params: ApiParams<typeof usersGetFrequentlyRepliedUsersParamDef>,
	errors: ContractErrors<(typeof usersContracts)['users/get-frequently-replied-users']>,
) {
	const user = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (user == null) {
		throw errors.noSuchUser();
	}

	const repliedUsers = await listFrequentlyRepliedUsersFromDatabase(deps.db, user.id, params.limit, me ?? null);
	if (repliedUsers.length === 0) {
		return [];
	}

	const peak = maximum(repliedUsers.map((row) => row.count));
	const topRepliedUserIds = repliedUsers.map((row) => row.userId);
	const repliedUserCounts = new Map(repliedUsers.map((row) => [row.userId, row.count]));

	const packedUsers = await packUserDetailedManyForApi(deps, topRepliedUserIds, me);
	return topRepliedUserIds.flatMap((userId, index) => {
		const user = packedUsers[index];
		return user == null ? [] : [{ user, weight: repliedUserCounts.get(userId)! / peak }];
	});
}

export const usersParamDef = z.object({
	limit: z.int().min(1).max(100).default(10),
	offset: z.int().nonnegative().default(0),
	sort: z.enum(['+follower', '-follower', '+createdAt', '-createdAt', '+updatedAt', '-updatedAt']).optional(),
	state: z.enum(['all', 'alive']).default('all'),
	origin: z.enum(['combined', 'local', 'remote']).default('local'),
	hostname: z.string().nullable().default(null),
});

export async function handleApiUsers(
	deps: UserPackingDependencies,
	me: MiUser | null | undefined,
	params: ApiParams<typeof usersParamDef>,
) {
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

	return (await packUserDetailedManyForApi(deps, users, me)).filter((user) => user != null);
}

export const usersUpdateMemoParamDef = z.object({
	userId: misskeyId(),
	memo: z.string().nullable(),
});

export async function handleApiUsersUpdateMemo(
	deps: UserPackingDependencies,
	me: MiUser,
	params: ApiParams<typeof usersUpdateMemoParamDef>,
	errors: ContractErrors<(typeof usersContracts)['users/update-memo']>,
): Promise<void> {
	const target = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (target == null) {
		throw errors.noSuchUser();
	}

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
