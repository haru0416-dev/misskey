/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { endpointMetas as clipsContracts } from '@/server/api/metas/clips.js';
import type { ContractErrors } from '../endpoint-contract.js';
import type { ApiParams } from '../validation.js';
import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import {
	clipFavoriteExistsInDatabase,
	countClipFavoritesByClipIdsFromDatabase,
	countClipFavoritesFromDatabase,
	listFavoritedClipIdsByUserIdFromDatabase,
	listFavoritedClipIdsByUserIdAndClipIdsFromDatabase,
} from '@/core/clip/ClipFavoriteStore.js';
import {
	countClipNotesByClipIdFromDatabase,
	countClipNotesByClipIdsFromDatabase,
	createClipNoteWithinLimitInDatabase,
	deleteClipNoteAndDecrementNoteClippedCountInDatabase,
} from '@/core/clip/ClipNoteStore.js';
import {
	createClipWithinLimitInDatabase,
	deleteClipInDatabase,
	fetchClipByIdAndUserIdFromDatabase,
	fetchClipByIdFromDatabase,
	fetchClipByIdOrFailFromDatabase,
	listClipsByIdsFromDatabase,
	listClipsWithPaginationFromDatabase,
	updateClipInDatabase,
} from '@/core/clip/ClipStore.js';
import { fetchNoteByIdFromDatabase, listClipNotesFromDatabase } from '@/core/note/NoteStore.js';
import { isDuplicateKeyValueDatabaseError } from '@/misc/is-duplicate-key-value-database-error.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { MiClip } from '@/models/Clip.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { ApiError } from '../error.js';
import { packNoteManyForApi } from '../note/note.js';
import type { ApiNoteDependencies } from '../note/note.js';
import { getApiRolePolicies } from '../role/role-policy.js';
import type { ApiRolePolicyDependencies } from '../role/role-policy.js';
import { packUserLiteForApi, packUserLiteManyForApi } from '../user/user.js';
import type { UserPackingDependencies } from '../user/user.js';
import { parseApiParams } from '../validation.js';
import { resolveApiDateIdPagination } from '../date-id-pagination.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';

export type ApiClipDependencies = UserPackingDependencies & ApiRolePolicyDependencies;

export type ApiClipNotesDependencies = ApiNoteDependencies & {
	meta: MiMeta;
};

export const emptyParamDef = z.object({});

function getDatabaseErrorCode(error: unknown): unknown {
	let current: unknown = error;

	for (let i = 0; i < 5 && current != null && typeof current === 'object'; i++) {
		const candidate = current as {
			code?: unknown;
			cause?: unknown;
			driverError?: unknown;
		};

		if (candidate.code != null) {
			return candidate.code;
		}
		current = candidate.driverError ?? candidate.cause;
	}

	return undefined;
}

export const clipsListParamDef = z.object({
	limit: z.int().min(1).max(100).default(10),
	...paginationParams,
});

export const clipIdParamDef = z.object({
	clipId: misskeyId(),
});

export const clipNotesParamDef = z.object({
	clipId: misskeyId(),
	limit: z.int().min(1).max(100).default(10),
	...paginationParams,
	search: z.string().min(1).max(100).nullable().optional(),
});

export const clipsCreateParamDef = z.object({
	name: z.string().min(1).max(100),
	isPublic: z.boolean().default(false),
	description: z.string().max(2048).nullable().optional(),
});

export const clipsUpdateParamDef = z.object({
	clipId: misskeyId(),
	name: z.string().min(1).max(100).optional(),
	isPublic: z.boolean().optional(),
	description: z.string().max(2048).nullable().optional(),
});

export const clipsNoteParamDef = z.object({
	clipId: misskeyId(),
	noteId: misskeyId(),
});

export async function packClipForApi(
	deps: ApiClipDependencies,
	clip: MiClip,
	me: { id: MiUser['id'] } | null | undefined,
	hint?: {
		packedUser?: Packed<'UserLite'>;
		favoritedCount?: number;
		isFavorited?: boolean;
		notesCount?: number;
	},
): Promise<Packed<'Clip'>> {
	const meId = me ? me.id : null;

	const [user, favoritedCount, isFavorited, notesCount] = await Promise.all([
		hint?.packedUser ? Promise.resolve(hint.packedUser) : packUserLiteForApi(deps, clip.userId),
		hint?.favoritedCount !== undefined
			? Promise.resolve(hint.favoritedCount)
			: countClipFavoritesFromDatabase(deps.db, clip.id),
		hint?.isFavorited !== undefined
			? Promise.resolve(hint.isFavorited)
			: meId
				? clipFavoriteExistsInDatabase(deps.db, meId, clip.id)
				: Promise.resolve(undefined),
		hint?.notesCount !== undefined
			? Promise.resolve(hint.notesCount)
			: meId === clip.userId
				? countClipNotesByClipIdFromDatabase(deps.db, clip.id)
				: Promise.resolve(undefined),
	]);

	return {
		id: clip.id,
		createdAt: parseId(clip.id).date.toISOString(),
		lastClippedAt: clip.lastClippedAt ? clip.lastClippedAt.toISOString() : null,
		userId: clip.userId,
		user,
		name: clip.name,
		description: clip.description,
		isPublic: clip.isPublic,
		favoritedCount,
		isFavorited,
		notesCount,
	};
}

