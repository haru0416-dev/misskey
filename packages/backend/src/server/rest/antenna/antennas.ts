/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ApiParams } from '../validation.js';
import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import { antennaKeywordMatrixSchema } from '@/core/antenna/antenna-keywords.js';
import {
	createAntennasWithinLimitInDatabase,
	deleteAntennaFromDatabase,
	fetchAntennaByIdAndUserIdFromDatabase,
	fetchAntennaByIdOrFailFromDatabase,
	listAntennasByUserIdFromDatabase,
	updateAntennaInDatabase,
} from '@/core/antenna/AntennaStore.js';
import { listActiveMutedChannelIdsByUserIdFromDatabase } from '@/core/channel/ChannelMutingStore.js';
import { listFilteredTimelineNotesByIdsFromDatabase } from '@/core/note/NoteStore.js';
import { fetchUserListByIdAndUserIdFromDatabase } from '@/core/user/UserListStore.js';
import { fetchUserByIdFromDatabase } from '@/core/user/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { MiAntenna } from '@/models/Antenna.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MiUserList } from '@/models/UserList.js';
import { ApiError } from '../error.js';
import type { InternalEventPublisher } from '../../../core/events.js';
import { packNoteManyForApi } from '../note/note.js';
import type { NoteDependencies } from '../../../core/note/note-packing.js';
import { getRolePolicies } from '../../../core/role/role-policy.js';
import type { RolePolicyDependencies } from '../../../core/role/role-policy.js';
import { collectRedisListTimelineNotes } from '../note/redis-list-timeline.js';
import { resolveApiDateIdBounds } from '../date-id-pagination.js';

export type ApiAntennaDependencies = NoteDependencies &
	RolePolicyDependencies & {
		publishInternalEvent?: InternalEventPublisher;
	};

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
		keywords: antennaKeywordMatrixSchema,
		excludeKeywords: antennaKeywordMatrixSchema,
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
	params: ApiParams<typeof antennasCreateParamDef>,
): Promise<Packed<'Antenna'>> {
	if (params.keywords.flat().every((x) => x === '') && params.excludeKeywords.flat().every((x) => x === '')) {
		throw emptyKeywordError('53ee222e-1ddd-4f9a-92e5-9fb82ddb463a');
	}

	// src が 'list' のアンテナは userListId を必ず持つ (持たないと checkHitAntenna が常に false になり、
	// いずれにもマッチしないアンテナになる)。DB 側にも CHK_ANTENNA_LIST_SRC_REQUIRES_USER_LIST がある。
	let userListId: MiUserList['id'] | null = null;
	if (params.src === 'list') {
		if (params.userListId == null) {
			throw noSuchUserListError('95063e93-a283-4b8b-9aa5-bcdb8df69a7f');
		}
		const userList = await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.userListId, me.id);
		if (userList == null) {
			throw noSuchUserListError('95063e93-a283-4b8b-9aa5-bcdb8df69a7f');
		}
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
			if (currentUser == null) {
				throw new Error('Authenticated user no longer exists');
			}
			return (await getRolePolicies({ ...deps, db: tx }, currentUser)).antennaLimit;
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
	if (antenna == null) {
		throw new Error('Failed to create antenna');
	}
	deps.publishInternalEvent?.('antennaCreated', antenna);

	return await packAntennaForApi(deps, antenna);
}

