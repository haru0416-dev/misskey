/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';
import type * as Redis from 'ioredis';
import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import {
	appendUserToAntennasInDatabase,
	createAntennasWithinLimitInDatabase,
	deleteAntennaFromDatabase,
	fetchAntennaByIdAndUserIdFromDatabase,
	fetchAntennaByIdOrFailFromDatabase,
	listActiveAntennasFromDatabase,
	listAntennasByIdsFromDatabase,
	listAntennasByUserIdFromDatabase,
	updateAntennaInDatabase,
} from '@/core/antenna/AntennaStore.js';
import { listActiveMutedChannelIdsByUserIdFromDatabase } from '@/core/channel/ChannelMutingStore.js';
import {
	followingExistsInDatabase,
	listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase,
} from '@/core/user/FollowingStore.js';
import { listFilteredTimelineNotesByIdsFromDatabase } from '@/core/note/NoteStore.js';
import {
	listUserListIdsContainingUserFromDatabase,
	userListMembershipExistsInDatabase,
} from '@/core/user/UserListMembershipStore.js';
import { fetchUserListByIdAndUserIdFromDatabase } from '@/core/user/UserListStore.js';
import { fetchUserByIdFromDatabase } from '@/core/user/UserStore.js';
import * as Acct from '@/misc/acct.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiAntenna } from '@/models/Antenna.js';
import type { MiNote } from '@/models/Note.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { MiUserList } from '@/models/UserList.js';
import { ApiError } from '../error.js';
import type { ApiAntennaStreamPublisher, ApiInternalEventPublisher } from '../events.js';
import { packNoteManyForApi, type ApiNoteDependencies } from '../note/note.js';
import { getApiRolePolicies, type ApiRolePolicyDependencies } from '../role/role-policy.js';
import { parseApiParams } from '../validation.js';

export type ApiAntennaDependencies = ApiNoteDependencies &
	ApiRolePolicyDependencies & {
		publishInternalEvent?: ApiInternalEventPublisher;
	};

export type ApiAntennaFanoutDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	redisForTimelines: Redis.Redis;
	publishAntennaStream?: ApiAntennaStreamPublisher;
};

function getFullApAccount(
	config: { runtime: Pick<Config['runtime'], 'host'> },
	username: string,
	host: string | null,
): string {
	return host
		? `${username}@${domainToASCII(host.toLowerCase())}`
		: `${username}@${domainToASCII(config.runtime.host.toLowerCase())}`;
}

export function antennaUsersIncludes(
	config: { runtime: Pick<Config['runtime'], 'host'> },
	users: string[],
	user: { username: string; host: string | null },
): boolean {
	const account = getFullApAccount(config, user.username, user.host).toLowerCase();
	const accountHost = domainToASCII((user.host ?? config.runtime.host).toLowerCase());

	return users.some((value) => {
		const { username, host } = Acct.parse(value);
		if (username === '*' && host != null) {
			return domainToASCII(host.toLowerCase()) === accountHost;
		}

		return getFullApAccount(config, username, host).toLowerCase() === account;
	});
}

function passesAntennaPreconditions(
	antenna: MiAntenna,
	note: MiNote,
	noteUser: { host: string | null; isBot: boolean },
): boolean {
	if (antenna.excludeNotesInSensitiveChannel && note.channel?.isSensitive) return false;
	if (antenna.excludeBots && noteUser.isBot) return false;
	if (antenna.localOnly && noteUser.host != null) return false;
	if (!antenna.withReplies && note.replyId != null) return false;
	return true;
}

