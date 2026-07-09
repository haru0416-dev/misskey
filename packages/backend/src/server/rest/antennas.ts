/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';
import type * as Redis from 'ioredis';
import { z } from 'zod';
import {
	appendUserToAntennasInDatabase,
	countAntennasByUserIdFromDatabase,
	createAntennaInDatabase,
	deleteAntennaFromDatabase,
	fetchAntennaByIdAndUserIdFromDatabase,
	fetchAntennaByIdOrFailFromDatabase,
	listActiveAntennasFromDatabase,
	listAntennasByIdsFromDatabase,
	listAntennasByUserIdFromDatabase,
	updateAntennaInDatabase,
} from '@/core/AntennaStore.js';
import { fetchActiveMutedChannelIdsFromDatabase } from '@/core/ChannelMutingStore.js';
import { followingExistsInDatabase } from '@/core/FollowingStore.js';
import { listFilteredTimelineNotesByIdsFromDatabase } from '@/core/NoteStore.js';
import { listUserListIdsContainingUserFromDatabase, userListMembershipExistsInDatabase } from '@/core/UserListMembershipStore.js';
import { fetchUserListByIdAndUserIdFromDatabase } from '@/core/UserListStore.js';
import * as Acct from '@/misc/acct.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiAntenna } from '@/models/Antenna.js';
import type { MiNote } from '@/models/Note.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { HonoApiError } from './error.js';
import type { HonoApiAntennaStreamPublisher, HonoApiInternalEventPublisher } from './events.js';
import { packNoteManyForHonoApi, type HonoApiNoteDependencies } from './note.js';
import { getHonoApiRolePolicies, type HonoApiRolePolicyDependencies } from './role-policy.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAntennaDependencies = HonoApiNoteDependencies & HonoApiRolePolicyDependencies & {
	publishInternalEvent?: HonoApiInternalEventPublisher;
};

export type HonoApiAntennaFanoutDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	redisForTimelines: Redis.Redis;
	publishAntennaStream?: HonoApiAntennaStreamPublisher;
};

function getFullApAccount(config: Pick<Config, 'host'>, username: string, host: string | null): string {
	return host ? `${username}@${domainToASCII(host.toLowerCase())}` : `${username}@${domainToASCII(config.host.toLowerCase())}`;
}

/** AntennaService.checkHitAntenna 相当。 */
export async function checkHitAntennaForHonoApi(
	deps: Pick<HonoApiAntennaFanoutDependencies, 'config' | 'db'>,
	antenna: MiAntenna,
	note: MiNote,
	noteUser: { id: MiUser['id']; username: string; host: string | null; isBot: boolean },
	hint?: { listMembershipUserListIds: Set<string> },
): Promise<boolean> {
	if (antenna.excludeNotesInSensitiveChannel && note.channel?.isSensitive) return false;

	if (antenna.excludeBots && noteUser.isBot) return false;

	if (antenna.localOnly && noteUser.host != null) return false;

	if (!antenna.withReplies && note.replyId != null) return false;

	if (note.visibility === 'specified') {
		if (note.userId !== antenna.userId) {
			if (note.visibleUserIds == null) return false;
			if (!note.visibleUserIds.includes(antenna.userId)) return false;
		}
	}

	if (note.visibility === 'followers') {
		const isFollowing = await followingExistsInDatabase(deps.db, antenna.userId, note.userId);
		if (!isFollowing && antenna.userId !== note.userId) return false;
	}

	if (antenna.src === 'list') {
		if (antenna.userListId == null) return false;
		const exists = hint
			? hint.listMembershipUserListIds.has(antenna.userListId)
			: await userListMembershipExistsInDatabase(deps.db, note.userId, antenna.userListId);
		if (!exists) return false;
	} else if (antenna.src === 'users') {
		const accts = antenna.users.map(x => {
			const { username, host } = Acct.parse(x);
			return getFullApAccount(deps.config, username, host).toLowerCase();
		});
		if (!accts.includes(getFullApAccount(deps.config, noteUser.username, noteUser.host).toLowerCase())) return false;
	} else if (antenna.src === 'users_blacklist') {
		const accts = antenna.users.map(x => {
			const { username, host } = Acct.parse(x);
			return getFullApAccount(deps.config, username, host).toLowerCase();
		});
		if (accts.includes(getFullApAccount(deps.config, noteUser.username, noteUser.host).toLowerCase())) return false;
	}

	const keywords = antenna.keywords
		.map(xs => xs.filter(x => x !== ''))
		.filter(xs => xs.length > 0);

	if (keywords.length > 0) {
		if (note.text == null && note.cw == null) return false;

		const _text = (note.text ?? '') + '\n' + (note.cw ?? '');

		const matched = keywords.some(and =>
			and.every(keyword =>
				antenna.caseSensitive
					? _text.includes(keyword)
					: _text.toLowerCase().includes(keyword.toLowerCase()),
			));

		if (!matched) return false;
	}

	const excludeKeywords = antenna.excludeKeywords
		.map(xs => xs.filter(x => x !== ''))
		.filter(xs => xs.length > 0);

	if (excludeKeywords.length > 0) {
		if (note.text == null && note.cw == null) return false;

		const _text = (note.text ?? '') + '\n' + (note.cw ?? '');

		const matched = excludeKeywords.some(and =>
			and.every(keyword =>
				antenna.caseSensitive
					? _text.includes(keyword)
					: _text.toLowerCase().includes(keyword.toLowerCase()),
			));

		if (matched) return false;
	}

	if (antenna.withFile) {
		if (note.fileIds && note.fileIds.length === 0) return false;
	}

	return true;
}

