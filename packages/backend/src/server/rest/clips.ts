/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import { clipFavoriteExistsInDatabase, countClipFavoritesByClipIdsFromDatabase, countClipFavoritesFromDatabase, listFavoritedClipIdsByUserIdFromDatabase, listFavoritedClipIdsByUserIdAndClipIdsFromDatabase } from '@/core/ClipFavoriteStore.js';
import { countClipNotesByClipIdFromDatabase, countClipNotesByClipIdsFromDatabase, createClipNoteInDatabase, deleteClipNoteAndDecrementNoteClippedCountInDatabase } from '@/core/ClipNoteStore.js';
import {
	countClipsByUserIdFromDatabase,
	createClipInDatabase,
	deleteClipInDatabase,
	fetchClipByIdAndUserIdFromDatabase,
	fetchClipByIdFromDatabase,
	fetchClipByIdOrFailFromDatabase,
	listClipsByIdsFromDatabase,
	listClipsWithPaginationFromDatabase,
	resolveClipPagination,
	updateClipInDatabase,
} from '@/core/ClipStore.js';
import { adjustNoteClippedCountInDatabase, fetchNoteByIdFromDatabase, listClipNotesFromDatabase } from '@/core/NoteStore.js';
import { isDuplicateKeyValueDatabaseError } from '@/misc/is-duplicate-key-value-database-error.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiClip } from '@/models/Clip.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { HonoApiError } from './error.js';
import { packNoteManyForHonoApi, type HonoApiNoteDependencies } from './note.js';
import { getHonoApiRolePolicies, type HonoApiRolePolicyDependencies } from './role-policy.js';
import { packUserLiteForHonoApi, packUserLiteManyForHonoApi, type UserPackingDependencies } from './user.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiClipDependencies = UserPackingDependencies & HonoApiRolePolicyDependencies;

export type HonoApiClipNotesDependencies = HonoApiNoteDependencies & {
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

		if (candidate.code != null) return candidate.code;
		current = candidate.driverError ?? candidate.cause;
	}

	return undefined;
}

export const clipsListParamDef = z.object({
	limit: z.number().int().min(1).max(100).default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});

type ClipsListParams = {
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export const clipIdParamDef = z.object({
	clipId: misskeyId(),
});

export const clipNotesParamDef = z.object({
	clipId: misskeyId(),
	limit: z.number().int().min(1).max(100).default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	search: z.string().min(1).max(100).nullable().optional(),
});

type ClipNotesParams = {
	clipId: string;
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
	search?: string | null;
};

type ClipIdParams = {
	clipId: string;
};

export const clipsCreateParamDef = z.object({
	name: z.string().min(1).max(100),
	isPublic: z.boolean().default(false),
	description: z.string().max(2048).nullable().optional(),
});

type ClipsCreateParams = {
	name: string;
	isPublic: boolean;
	description?: string | null;
};

export const clipsUpdateParamDef = z.object({
	clipId: misskeyId(),
	name: z.string().min(1).max(100).optional(),
	isPublic: z.boolean().optional(),
	description: z.string().max(2048).nullable().optional(),
});

type ClipsUpdateParams = {
	clipId: string;
	name?: string;
	isPublic?: boolean;
	description?: string | null;
};

export const clipsNoteParamDef = z.object({
	clipId: misskeyId(),
	noteId: misskeyId(),
});

type ClipsNoteParams = {
	clipId: string;
	noteId: string;
};

function clipsShowNoSuchClipError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such clip.', code: 'NO_SUCH_CLIP', id: 'c3c5fe33-d62c-44d2-9ea5-d997703f5c20' });
}

function clipsCreateTooManyClipsError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'You cannot create clip any more.', code: 'TOO_MANY_CLIPS', id: '920f7c2d-6208-4b76-8082-e632020f5883' });
}

function clipsUpdateNoSuchClipError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such clip.', code: 'NO_SUCH_CLIP', id: 'b4d92d70-b216-46fa-9a3f-a8c811699257' });
}

function clipsDeleteNoSuchClipError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such clip.', code: 'NO_SUCH_CLIP', id: '70ca08ba-6865-4630-b6fb-8494759aa754' });
}

function clipsAddNoteNoSuchClipError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such clip.', code: 'NO_SUCH_CLIP', id: 'd6e76cc0-a1b5-4c7c-a287-73fa9c716dcf' });
}

function clipsAddNoteNoSuchNoteError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such note.', code: 'NO_SUCH_NOTE', id: 'fc8c0b49-c7a3-4664-a0a6-b418d386bb8b' });
}

function clipsAddNoteAlreadyClippedError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'The note has already been clipped.', code: 'ALREADY_CLIPPED', id: '734806c4-542c-463a-9311-15c512803965' });
}