export async function checkHitAntennaForApi(
	deps: Pick<ApiAntennaFanoutDependencies, 'config' | 'db'>,
	antenna: MiAntenna,
	note: MiNote,
	noteUser: { id: MiUser['id']; username: string; host: string | null; isBot: boolean },
	hint?: {
		listMembershipUserListIds: Set<string>;
		followerIds?: Set<MiUser['id']>;
	},
): Promise<boolean> {
	if (!passesAntennaPreconditions(antenna, note, noteUser)) return false;

	if (note.visibility === 'specified') {
		if (note.userId !== antenna.userId) {
			if (note.visibleUserIds == null) return false;
			if (!note.visibleUserIds.includes(antenna.userId)) return false;
		}
	}

	if (note.visibility === 'followers') {
		const isFollowing =
			hint?.followerIds != null
				? hint.followerIds.has(antenna.userId)
				: await followingExistsInDatabase(deps.db, antenna.userId, note.userId);
		if (!isFollowing && antenna.userId !== note.userId) return false;
	}

	if (antenna.src === 'home') {
		// ホーム = アンテナ所有者のホームタイムラインに流れるノート (自分の投稿 + フォロー中ユーザーの投稿)。
		// hint.followerIds は「note.userId をフォローしている候補ユーザー」なので所有者が居れば follow 済み。
		if (note.userId !== antenna.userId) {
			const isFollowing =
				hint?.followerIds != null
					? hint.followerIds.has(antenna.userId)
					: await followingExistsInDatabase(deps.db, antenna.userId, note.userId);
			if (!isFollowing) return false;
		}
	} else if (antenna.src === 'list') {
		if (antenna.userListId == null) return false;
		const exists = hint
			? hint.listMembershipUserListIds.has(antenna.userListId)
			: await userListMembershipExistsInDatabase(deps.db, note.userId, antenna.userListId);
		if (!exists) return false;
	} else if (antenna.src === 'users') {
		if (!antennaUsersIncludes(deps.config, antenna.users, noteUser)) return false;
	} else if (antenna.src === 'users_blacklist') {
		if (antennaUsersIncludes(deps.config, antenna.users, noteUser)) return false;
	}

	const keywords = antenna.keywords.map((xs) => xs.filter((x) => x !== '')).filter((xs) => xs.length > 0);

	if (keywords.length > 0) {
		if (note.text == null && note.cw == null) return false;

		const _text = (note.text ?? '') + '\n' + (note.cw ?? '');

		const matched = keywords.some((and) =>
			and.every((keyword) =>
				antenna.caseSensitive ? _text.includes(keyword) : _text.toLowerCase().includes(keyword.toLowerCase()),
			),
		);

		if (!matched) return false;
	}

	const excludeKeywords = antenna.excludeKeywords.map((xs) => xs.filter((x) => x !== '')).filter((xs) => xs.length > 0);

	if (excludeKeywords.length > 0) {
		if (note.text == null && note.cw == null) return false;

		const _text = (note.text ?? '') + '\n' + (note.cw ?? '');

		const matched = excludeKeywords.some((and) =>
			and.every((keyword) =>
				antenna.caseSensitive ? _text.includes(keyword) : _text.toLowerCase().includes(keyword.toLowerCase()),
			),
		);

		if (matched) return false;
	}

	if (antenna.withFile) {
		if (note.fileIds?.length === 0) return false;
	}

	return true;
}

/**
 * アカウント移行直前の users リストを基準に対象を決めるため、アンテナ一覧は毎回DBから読む。
 */
export async function onMoveAccountForApi(
	deps: {
		config: { runtime: Pick<Config['runtime'], 'host'> };
		db: MiDrizzleDatabase;
		publishInternalEvent?: ApiInternalEventPublisher;
	},
	src: MiUser,
	dst: MiUser,
): Promise<void> {
	// srcUser が自分のアンテナに含まれる可能性は低いため、移行対象として確認しない。

	const srcUserAcct = getFullApAccount(deps.config, src.username, src.host).toLowerCase();
	const antennasToMigrate = (await listActiveAntennasFromDatabase(deps.db)).filter((antenna) => {
		return antenna.users.some((user) => {
			const { username, host } = Acct.parse(user);
			return getFullApAccount(deps.config, username, host).toLowerCase() === srcUserAcct;
		});
	});

	if (antennasToMigrate.length === 0) return;

	const antennaIds = antennasToMigrate.map((x) => x.id);

	const dstUserAcct = '@' + Acct.toString({ username: dst.username, host: dst.host });

	await appendUserToAntennasInDatabase(deps.db, antennaIds, dstUserAcct);

	for (const newAntenna of await listAntennasByIdsFromDatabase(deps.db, antennaIds)) {
		deps.publishInternalEvent?.('antennaUpdated', newAntenna);
	}
}