export async function packClipsManyForApi(
	deps: ApiClipDependencies,
	clips: MiClip[],
	me: { id: MiUser['id'] } | null | undefined,
): Promise<Packed<'Clip'>[]> {
	const userIds = [...new Set(clips.map((c) => c.userId))];
	const clipIds = clips.map((clip) => clip.id);
	const meId = me?.id ?? null;
	const ownedClipIds = meId == null ? [] : clips.filter((clip) => clip.userId === meId).map((clip) => clip.id);
	const [packedUsers, favoriteCounts, favoritedClipIds, noteCounts] = await Promise.all([
		packUserLiteManyForApi(deps, userIds),
		countClipFavoritesByClipIdsFromDatabase(deps.db, clipIds),
		meId == null ? Promise.resolve([]) : listFavoritedClipIdsByUserIdAndClipIdsFromDatabase(deps.db, meId, clipIds),
		countClipNotesByClipIdsFromDatabase(deps.db, ownedClipIds),
	]);
	const userById = new Map(packedUsers.map((u) => [u.id, u]));
	const favoritedClipIdSet = new Set(favoritedClipIds);

	return await Promise.all(
		clips.map((clip) =>
			packClipForApi(
				deps,
				clip,
				me,
				omitUndefined({
					packedUser: userById.get(clip.userId),
					favoritedCount: favoriteCounts.get(clip.id) ?? 0,
					isFavorited: meId == null ? undefined : favoritedClipIdSet.has(clip.id),
					notesCount: clip.userId === meId ? (noteCounts.get(clip.id) ?? 0) : undefined,
				}),
			),
		),
	);
}