/**
 * AntennaService.onMoveAccount 相当。src ユーザーを users リストに含むアンテナへ dst の acct を追記する。
 * 原典はプロセス内キャッシュ (getAntennas) からアンテナ一覧を取得していたが、addNoteToAntennasForHonoApi
 * と同じ判断で毎回DBから読む。
 */
export async function onMoveAccountForHonoApi(
	deps: { config: Pick<Config, 'host'>; db: MiDrizzleDatabase; publishInternalEvent?: HonoApiInternalEventPublisher },
	src: MiUser,
	dst: MiUser,
): Promise<void> {
	// There is a possibility for users to add the srcUser to their antennas, but it's low, so we don't check it.

	const srcUserAcct = getFullApAccount(deps.config, src.username, src.host).toLowerCase();
	const antennasToMigrate = (await listActiveAntennasFromDatabase(deps.db)).filter(antenna => {
		return antenna.users.some(user => {
			const { username, host } = Acct.parse(user);
			return getFullApAccount(deps.config, username, host).toLowerCase() === srcUserAcct;
		});
	});

	if (antennasToMigrate.length === 0) return;

	const antennaIds = antennasToMigrate.map(x => x.id);

	// Update the antennas by appending dst users acct to the users list
	const dstUserAcct = '@' + Acct.toString({ username: dst.username, host: dst.host });

	await appendUserToAntennasInDatabase(deps.db, antennaIds, dstUserAcct);

	// announce update to event
	for (const newAntenna of await listAntennasByIdsFromDatabase(deps.db, antennaIds)) {
		deps.publishInternalEvent?.('antennaUpdated', newAntenna);
	}
}

/**
 * AntennaService.addNoteToAntennas 相当。原典はプロセス内キャッシュからアクティブなアンテナ一覧を
 * 取得していたが、ここでは毎回DBから読む (このコードベースのキャッシュ再導入リスクを踏まえた判断)。
 * FanoutTimelineService.push と同じく直近3分以内のノートのみ即時lpushし、古いノートは末尾IDと比較する。
 */
export async function addNoteToAntennasForHonoApi(
	deps: HonoApiAntennaFanoutDependencies,
	note: MiNote,
	noteUser: { id: MiUser['id']; username: string; host: string | null; isBot: boolean },
): Promise<void> {
	const antennas = await listActiveAntennasFromDatabase(deps.db);

	// src === 'list' なアンテナの userListId をまとめて1クエリで所属判定する (アンテナ毎の exists クエリを回避)。
	const listAntennaUserListIds = [...new Set(
		antennas
			.filter((antenna): antenna is MiAntenna & { userListId: string } => antenna.src === 'list' && antenna.userListId != null)
			.map(antenna => antenna.userListId),
	)];
	const listMembershipUserListIds = await listUserListIdsContainingUserFromDatabase(deps.db, note.userId, listAntennaUserListIds);

	const antennasWithMatchResult = await Promise.all(antennas.map(antenna => checkHitAntennaForHonoApi(deps, antenna, note, noteUser, { listMembershipUserListIds }).then(hit => [antenna, hit] as const)));
	const matchedAntennas = antennasWithMatchResult.filter(([, hit]) => hit).map(([antenna]) => antenna);

	const redisPipeline = deps.redisForTimelines.pipeline();

	for (const antenna of matchedAntennas) {
		const tl = `antennaTimeline:${antenna.id}`;
		if (parseId(note.id).date.getTime() > Date.now() - 1000 * 60 * 3) {
			redisPipeline.lpush('list:' + tl, note.id);
			if (Math.random() < 0.1) {
				redisPipeline.ltrim('list:' + tl, 0, 200 - 1);
			}
		} else {
			void deps.redisForTimelines.lindex('list:' + tl, -1).then(lastId => {
				if (lastId == null || parseId(note.id).date.getTime() > parseId(lastId).date.getTime()) {
					void deps.redisForTimelines.lpush('list:' + tl, note.id);
				}
			});
		}
		deps.publishAntennaStream?.(antenna.id, 'note', note);
	}

	void redisPipeline.exec();
}