/**
 * アクティブなアンテナ一覧を DB から取得し、評価を分割して実行する。
 * FanoutTimelineService.push と同じく直近3分以内のノートのみ即時lpushし、古いノートは末尾IDと比較する。
 */
export async function addNoteToAntennasForApi(
	deps: ApiAntennaFanoutDependencies,
	note: MiNote,
	noteUser: { id: MiUser['id']; username: string; host: string | null; isBot: boolean },
): Promise<void> {
	const antennas = await listActiveAntennasFromDatabase(deps.db);

	// src === 'list' なアンテナの userListId をまとめて1クエリで所属判定する (アンテナ毎の exists クエリを回避)。
	const listAntennaUserListIds = [
		...new Set(
			antennas
				.filter(
					(antenna): antenna is MiAntenna & { userListId: string } =>
						antenna.src === 'list' && antenna.userListId != null,
				)
				.map((antenna) => antenna.userListId),
		),
	];
	// followers 限定ノートの可視性判定と src === 'home' の判定はどちらも「そのアンテナの所有者が
	// ノート投稿者をフォローしているか」なので、候補をまとめて1クエリで引く。
	const followerCandidateIds = [
		...new Set(
			antennas
				.filter((antenna) => note.visibility === 'followers' || antenna.src === 'home')
				.filter((antenna) => antenna.userId !== note.userId && passesAntennaPreconditions(antenna, note, noteUser))
				.map((antenna) => antenna.userId),
		),
	];
	const [listMembershipUserListIds, followerIds] = await Promise.all([
		listUserListIdsContainingUserFromDatabase(deps.db, note.userId, listAntennaUserListIds),
		followerCandidateIds.length > 0
			? listFollowerIdsByFolloweeIdAndFollowerIdsFromDatabase(deps.db, note.userId, followerCandidateIds)
			: Promise.resolve([]),
	]);
	const followerIdSet = new Set(followerIds);

	const antennasWithMatchResult: (readonly [MiAntenna, boolean])[] = [];
	for (let index = 0; index < antennas.length; index += 50) {
		const batch = antennas.slice(index, index + 50);
		antennasWithMatchResult.push(
			...(await Promise.all(
				batch.map((antenna) =>
					checkHitAntennaForApi(deps, antenna, note, noteUser, {
						listMembershipUserListIds,
						followerIds: followerIdSet,
					}).then((hit) => [antenna, hit] as const),
				),
			)),
		);
	}
	const matchedAntennas = antennasWithMatchResult.filter(([, hit]) => hit).map(([antenna]) => antenna);

	const redisPipeline = deps.redisForTimelines.pipeline();

	for (const antenna of matchedAntennas) {
		const tl = `antennaTimeline:${antenna.id}`;
		if (parseId(note.id).date.getTime() > Date.now() - 1000 * 60 * 3) {
			redisPipeline.lrem('list:' + tl, 0, note.id);
			redisPipeline.lpush('list:' + tl, note.id);
			if (Math.random() < 0.1) {
				redisPipeline.ltrim('list:' + tl, 0, 200 - 1);
			}
		} else {
			const lastId = await deps.redisForTimelines.lindex('list:' + tl, -1);
			if (lastId == null || parseId(note.id).date.getTime() > parseId(lastId).date.getTime()) {
				await deps.redisForTimelines
					.multi()
					.lrem('list:' + tl, 0, note.id)
					.lpush('list:' + tl, note.id)
					.exec();
			}
		}
	}

	await redisPipeline.exec();
	for (const antenna of matchedAntennas) {
		deps.publishAntennaStream?.(antenna.id, 'note', note);
	}
}

function noSuchAntennaError(id: string): ApiError {
	return new ApiError({ status: 400, message: 'No such antenna.', code: 'NO_SUCH_ANTENNA', id });
}

function noSuchUserListError(id: string): ApiError {
	return new ApiError({ status: 400, message: 'No such user list.', code: 'NO_SUCH_USER_LIST', id });
}

function emptyKeywordError(id: string): ApiError {
	return new ApiError({
		status: 400,
		message: 'Either keywords or excludeKeywords is required.',
		code: 'EMPTY_KEYWORD',
		id,
	});
}

