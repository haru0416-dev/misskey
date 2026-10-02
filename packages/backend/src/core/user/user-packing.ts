/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import type { Config } from '@/config.js';
import { listAvatarDecorationsFromDatabaseCached } from '@/core/avatar-decoration/avatar-decoration-store.js';
import { getIdenticonUrl } from '@/core/drive/identicon-url.js';
import { fetchUserByIdOrFailFromDatabase, listUsersByIdsFromDatabase } from '@/core/user/user-store.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiMeta } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { populateEmojis, populateEmojisMany } from '../note/note-packing.js';

export type UserPackingDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	/** pinnedNotes を detail:true で pack するのに必要。省略時 pinnedNotes は空配列になる (pinnedNoteIds は常に入る)。 */
	redis?: Redis.Redis;
};

export type AvatarDecorationLite = {
	id: string;
	angle?: number;
	flipH?: boolean;
	offsetX?: number;
	offsetY?: number;
	url: string;
};

function packUserLiteCore(
	deps: UserPackingDependencies,
	user: MiUser,
	avatarDecorations: AvatarDecorationLite[],
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

export async function buildAvatarDecorations(
	deps: UserPackingDependencies,
	users: MiUser[],
): Promise<Map<MiUser['id'], AvatarDecorationLite[]>> {
	const usersWithDecorations = users.filter((user) => user.avatarDecorations.length > 0);
	if (usersWithDecorations.length === 0) {
		return new Map();
	}

	const decorations = await listAvatarDecorationsFromDatabaseCached(deps.db);
	const decorationById = new Map(decorations.map((decoration) => [decoration.id, decoration]));
	const map = new Map<MiUser['id'], AvatarDecorationLite[]>();

	for (const user of usersWithDecorations) {
		map.set(
			user.id,
			user.avatarDecorations.flatMap((userDecoration) => {
				const decoration = decorationById.get(userDecoration.id);
				if (decoration == null) {
					return [];
				}
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

export async function packUserLite(
	deps: UserPackingDependencies,
	src: MiUser['id'] | MiUser,
): Promise<Packed<'UserLite'>> {
	const user = typeof src === 'object' ? src : await fetchUserByIdOrFailFromDatabase(deps.db, src);
	const avatarDecorations = await buildAvatarDecorations(deps, [user]);
	const emojis = await populateEmojis(deps, user.emojis, user.host);

	return packUserLiteCore(deps, user, avatarDecorations.get(user.id) ?? [], emojis);
}

/** srcs (MiUser本体 or ID) を MiUser[] に解決する。バッチ取得で見つからなかったIDは1件ずつ fetchUserByIdOrFailFromDatabase にフォールバックする (見つからなければ throw)。 */
async function resolveUsersFromSrcs(deps: UserPackingDependencies, srcs: (MiUser['id'] | MiUser)[]): Promise<MiUser[]> {
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

export async function populateUserEmojisMany(
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

export async function packUserLiteMany(
	deps: UserPackingDependencies,
	srcs: (MiUser['id'] | MiUser)[],
): Promise<Packed<'UserLite'>[]> {
	const users = await resolveUsersFromSrcs(deps, srcs);
	const avatarDecorations = await buildAvatarDecorations(deps, users);
	const emojisByUserId = await populateUserEmojisMany(deps, users);

	return users.map((user) =>
		packUserLiteCore(deps, user, avatarDecorations.get(user.id) ?? [], emojisByUserId.get(user.id) ?? {}),
	);
}

export function getOnlineStatus(user: MiUser): 'unknown' | 'online' | 'active' | 'offline' {
	if (user.hideOnlineStatus) {
		return 'unknown';
	}
	if (user.lastActiveDate == null) {
		return 'unknown';
	}

	const elapsed = Date.now() - user.lastActiveDate.getTime();

	return elapsed < 1000 * 60 * 10 ? 'online' : elapsed < 1000 * 60 * 60 * 24 * 3 ? 'active' : 'offline';
}