function noSuchAntennaError(id: string): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such antenna.', code: 'NO_SUCH_ANTENNA', id });
}

function noSuchUserListError(id: string): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such user list.', code: 'NO_SUCH_USER_LIST', id });
}

function emptyKeywordError(id: string): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Either keywords or excludeKeywords is required.', code: 'EMPTY_KEYWORD', id });
}

async function packAntennaForHonoApi(
	deps: { db: HonoApiAntennaDependencies['db']; config: HonoApiAntennaDependencies['config'] },
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

export const antennasCreateParamDef = z.object({
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
});

type AntennasCreateParams = {
	name: string;
	src: typeof antennaSrcEnum[number];
	userListId?: string | null;
	keywords: string[][];
	excludeKeywords: string[][];
	users: string[];
	caseSensitive: boolean;
	localOnly?: boolean;
	excludeBots?: boolean;
	withReplies: boolean;
	withFile: boolean;
	excludeNotesInSensitiveChannel?: boolean;
};

export async function handleHonoApiAntennasCreate(
	deps: HonoApiAntennaDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Antenna'>> {
	const params = parseHonoApiParams(antennasCreateParamDef, body);

	if (params.keywords.flat().every(x => x === '') && params.excludeKeywords.flat().every(x => x === '')) {
		throw emptyKeywordError('53ee222e-1ddd-4f9a-92e5-9fb82ddb463a');
	}

	const policies = await getHonoApiRolePolicies(deps, me);
	const currentAntennasCount = await countAntennasByUserIdFromDatabase(deps.db, me.id);
	if (currentAntennasCount >= policies.antennaLimit) {
		throw new HonoApiError({ status: 400, message: 'You cannot create antenna any more.', code: 'TOO_MANY_ANTENNAS', id: 'faf47050-e8b5-438c-913c-db2b1576fde4' });
	}

	let userList;
	if (params.src === 'list' && params.userListId) {
		userList = await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.userListId, me.id);
		if (userList == null) throw noSuchUserListError('95063e93-a283-4b8b-9aa5-bcdb8df69a7f');
	}

	const now = new Date();
	const antenna = await createAntennaInDatabase(deps.db, {
		id: genId(now.getTime()),
		lastUsedAt: now,
		userId: me.id,
		name: params.name,
		src: params.src,
		userListId: userList ? userList.id : null,
		keywords: params.keywords,
		excludeKeywords: params.excludeKeywords,
		users: params.users,
		caseSensitive: params.caseSensitive,
		localOnly: params.localOnly ?? false,
		excludeBots: params.excludeBots ?? false,
		withReplies: params.withReplies,
		withFile: params.withFile,
		excludeNotesInSensitiveChannel: params.excludeNotesInSensitiveChannel ?? false,
	});

	deps.publishInternalEvent?.('antennaCreated', antenna);

	return await packAntennaForHonoApi(deps, antenna);
}

export const antennasUpdateParamDef = z.object({
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
});

type AntennasUpdateParams = {
	antennaId: string;
	name?: string;
	src?: typeof antennaSrcEnum[number];
	userListId?: string | null;
	keywords?: string[][];
	excludeKeywords?: string[][];
	users?: string[];
	caseSensitive?: boolean;
	localOnly?: boolean;
	excludeBots?: boolean;
	withReplies?: boolean;
	withFile?: boolean;
	excludeNotesInSensitiveChannel?: boolean;
};

export async function handleHonoApiAntennasUpdate(
	deps: HonoApiAntennaDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Antenna'>> {
	const params = parseHonoApiParams(antennasUpdateParamDef, body);

	if (params.keywords && params.excludeKeywords) {
		if (params.keywords.flat().every(x => x === '') && params.excludeKeywords.flat().every(x => x === '')) {
			throw emptyKeywordError('721aaff6-4e1b-4d88-8de6-877fae9f68c4');
		}
	}

	const antenna = await fetchAntennaByIdAndUserIdFromDatabase(deps.db, params.antennaId, me.id);
	if (antenna == null) throw noSuchAntennaError('10c673ac-8852-48eb-aa1f-f5b67f069290');

	let userList;
	if ((params.src === 'list' || antenna.src === 'list') && params.userListId) {
		userList = await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.userListId, me.id);
		if (userList == null) throw noSuchUserListError('1c6b35c9-943e-48c2-81e4-2844989407f7');
	}

	await updateAntennaInDatabase(deps.db, antenna.id, {
		name: params.name,
		src: params.src,
		userListId: params.userListId !== undefined ? (userList ? userList.id : null) : undefined,
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
	});

	deps.publishInternalEvent?.('antennaUpdated', await fetchAntennaByIdOrFailFromDatabase(deps.db, antenna.id));

	return await packAntennaForHonoApi(deps, antenna.id);
}

