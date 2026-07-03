/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createNoteFavoriteInDatabase, deleteNoteFavoriteByIdFromDatabase, fetchNoteFavoriteFromDatabase, noteFavoriteExistsInDatabase } from '@/core/NoteFavoriteStore.js';
import {
	fetchNoteByIdFromDatabase,
	fetchNoteByIdOrFailFromDatabase,
	listChildNotesFromDatabase,
	listMentionNotesFromDatabase,
	listRenoteNotesFromDatabase,
	listReplyNotesFromDatabase,
} from '@/core/NoteStore.js';
import { createNoteThreadMutingInDatabase, deleteNoteThreadMutingFromDatabase, noteThreadMutingExistsInDatabase } from '@/core/NoteThreadMutingStore.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { isDuplicateKeyValueDatabaseError } from '@/misc/is-duplicate-key-value-database-error.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { Packed } from '@/misc/json-schema.js';
import { HonoApiError } from './hono-api-error.js';
import { packNoteForHonoApi, packNoteManyForHonoApi, type HonoApiNoteDependencies } from './hono-api-note.js';
import { grantAchievementForHonoApi, type HonoApiNotificationDependencies } from './hono-api-notification.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiNotesDependencies = HonoApiNoteDependencies & HonoApiNotificationDependencies & {
	meta: MiMeta;
};

const notesShowParamDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
	},
	required: ['noteId'],
} as const;

type NotesShowParams = {
	noteId: string;
};

function notesShowNoSuchNoteError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: '24fcbfc6-2e37-42b6-8388-c29b3861a08d',
	});
}

function notesShowContentRestrictedByUserError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Content restricted by user. Please sign in to view.',
		code: 'CONTENT_RESTRICTED_BY_USER',
		id: 'fbcc002d-37d9-4944-a6b0-d9e29f2d33ab',
	});
}

function notesShowContentRestrictedByServerError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Content restricted by server settings. Please sign in to view.',
		code: 'CONTENT_RESTRICTED_BY_SERVER',
		id: '145f88d2-b03d-4087-8143-a78928883c4b',
	});
}

const noteIdPaginationParamDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: ['noteId'],
} as const;

type NoteIdPaginationParams = {
	noteId: string;
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

function resolveNoteSinceUntilId(
	config: HonoApiNotesDependencies['config'],
	params: { sinceId?: string; untilId?: string; sinceDate?: number; untilDate?: number },
): { sinceId: string | null; untilId: string | null } {
	let sinceId = params.sinceId ?? null;
	let untilId = params.untilId ?? null;
	if (sinceId == null && untilId == null) {
		if (params.sinceDate) sinceId = genId(config, params.sinceDate);
		if (params.untilDate) untilId = genId(config, params.untilDate);
	}
	return { sinceId, untilId };
}

export async function handleHonoApiNotesChildren(
	deps: HonoApiNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(noteIdPaginationParamDef, body) as NoteIdPaginationParams;
	const { sinceId, untilId } = resolveNoteSinceUntilId(deps.config, params);

	const notes = await listChildNotesFromDatabase(deps.db, {
		noteId: params.noteId,
		limit: params.limit,
		sinceId,
		untilId,
		me: me ?? null,
		blockedHosts: deps.meta.blockedHosts,
	});

	return await packNoteManyForHonoApi(deps, notes, me);
}

function notesConversationNoSuchNoteError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such note.', code: 'NO_SUCH_NOTE', id: 'e1035875-9551-45ec-afa8-1ded1fcb53c8' });
}

const notesConversationParamDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', default: 0 },
	},
	required: ['noteId'],
} as const;

type NotesConversationParams = {
	noteId: string;
	limit: number;
	offset: number;
};