export async function handleApiClipsList(
	deps: ApiClipDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof clipsListParamDef>,
): Promise<Packed<'Clip'>[]> {
	const pagination = resolveDateIdPagination({ gen: genId }, params);
	const clips = await listClipsWithPaginationFromDatabase(deps.db, {
		userId: me.id,
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packClipsManyForApi(deps, clips, me);
}

export async function handleApiClipsShow(
	deps: ApiClipDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	params: ApiParams<typeof clipIdParamDef>,
	errors: ContractErrors<(typeof clipsContracts)['clips/show']>,
): Promise<Packed<'Clip'>> {
	const clip = await fetchClipByIdFromDatabase(deps.db, params.clipId);
	if (clip == null) {
		throw errors.noSuchClip();
	}
	if (!clip.isPublic && (me == null || clip.userId !== me.id)) {
		throw errors.noSuchClip();
	}

	return await packClipForApi(deps, clip, me);
}

export async function handleApiClipsMyFavorites(deps: ApiClipDependencies, me: MiLocalUser): Promise<Packed<'Clip'>[]> {
	const clipIds = await listFavoritedClipIdsByUserIdFromDatabase(deps.db, me.id);
	if (clipIds.length === 0) {
		return [];
	}

	const clipById = new Map((await listClipsByIdsFromDatabase(deps.db, clipIds)).map((clip) => [clip.id, clip]));
	const clips = clipIds.map((id) => clipById.get(id)).filter((clip): clip is MiClip => clip != null);

	return await packClipsManyForApi(deps, clips, me);
}

export async function handleApiClipsCreate(
	deps: ApiClipDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof clipsCreateParamDef>,
	errors: ContractErrors<(typeof clipsContracts)['clips/create']>,
): Promise<Packed<'Clip'>> {
	const clip = await createClipWithinLimitInDatabase(
		deps.db,
		{
			id: genId(),
			userId: me.id,
			name: params.name,
			isPublic: params.isPublic,
			description: params.description || null,
		},
		(await getApiRolePolicies(deps, me)).clipLimit,
	);
	if (clip == null) {
		throw errors.tooManyClips();
	}

	return await packClipForApi(deps, clip, me);
}

export async function handleApiClipsUpdate(
	deps: ApiClipDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof clipsUpdateParamDef>,
	errors: ContractErrors<(typeof clipsContracts)['clips/update']>,
): Promise<Packed<'Clip'>> {
	const clip = await fetchClipByIdAndUserIdFromDatabase(deps.db, params.clipId, me.id);
	if (clip == null) {
		throw errors.noSuchClip();
	}

	await updateClipInDatabase(
		deps.db,
		clip.id,
		omitUndefined({
			name: params.name,
			description: params.description || null,
			isPublic: params.isPublic,
		}),
	);

	return await packClipForApi(deps, await fetchClipByIdOrFailFromDatabase(deps.db, clip.id), me);
}

export async function handleApiClipsDelete(
	deps: ApiClipDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof clipIdParamDef>,
	errors: ContractErrors<(typeof clipsContracts)['clips/delete']>,
): Promise<void> {
	const clip = await fetchClipByIdAndUserIdFromDatabase(deps.db, params.clipId, me.id);
	if (clip == null) {
		throw errors.noSuchClip();
	}

	await deleteClipInDatabase(deps.db, clip.id);
}

export async function handleApiClipsAddNote(
	deps: ApiClipDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof clipsNoteParamDef>,
	errors: ContractErrors<(typeof clipsContracts)['clips/add-note']>,
): Promise<void> {
	const clip = await fetchClipByIdAndUserIdFromDatabase(deps.db, params.clipId, me.id);
	if (clip == null) {
		throw errors.noSuchClip();
	}

	try {
		const result = await createClipNoteWithinLimitInDatabase(
			deps.db,
			{
				id: genId(),
				noteId: params.noteId,
				clipId: clip.id,
			},
			(await getApiRolePolicies(deps, me)).noteEachClipsLimit,
		);
		if (result === 'tooManyClipNotes') {
			throw errors.tooManyClipNotes();
		}
		if (result === 'noSuchNote') {
			throw errors.noSuchNote();
		}
	} catch (e: unknown) {
		if (e instanceof ApiError) {
			throw e;
		}
		if (isDuplicateKeyValueDatabaseError(e)) {
			throw errors.alreadyClipped();
		}
		if (getDatabaseErrorCode(e) === '23503') {
			throw errors.noSuchNote();
		}
		throw e;
	}
}

export async function handleApiClipsRemoveNote(
	deps: ApiClipDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof clipsNoteParamDef>,
	errors: ContractErrors<(typeof clipsContracts)['clips/remove-note']>,
): Promise<void> {
	const clip = await fetchClipByIdAndUserIdFromDatabase(deps.db, params.clipId, me.id);
	if (clip == null) {
		throw errors.noSuchClip();
	}

	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) {
		throw errors.noSuchNote();
	}

	await deleteClipNoteAndDecrementNoteClippedCountInDatabase(deps.db, { noteId: params.noteId, clipId: clip.id });
}

export async function handleApiClipsNotes(
	deps: ApiClipNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	params: ApiParams<typeof clipNotesParamDef>,
	errors: ContractErrors<(typeof clipsContracts)['clips/notes']>,
): Promise<Packed<'Note'>[]> {
	const clip = await fetchClipByIdFromDatabase(deps.db, params.clipId);
	if (clip == null) {
		throw errors.noSuchClip();
	}
	if (!clip.isPublic && (me == null || clip.userId !== me.id)) {
		throw errors.noSuchClip();
	}

	const { sinceId, untilId } = resolveApiDateIdPagination(params);

	const notes = await listClipNotesFromDatabase(
		deps.db,
		omitUndefined({
			clipId: clip.id,
			limit: params.limit,
			sinceId,
			untilId,
			searchWords:
				params.search != null
					? params.search
							.trim()
							.split(' ')
							.map((word) => sqlLikeEscape(word))
					: undefined,
			me: me ?? null,
			blockedHosts: deps.meta.blockedHosts,
		}),
	);

	return await packNoteManyForApi(deps, notes, me);
}

export const usersClipsParamDef = z.object({
	userId: misskeyId(),
	limit: z.int().min(1).max(100).default(10),
	...paginationParams,
});

export async function handleApiUsersClips(
	deps: ApiClipDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	params: ApiParams<typeof usersClipsParamDef>,
): Promise<Packed<'Clip'>[]> {
	const pagination = resolveDateIdPagination({ gen: genId }, params);
	const clips = await listClipsWithPaginationFromDatabase(deps.db, {
		userId: params.userId,
		isPublic: true,
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packClipsManyForApi(deps, clips, me);
}