export const antennasDeleteParamDef = z.object({
	antennaId: misskeyId(),
});

type AntennasDeleteParams = {
	antennaId: string;
};

export async function handleHonoApiAntennasDelete(
	deps: HonoApiAntennaDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(antennasDeleteParamDef, body);

	const antenna = await fetchAntennaByIdAndUserIdFromDatabase(deps.db, params.antennaId, me.id);
	if (antenna == null) throw noSuchAntennaError('b34dcf9d-348f-44bb-99d0-6c9314cfe2df');

	await deleteAntennaFromDatabase(deps.db, antenna.id);

	deps.publishInternalEvent?.('antennaDeleted', antenna);
}

export const antennasListParamDef = z.object({});

export async function handleHonoApiAntennasList(
	deps: HonoApiAntennaDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Antenna'>[]> {
	parseHonoApiParams(antennasListParamDef, body);

	const antennas = await listAntennasByUserIdFromDatabase(deps.db, me.id);

	return await Promise.all(antennas.map(x => packAntennaForHonoApi(deps, x)));
}

export const antennasShowParamDef = z.object({
	antennaId: misskeyId(),
});

type AntennasShowParams = {
	antennaId: string;
};

export async function handleHonoApiAntennasShow(
	deps: HonoApiAntennaDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Antenna'>> {
	const params = parseHonoApiParams(antennasShowParamDef, body);

	const antenna = await fetchAntennaByIdAndUserIdFromDatabase(deps.db, params.antennaId, me.id);
	if (antenna == null) throw noSuchAntennaError('c06569fb-b025-4f23-b22d-1fcd20d2816b');

	return await packAntennaForHonoApi(deps, antenna);
}

export const antennasRemoveNoteParamDef = z.object({
	antennaId: misskeyId(),
	noteId: misskeyId(),
});

type AntennasRemoveNoteParams = {
	antennaId: string;
	noteId: string;
};

export async function handleHonoApiAntennasRemoveNote(
	deps: HonoApiAntennaDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(antennasRemoveNoteParamDef, body);

	const antenna = await fetchAntennaByIdAndUserIdFromDatabase(deps.db, params.antennaId, me.id);
	if (antenna == null) throw noSuchAntennaError('850926e0-fd3b-49b6-b69a-b28a5dbd82fe');

	await deps.redis.lrem(`list:antennaTimeline:${antenna.id}`, 1, params.noteId);
}

export const antennasNotesParamDef = z.object({
	antennaId: misskeyId(),
	limit: z.number().int().min(1).max(100).default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});

type AntennasNotesParams = {
	antennaId: string;
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleHonoApiAntennasNotes(
	deps: HonoApiAntennaDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(antennasNotesParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : null);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : null);

	const antenna = await fetchAntennaByIdAndUserIdFromDatabase(deps.db, params.antennaId, me.id);
	if (antenna == null) throw noSuchAntennaError('850926e0-fd3b-49b6-b69a-b28a5dbd82fe');

	const needPublishEvent = !antenna.isActive;
	antenna.isActive = true;
	antenna.lastUsedAt = new Date();
	trackPromise(updateAntennaInDatabase(deps.db, antenna.id, {
		isActive: antenna.isActive,
		lastUsedAt: antenna.lastUsedAt,
	}));

	if (needPublishEvent) {
		deps.publishInternalEvent?.('antennaUpdated', antenna);
	}

	const rawIds = await deps.redis.lrange(`list:antennaTimeline:${antenna.id}`, 0, -1);
	let noteIds = untilId && sinceId
		? rawIds.filter(id => id < untilId && id > sinceId).sort((a, b) => a > b ? -1 : 1)
		: untilId
			? rawIds.filter(id => id < untilId).sort((a, b) => a > b ? -1 : 1)
			: sinceId
				? rawIds.filter(id => id > sinceId).sort((a, b) => a < b ? -1 : 1)
				: rawIds.sort((a, b) => a > b ? -1 : 1);
	noteIds = noteIds.slice(0, params.limit);

	if (noteIds.length === 0) return [];

	const mutingChannelIds = await fetchActiveMutedChannelIdsFromDatabase(deps.db, me.id, new Date());

	const notes = await listFilteredTimelineNotesByIdsFromDatabase(deps.db, {
		ids: noteIds,
		me,
		blockedHosts: deps.meta.blockedHosts,
		mutingChannelIds,
	});
	if (sinceId != null && untilId == null) {
		notes.sort((a, b) => a.id < b.id ? -1 : 1);
	} else {
		notes.sort((a, b) => a.id > b.id ? -1 : 1);
	}

	return await packNoteManyForHonoApi(deps, notes, me);
}