export async function handleHonoApiNotesConversation(
	deps: HonoApiNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(notesConversationParamDef, body) as NotesConversationParams;
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw notesConversationNoSuchNoteError();

	const conversation: Awaited<ReturnType<typeof fetchNoteByIdFromDatabase>>[] = [];
	let i = 0;

	const get = async (id: string): Promise<void> => {
		i++;
		const p = await fetchNoteByIdFromDatabase(deps.db, id);
		if (p == null) return;

		if (i > params.offset) {
			conversation.push(p);
		}

		if (conversation.length === params.limit) {
			return;
		}

		if (p.replyId) {
			await get(p.replyId);
		}
	};

	if (note.replyId) {
		await get(note.replyId);
	}

	return await packNoteManyForHonoApi(deps, conversation.filter(n => n != null), me);
}

const notesMentionsParamDef = {
	type: 'object',
	properties: {
		following: { type: 'boolean', default: false },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		visibility: { type: 'string' },
	},
	required: [],
} as const;

type NotesMentionsParams = {
	following: boolean;
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
	visibility?: string;
};

export async function handleHonoApiNotesMentions(
	deps: HonoApiNotesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(notesMentionsParamDef, body) as NotesMentionsParams;
	const { sinceId, untilId } = resolveNoteSinceUntilId(deps.config, params);

	const mentions = await listMentionNotesFromDatabase(deps.db, {
		me,
		limit: params.limit,
		sinceId,
		untilId,
		visibility: params.visibility,
		following: params.following,
		blockedHosts: deps.meta.blockedHosts,
	});

	return await packNoteManyForHonoApi(deps, mentions, me);
}

export async function handleHonoApiNotesReplies(
	deps: HonoApiNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(noteIdPaginationParamDef, body) as NoteIdPaginationParams;
	const { sinceId, untilId } = resolveNoteSinceUntilId(deps.config, params);

	const timeline = await listReplyNotesFromDatabase(deps.db, {
		replyId: params.noteId,
		limit: params.limit,
		sinceId,
		untilId,
		me: me ?? null,
		blockedHosts: deps.meta.blockedHosts,
	});

	return await packNoteManyForHonoApi(deps, timeline, me);
}

function notesRenotesNoSuchNoteError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such note.', code: 'NO_SUCH_NOTE', id: '12908022-2e21-46cd-ba6a-3edaf6093f46' });
}

export async function handleHonoApiNotesRenotes(
	deps: HonoApiNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(noteIdPaginationParamDef, body) as NoteIdPaginationParams;
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw notesRenotesNoSuchNoteError();

	const { sinceId, untilId } = resolveNoteSinceUntilId(deps.config, params);

	const renotes = await listRenoteNotesFromDatabase(deps.db, {
		renoteId: note.id,
		limit: params.limit,
		sinceId,
		untilId,
		me: me ?? null,
		blockedHosts: deps.meta.blockedHosts,
	});

	return await packNoteManyForHonoApi(deps, renotes, me);
}

const noteIdOnlyParamDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
	},
	required: ['noteId'],
} as const;

type NoteIdOnlyParams = {
	noteId: string;
};

export async function handleHonoApiNotesState(
	deps: HonoApiNotesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ isFavorited: boolean; isMutedThread: boolean }> {
	const params = parseHonoApiParams(noteIdOnlyParamDef, body) as NoteIdOnlyParams;
	const note = await fetchNoteByIdOrFailFromDatabase(deps.db, params.noteId);

	const [favorite, threadMuting] = await Promise.all([
		noteFavoriteExistsInDatabase(deps.db, me.id, note.id),
		noteThreadMutingExistsInDatabase(deps.db, me.id, note.threadId ?? note.id),
	]);

	return {
		isFavorited: favorite,
		isMutedThread: threadMuting,
	};
}

function notesFavoritesCreateNoSuchNoteError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such note.', code: 'NO_SUCH_NOTE', id: '6dd26674-e060-4816-909a-45ba3f4da458' });
}