export const antennasUpdateParamDef = z
	.object({
		antennaId: misskeyId(),
		name: z.string().min(1).max(100).optional(),
		src: z.enum(antennaSrcEnum).optional(),
		userListId: misskeyId().nullable().optional(),
		keywords: antennaKeywordMatrixSchema.optional(),
		excludeKeywords: antennaKeywordMatrixSchema.optional(),
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
	params: ApiParams<typeof antennasUpdateParamDef>,
): Promise<Packed<'Antenna'>> {
	if (params.keywords && params.excludeKeywords) {
		if (params.keywords.flat().every((x) => x === '') && params.excludeKeywords.flat().every((x) => x === '')) {
			throw emptyKeywordError('721aaff6-4e1b-4d88-8de6-877fae9f68c4');
		}
	}

	const antenna = await fetchAntennaByIdAndUserIdFromDatabase(deps.db, params.antennaId, me.id);
	if (antenna == null) {
		throw noSuchAntennaError('10c673ac-8852-48eb-aa1f-f5b67f069290');
	}

	// undefined は変更なしを表す。
	let userListIdUpdate: MiUserList['id'] | null | undefined = undefined;
	if (params.userListId != null) {
		const userList = await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.userListId, me.id);
		if (userList == null) {
			throw noSuchUserListError('1c6b35c9-943e-48c2-81e4-2844989407f7');
		}
		userListIdUpdate = userList.id;
	} else if (params.userListId === null) {
		userListIdUpdate = null;
	}

	const nextSrc = params.src ?? antenna.src;
	if (nextSrc === 'list') {
		// list アンテナは userListId を必須とする。
		const nextUserListId = userListIdUpdate !== undefined ? userListIdUpdate : antenna.userListId;
		if (nextUserListId == null) {
			throw noSuchUserListError('1c6b35c9-943e-48c2-81e4-2844989407f7');
		}
	} else if (userListIdUpdate != null || antenna.userListId != null) {
		// list 以外では userListId を保持しない。
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
	params: ApiParams<typeof antennasDeleteParamDef>,
): Promise<void> {
	const antenna = await fetchAntennaByIdAndUserIdFromDatabase(deps.db, params.antennaId, me.id);
	if (antenna == null) {
		throw noSuchAntennaError('b34dcf9d-348f-44bb-99d0-6c9314cfe2df');
	}

	await deleteAntennaFromDatabase(deps.db, antenna.id);

	deps.publishInternalEvent?.('antennaDeleted', antenna);
}

export const antennasListParamDef = z.object({});

export async function handleApiAntennasList(
	deps: ApiAntennaDependencies,
	me: MiLocalUser,
): Promise<Packed<'Antenna'>[]> {
	const antennas = await listAntennasByUserIdFromDatabase(deps.db, me.id);

	return await Promise.all(antennas.map((x) => packAntennaForApi(deps, x)));
}

export const antennasShowParamDef = z.object({
	antennaId: misskeyId(),
});

export async function handleApiAntennasShow(
	deps: ApiAntennaDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof antennasShowParamDef>,
): Promise<Packed<'Antenna'>> {
	const antenna = await fetchAntennaByIdAndUserIdFromDatabase(deps.db, params.antennaId, me.id);
	if (antenna == null) {
		throw noSuchAntennaError('c06569fb-b025-4f23-b22d-1fcd20d2816b');
	}

	return await packAntennaForApi(deps, antenna);
}

export const antennasRemoveNoteParamDef = z.object({
	antennaId: misskeyId(),
	noteId: misskeyId(),
});

export async function handleApiAntennasRemoveNote(
	deps: ApiAntennaDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof antennasRemoveNoteParamDef>,
): Promise<void> {
	const antenna = await fetchAntennaByIdAndUserIdFromDatabase(deps.db, params.antennaId, me.id);
	if (antenna == null) {
		throw noSuchAntennaError('850926e0-fd3b-49b6-b69a-b28a5dbd82fe');
	}

	// 配布の再試行で二重に入った ID も残さないよう、件数 0 (全件) で消す。
	await deps.redis.lrem(`list:antennaTimeline:${antenna.id}`, 0, params.noteId);
}

export const antennasNotesParamDef = z.object({
	antennaId: misskeyId(),
	limit: z.int().min(1).max(100).default(10),
	...paginationParams,
});

export async function handleApiAntennasNotes(
	deps: ApiAntennaDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof antennasNotesParamDef>,
): Promise<Packed<'Note'>[]> {
	const { sinceId, untilId } = resolveApiDateIdBounds(params);

	const antenna = await fetchAntennaByIdAndUserIdFromDatabase(deps.db, params.antennaId, me.id);
	if (antenna == null) {
		throw noSuchAntennaError('850926e0-fd3b-49b6-b69a-b28a5dbd82fe');
	}

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

	// 候補が無ければ絞り込みを呼ばないので、ミュートの一覧もそのときまで読まない。
	let mutingChannelIds: string[] | undefined;
	const notes = await collectRedisListTimelineNotes(
		deps.redis,
		`list:antennaTimeline:${antenna.id}`,
		{ sinceId, untilId, limit: params.limit },
		async (ids) =>
			await listFilteredTimelineNotesByIdsFromDatabase(deps.db, {
				ids,
				me,
				blockedHosts: deps.meta.blockedHosts,
				mutingChannelIds: (mutingChannelIds ??= await listActiveMutedChannelIdsByUserIdFromDatabase(
					deps.db,
					me.id,
					new Date(),
				)),
			}),
	);

	return await packNoteManyForApi(deps, notes, me);
}