async function packAntennaForApi(
	deps: { db: ApiAntennaDependencies['db']; config: ApiAntennaDependencies['config'] },
	src: MiAntenna['id'] | MiAntenna,
): Promise<Packed<'Antenna'>> {
	const antenna = typeof src === 'object' ? src : await fetchAntennaByIdOrFailFromDatabase(deps.db, src);

	return {
		id: antenna.id,
		createdAt: parseId(antenna.id).date.toISOString(),
		name: antenna.name,
		keywords: antenna.keywords,
		excludeKeywords: antenna.excludeKeywords,
		src: antenna.src,
		userListId: antenna.userListId,
		users: antenna.users,
		caseSensitive: antenna.caseSensitive,
		localOnly: antenna.localOnly,
		excludeBots: antenna.excludeBots,
		withReplies: antenna.withReplies,
		withFile: antenna.withFile,
		excludeNotesInSensitiveChannel: antenna.excludeNotesInSensitiveChannel,
		isActive: antenna.isActive,
		hasUnreadNote: false,
		notify: false,
	};
}

const antennaSrcEnum = ['home', 'all', 'users', 'list', 'users_blacklist'] as const;

export const antennasCreateParamDef = z
	.object({
		name: z.string().min(1).max(100),
		src: z.enum(antennaSrcEnum),
		userListId: misskeyId().nullable().optional(),
		keywords: z.array(z.array(z.string())),
		excludeKeywords: z.array(z.array(z.string())),
		users: z.array(z.string()),
		caseSensitive: z.boolean(),
		localOnly: z.boolean().optional(),
		excludeBots: z.boolean().optional(),
		withReplies: z.boolean(),
		withFile: z.boolean(),
		excludeNotesInSensitiveChannel: z.boolean().optional(),
	})
	.superRefine((value, ctx) => {
		if (value.src === 'list' && value.userListId == null) {
			ctx.addIssue({
				code: 'custom',
				path: ['userListId'],
				message: 'userListId is required when src is "list".',
			});
		}
	});

export async function handleApiAntennasCreate(
	deps: ApiAntennaDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Antenna'>> {
	const params = parseApiParams(antennasCreateParamDef, body);

	if (params.keywords.flat().every((x) => x === '') && params.excludeKeywords.flat().every((x) => x === '')) {
		throw emptyKeywordError('53ee222e-1ddd-4f9a-92e5-9fb82ddb463a');
	}

	// src が 'list' のアンテナは userListId を必ず持つ (持たないと checkHitAntenna が常に false になり、
	// 何にもマッチしないアンテナが出来てしまう)。DB 側にも CHK_ANTENNA_LIST_SRC_REQUIRES_USER_LIST がある。
	let userListId: MiUserList['id'] | null = null;
	if (params.src === 'list') {
		if (params.userListId == null) throw noSuchUserListError('95063e93-a283-4b8b-9aa5-bcdb8df69a7f');
		const userList = await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.userListId, me.id);
		if (userList == null) throw noSuchUserListError('95063e93-a283-4b8b-9aa5-bcdb8df69a7f');
		userListId = userList.id;
	}

	const now = new Date();
	const result = await createAntennasWithinLimitInDatabase(
		deps.db,
		me.id,
		[
			{
				id: genId(now.getTime()),
				lastUsedAt: now,
				name: params.name,
				src: params.src,
				userListId,
				keywords: params.keywords,
				excludeKeywords: params.excludeKeywords,
				users: params.users,
				caseSensitive: params.caseSensitive,
				localOnly: params.localOnly ?? false,
				excludeBots: params.excludeBots ?? false,
				withReplies: params.withReplies,
				withFile: params.withFile,
				excludeNotesInSensitiveChannel: params.excludeNotesInSensitiveChannel ?? false,
			},
		],
		async (tx) => {
			const currentUser = await fetchUserByIdFromDatabase(tx, me.id);
			if (currentUser == null) throw new Error('Authenticated user no longer exists');
			return (await getApiRolePolicies({ ...deps, db: tx }, currentUser)).antennaLimit;
		},
	);
	if (result.status === 'limitExceeded') {
		throw new ApiError({
			status: 400,
			message: 'You cannot create antenna any more.',
			code: 'TOO_MANY_ANTENNAS',
			id: 'faf47050-e8b5-438c-913c-db2b1576fde4',
		});
	}

	const antenna = result.antennas[0];
	if (antenna == null) throw new Error('Failed to create antenna');
	deps.publishInternalEvent?.('antennaCreated', antenna);

	return await packAntennaForApi(deps, antenna);
}