function clipsAddNoteTooManyClipNotesError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'You cannot add notes to the clip any more.', code: 'TOO_MANY_CLIP_NOTES', id: 'f0dba960-ff73-4615-8df4-d6ac5d9dc118' });
}

function clipsRemoveNoteNoSuchClipError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such clip.', code: 'NO_SUCH_CLIP', id: 'b80525c6-97f7-49d7-a42d-ebccd49cfd52' });
}

function clipsRemoveNoteNoSuchNoteError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such note.', code: 'NO_SUCH_NOTE', id: 'aff017de-190e-434b-893e-33a9ff5049d8' });
}

export async function packClipForHonoApi(
	deps: HonoApiClipDependencies,
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
		hint?.packedUser ? Promise.resolve(hint.packedUser) : packUserLiteForHonoApi(deps, clip.userId),
		hint?.favoritedCount !== undefined ? Promise.resolve(hint.favoritedCount) : countClipFavoritesFromDatabase(deps.db, clip.id),
		hint?.isFavorited !== undefined ? Promise.resolve(hint.isFavorited) : meId ? clipFavoriteExistsInDatabase(deps.db, meId, clip.id) : Promise.resolve(undefined),
		hint?.notesCount !== undefined ? Promise.resolve(hint.notesCount) : meId === clip.userId ? countClipNotesByClipIdFromDatabase(deps.db, clip.id) : Promise.resolve(undefined),
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

export async function packClipsManyForHonoApi(
	deps: HonoApiClipDependencies,
	clips: MiClip[],
	me: { id: MiUser['id'] } | null | undefined,
): Promise<Packed<'Clip'>[]> {
	const userIds = [...new Set(clips.map(c => c.userId))];
	const clipIds = clips.map(clip => clip.id);
	const meId = me?.id ?? null;
	const ownedClipIds = meId == null ? [] : clips.filter(clip => clip.userId === meId).map(clip => clip.id);
	const [packedUsers, favoriteCounts, favoritedClipIds, noteCounts] = await Promise.all([
		packUserLiteManyForHonoApi(deps, userIds),
		countClipFavoritesByClipIdsFromDatabase(deps.db, clipIds),
		meId == null ? Promise.resolve([]) : listFavoritedClipIdsByUserIdAndClipIdsFromDatabase(deps.db, meId, clipIds),
		countClipNotesByClipIdsFromDatabase(deps.db, ownedClipIds),
	]);
	const userById = new Map(packedUsers.map(u => [u.id, u]));
	const favoritedClipIdSet = new Set(favoritedClipIds);

	return await Promise.all(clips.map(clip => packClipForHonoApi(deps, clip, me, omitUndefined({
		packedUser: userById.get(clip.userId),
		favoritedCount: favoriteCounts.get(clip.id) ?? 0,
		isFavorited: meId == null ? undefined : favoritedClipIdSet.has(clip.id),
		notesCount: clip.userId === meId ? (noteCounts.get(clip.id) ?? 0) : undefined,
	}))));
}

export async function handleHonoApiClipsList(
	deps: HonoApiClipDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Clip'>[]> {
	const params = parseHonoApiParams(clipsListParamDef, body);
	const pagination = resolveClipPagination({ gen: (time) => genId(time) }, params);
	const clips = await listClipsWithPaginationFromDatabase(deps.db, {
		userId: me.id,
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packClipsManyForHonoApi(deps, clips, me);
}

export async function handleHonoApiClipsShow(
	deps: HonoApiClipDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Clip'>> {
	const params = parseHonoApiParams(clipIdParamDef, body);
	const clip = await fetchClipByIdFromDatabase(deps.db, params.clipId);
	if (clip == null) throw clipsShowNoSuchClipError();
	if (!clip.isPublic && (me == null || clip.userId !== me.id)) throw clipsShowNoSuchClipError();

	return await packClipForHonoApi(deps, clip, me);
}

export async function handleHonoApiClipsMyFavorites(
	deps: HonoApiClipDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Clip'>[]> {
	parseHonoApiParams(emptyParamDef, body);
	const clipIds = await listFavoritedClipIdsByUserIdFromDatabase(deps.db, me.id);
	if (clipIds.length === 0) return [];

	const clipById = new Map((await listClipsByIdsFromDatabase(deps.db, clipIds)).map(clip => [clip.id, clip]));
	const clips = clipIds.map(id => clipById.get(id)).filter((clip): clip is MiClip => clip != null);

	return await packClipsManyForHonoApi(deps, clips, me);
}

export async function handleHonoApiClipsCreate(
	deps: HonoApiClipDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Clip'>> {
	const params = parseHonoApiParams(clipsCreateParamDef, body);

	const currentCount = await countClipsByUserIdFromDatabase(deps.db, me.id);
	if (currentCount >= (await getHonoApiRolePolicies(deps, me)).clipLimit) {
		throw clipsCreateTooManyClipsError();
	}

	const clip = await createClipInDatabase(deps.db, {
		id: genId(),
		userId: me.id,
		name: params.name,
		isPublic: params.isPublic,
		description: params.description || null,
	});

	return await packClipForHonoApi(deps, clip, me);
}

export async function handleHonoApiClipsUpdate(
	deps: HonoApiClipDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Clip'>> {
	const params = parseHonoApiParams(clipsUpdateParamDef, body);
	const clip = await fetchClipByIdAndUserIdFromDatabase(deps.db, params.clipId, me.id);
	if (clip == null) throw clipsUpdateNoSuchClipError();

	await updateClipInDatabase(deps.db, clip.id, omitUndefined({
		name: params.name,
		description: params.description || null,
		isPublic: params.isPublic,
	}));

	return await packClipForHonoApi(deps, await fetchClipByIdOrFailFromDatabase(deps.db, clip.id), me);
}

export async function handleHonoApiClipsDelete(
	deps: HonoApiClipDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(clipIdParamDef, body);
	const clip = await fetchClipByIdAndUserIdFromDatabase(deps.db, params.clipId, me.id);
	if (clip == null) throw clipsDeleteNoSuchClipError();

	await deleteClipInDatabase(deps.db, clip.id);
}

export async function handleHonoApiClipsAddNote(
	deps: HonoApiClipDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(clipsNoteParamDef, body);
	const clip = await fetchClipByIdAndUserIdFromDatabase(deps.db, params.clipId, me.id);
	if (clip == null) throw clipsAddNoteNoSuchClipError();

	const currentCount = await countClipNotesByClipIdFromDatabase(deps.db, clip.id);
	if (currentCount >= (await getHonoApiRolePolicies(deps, me)).noteEachClipsLimit) {
		throw clipsAddNoteTooManyClipNotesError();
	}

	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw clipsAddNoteNoSuchNoteError();

	try {
		await createClipNoteInDatabase(deps.db, {
			id: genId(),
			noteId: params.noteId,
			clipId: clip.id,
		});
	} catch (e: unknown) {
		if (isDuplicateKeyValueDatabaseError(e)) throw clipsAddNoteAlreadyClippedError();
		if (getDatabaseErrorCode(e) === '23503') throw clipsAddNoteNoSuchNoteError();
		throw e;
	}

	await updateClipInDatabase(deps.db, clip.id, { lastClippedAt: new Date() });
	await adjustNoteClippedCountInDatabase(deps.db, params.noteId, 1);
}

export async function handleHonoApiClipsRemoveNote(
	deps: HonoApiClipDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(clipsNoteParamDef, body);
	const clip = await fetchClipByIdAndUserIdFromDatabase(deps.db, params.clipId, me.id);
	if (clip == null) throw clipsRemoveNoteNoSuchClipError();

	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw clipsRemoveNoteNoSuchNoteError();

	await deleteClipNoteAndDecrementNoteClippedCountInDatabase(deps.db, { noteId: params.noteId, clipId: clip.id });
}

function clipsNotesNoSuchClipError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such clip.', code: 'NO_SUCH_CLIP', id: '1d7645e6-2b6d-4635-b0fe-fe22b0e72e00' });
}

export async function handleHonoApiClipsNotes(
	deps: HonoApiClipNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(clipNotesParamDef, body);
	const clip = await fetchClipByIdFromDatabase(deps.db, params.clipId);
	if (clip == null) throw clipsNotesNoSuchClipError();
	if (!clip.isPublic && (me == null || clip.userId !== me.id)) throw clipsNotesNoSuchClipError();

	let sinceId = params.sinceId ?? null;
	let untilId = params.untilId ?? null;
	if (sinceId == null && untilId == null) {
		if (params.sinceDate) sinceId = genId(params.sinceDate);
		if (params.untilDate) untilId = genId(params.untilDate);
	}

	const notes = await listClipNotesFromDatabase(deps.db, omitUndefined({
		clipId: clip.id,
		limit: params.limit,
		sinceId,
		untilId,
		searchWords: params.search != null ? params.search.trim().split(' ').map(word => sqlLikeEscape(word)) : undefined,
		me: me ?? null,
		blockedHosts: deps.meta.blockedHosts,
	}));

	return await packNoteManyForHonoApi(deps, notes, me);
}

export const usersClipsParamDef = z.object({
	userId: misskeyId(),
	limit: z.number().int().min(1).max(100).default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});

type UsersClipsParams = {
	userId: string;
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleHonoApiUsersClips(
	deps: HonoApiClipDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Clip'>[]> {
	const params = parseHonoApiParams(usersClipsParamDef, body);
	const pagination = resolveClipPagination({ gen: (time) => genId(time) }, params);
	const clips = await listClipsWithPaginationFromDatabase(deps.db, {
		userId: params.userId,
		isPublic: true,
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packClipsManyForHonoApi(deps, clips, me);
}