function notesFavoritesCreateAlreadyFavoritedError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'The note has already been marked as a favorite.', code: 'ALREADY_FAVORITED', id: 'a402c12b-34dd-41d2-97d8-4d2ffd96a1a6' });
}

export async function handleHonoApiNotesFavoritesCreate(
	deps: HonoApiNotesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(noteIdOnlyParamDef, body) as NoteIdOnlyParams;
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw notesFavoritesCreateNoSuchNoteError();

	const exist = await noteFavoriteExistsInDatabase(deps.db, me.id, note.id);
	if (exist) throw notesFavoritesCreateAlreadyFavoritedError();

	try {
		await createNoteFavoriteInDatabase(deps.db, {
			id: genId(deps.config),
			noteId: note.id,
			userId: me.id,
		});
	} catch (error) {
		if (isDuplicateKeyValueDatabaseError(error)) {
			throw notesFavoritesCreateAlreadyFavoritedError();
		}
		throw error;
	}

	if (note.userHost == null && note.userId !== me.id) {
		await grantAchievementForHonoApi(deps, note.userId, 'myNoteFavorited1');
	}
}

function notesFavoritesDeleteNoSuchNoteError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such note.', code: 'NO_SUCH_NOTE', id: '80848a2c-398f-4343-baa9-df1d57696c56' });
}

function notesFavoritesDeleteNotFavoritedError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'You have not marked that note a favorite.', code: 'NOT_FAVORITED', id: 'b625fc69-635e-45e9-86f4-dbefbef35af5' });
}

export async function handleHonoApiNotesFavoritesDelete(
	deps: HonoApiNotesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(noteIdOnlyParamDef, body) as NoteIdOnlyParams;
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw notesFavoritesDeleteNoSuchNoteError();

	const exist = await fetchNoteFavoriteFromDatabase(deps.db, me.id, note.id);
	if (exist == null) throw notesFavoritesDeleteNotFavoritedError();

	await deleteNoteFavoriteByIdFromDatabase(deps.db, exist.id);
}

function notesThreadMutingCreateNoSuchNoteError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such note.', code: 'NO_SUCH_NOTE', id: '5ff67ada-ed3b-2e71-8e87-a1a421e177d2' });
}

export async function handleHonoApiNotesThreadMutingCreate(
	deps: HonoApiNotesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(noteIdOnlyParamDef, body) as NoteIdOnlyParams;
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw notesThreadMutingCreateNoSuchNoteError();

	await createNoteThreadMutingInDatabase(deps.db, {
		id: genId(deps.config),
		threadId: note.threadId ?? note.id,
		userId: me.id,
	});
}

function notesThreadMutingDeleteNoSuchNoteError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such note.', code: 'NO_SUCH_NOTE', id: 'bddd57ac-ceb3-b29d-4334-86ea5fae481a' });
}

export async function handleHonoApiNotesThreadMutingDelete(
	deps: HonoApiNotesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(noteIdOnlyParamDef, body) as NoteIdOnlyParams;
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw notesThreadMutingDeleteNoSuchNoteError();

	await deleteNoteThreadMutingFromDatabase(deps.db, me.id, note.threadId ?? note.id);
}

export async function handleHonoApiNotesShow(
	deps: HonoApiNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>> {
	const params = parseHonoApiParams(notesShowParamDef, body) as NotesShowParams;
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw notesShowNoSuchNoteError();

	const user = await fetchUserByIdOrFailFromDatabase(deps.db, note.userId);

	if (user.requireSigninToViewContents && me == null) {
		throw notesShowContentRestrictedByUserError();
	}

	if (deps.meta.ugcVisibilityForVisitor === 'none' && me == null) {
		throw notesShowContentRestrictedByServerError();
	}

	if (deps.meta.ugcVisibilityForVisitor === 'local' && note.userHost != null && me == null) {
		throw notesShowContentRestrictedByServerError();
	}

	return await packNoteForHonoApi(deps, note, me, {
		detail: true,
	});
}