export const antennasUpdateParamDef = z
	.object({
		antennaId: misskeyId(),
		name: z.string().min(1).max(100).optional(),
		src: z.enum(antennaSrcEnum).optional(),
		userListId: misskeyId().nullable().optional(),
		keywords: z.array(z.array(z.string())).optional(),
		excludeKeywords: z.array(z.array(z.string())).optional(),
		users: z.array(z.string()).optional(),
		caseSensitive: z.boolean().optional(),
		localOnly: z.boolean().optional(),
		excludeBots: z.boolean().optional(),
		withReplies: z.boolean().optional(),
		withFile: z.boolean().optional(),
		excludeNotesInSensitiveChannel: z.boolean().optional(),
	})
	.superRefine((value, ctx) => {
		if (value.src === 'list' && value.userListId === null) {
			ctx.addIssue({
				code: 'custom',
				path: ['userListId'],
				message: 'userListId is required when src is "list".',
			});
		}
	});

export async function handleApiAntennasUpdate(
	deps: ApiAntennaDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Antenna'>> {
	const params = parseApiParams(antennasUpdateParamDef, body);

	if (params.keywords && params.excludeKeywords) {
		if (params.keywords.flat().every((x) => x === '') && params.excludeKeywords.flat().every((x) => x === '')) {
			throw emptyKeywordError('721aaff6-4e1b-4d88-8de6-877fae9f68c4');
		}
	}

	const antenna = await fetchAntennaByIdAndUserIdFromDatabase(deps.db, params.antennaId, me.id);
	if (antenna == null) throw noSuchAntennaError('10c673ac-8852-48eb-aa1f-f5b67f069290');

	// undefined = 変更しない
	let userListIdUpdate: MiUserList['id'] | null | undefined = undefined;
	if (params.userListId != null) {
		const userList = await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.userListId, me.id);
		if (userList == null) throw noSuchUserListError('1c6b35c9-943e-48c2-81e4-2844989407f7');
		userListIdUpdate = userList.id;
	} else if (params.userListId === null) {
		userListIdUpdate = null;
	}

	const nextSrc = params.src ?? antenna.src;
	if (nextSrc === 'list') {
		// list のアンテナを userListId 無しの状態にはできない (create と同じ不変条件)
		const nextUserListId = userListIdUpdate !== undefined ? userListIdUpdate : antenna.userListId;
		if (nextUserListId == null) throw noSuchUserListError('1c6b35c9-943e-48c2-81e4-2844989407f7');
	} else if (userListIdUpdate != null || antenna.userListId != null) {
		// list 以外では userListId は評価に使われないので保持しない
		userListIdUpdate = null;
	}

	await updateAntennaInDatabase(
		deps.db,
		antenna.id,
		omitUndefined({
			name: params.name,
			src: params.src,
			userListId: userListIdUpdate,
			keywords: params.keywords,
			excludeKeywords: params.excludeKeywords,
			users: params.users,
			caseSensitive: params.caseSensitive,
			localOnly: params.localOnly,
			excludeBots: params.excludeBots,
			withReplies: params.withReplies,
			withFile: params.withFile,
			excludeNotesInSensitiveChannel: params.excludeNotesInSensitiveChannel,
			isActive: true,
			lastUsedAt: new Date(),
		}),
	);

	deps.publishInternalEvent?.('antennaUpdated', await fetchAntennaByIdOrFailFromDatabase(deps.db, antenna.id));

	return await packAntennaForApi(deps, antenna.id);
}

export const antennasDeleteParamDef = z.object({
	antennaId: misskeyId(),
});

export async function handleApiAntennasDelete(
	deps: ApiAntennaDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(antennasDeleteParamDef, body);

	const antenna = await fetchAntennaByIdAndUserIdFromDatabase(deps.db, params.antennaId, me.id);
	if (antenna == null) throw noSuchAntennaError('b34dcf9d-348f-44bb-99d0-6c9314cfe2df');

	await deleteAntennaFromDatabase(deps.db, antenna.id);

	deps.publishInternalEvent?.('antennaDeleted', antenna);
}

export const antennasListParamDef = z.object({});

export async function handleApiAntennasList(
	deps: ApiAntennaDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Antenna'>[]> {
	parseApiParams(antennasListParamDef, body);

	const antennas = await listAntennasByUserIdFromDatabase(deps.db, me.id);

	return await Promise.all(antennas.map((x) => packAntennaForApi(deps, x)));
}

export const antennasShowParamDef = z.object({
	antennaId: misskeyId(),
});

export async function handleApiAntennasShow(
	deps: ApiAntennaDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Antenna'>> {
	const params = parseApiParams(antennasShowParamDef, body);

	const antenna = await fetchAntennaByIdAndUserIdFromDatabase(deps.db, params.antennaId, me.id);
	if (antenna == null) throw noSuchAntennaError('c06569fb-b025-4f23-b22d-1fcd20d2816b');

	return await packAntennaForApi(deps, antenna);
}

export const antennasRemoveNoteParamDef = z.object({
	antennaId: misskeyId(),
	noteId: misskeyId(),
});

export async function handleApiAntennasRemoveNote(
	deps: ApiAntennaDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(antennasRemoveNoteParamDef, body);

	const antenna = await fetchAntennaByIdAndUserIdFromDatabase(deps.db, params.antennaId, me.id);
	if (antenna == null) throw noSuchAntennaError('850926e0-fd3b-49b6-b69a-b28a5dbd82fe');

	await deps.redis.lrem(`list:antennaTimeline:${antenna.id}`, 1, params.noteId);
}

export const antennasNotesParamDef = z.object({
	antennaId: misskeyId(),
	limit: z.int().min(1).max(100).default(10),
	...paginationParams,
});

export async function handleApiAntennasNotes(
	deps: ApiAntennaDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseApiParams(antennasNotesParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : null);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : null);

	const antenna = await fetchAntennaByIdAndUserIdFromDatabase(deps.db, params.antennaId, me.id);
	if (antenna == null) throw noSuchAntennaError('850926e0-fd3b-49b6-b69a-b28a5dbd82fe');

	const needPublishEvent = !antenna.isActive;
	antenna.isActive = true;
	antenna.lastUsedAt = new Date();
	trackPromise(
		updateAntennaInDatabase(deps.db, antenna.id, {
			isActive: antenna.isActive,
			lastUsedAt: antenna.lastUsedAt,
		}),
	);

	if (needPublishEvent) {
		deps.publishInternalEvent?.('antennaUpdated', antenna);
	}

	const rawIds = await deps.redis.lrange(`list:antennaTimeline:${antenna.id}`, 0, -1);
	let noteIds =
		untilId && sinceId
			? rawIds.filter((id) => id < untilId && id > sinceId).sort((a, b) => (a > b ? -1 : 1))
			: untilId
				? rawIds.filter((id) => id < untilId).sort((a, b) => (a > b ? -1 : 1))
				: sinceId
					? rawIds.filter((id) => id > sinceId).sort((a, b) => (a < b ? -1 : 1))
					: rawIds.toSorted((a, b) => (a > b ? -1 : 1));
	noteIds = noteIds.slice(0, params.limit);

	if (noteIds.length === 0) return [];

	const mutingChannelIds = await listActiveMutedChannelIdsByUserIdFromDatabase(deps.db, me.id, new Date());

	const notes = await listFilteredTimelineNotesByIdsFromDatabase(deps.db, {
		ids: noteIds,
		me,
		blockedHosts: deps.meta.blockedHosts,
		mutingChannelIds,
	});
	if (sinceId != null && untilId == null) {
		notes.sort((a, b) => (a.id < b.id ? -1 : 1));
	} else {
		notes.sort((a, b) => (a.id > b.id ? -1 : 1));
	}

	return await packNoteManyForApi(deps, notes, me);
}
