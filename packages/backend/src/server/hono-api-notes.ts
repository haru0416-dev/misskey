/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { listBlockerIdsByBlockeeIdFromDatabase } from '@/core/BlockingStore.js';
import { listFollowedChannelIdsByUserIdFromDatabase } from '@/core/ChannelFollowingStore.js';
import { fetchActiveMutedChannelIdsFromDatabase } from '@/core/ChannelMutingStore.js';
import { listAllFollowingsByFollowerIdFromDatabase } from '@/core/FollowingStore.js';
import { listMuteeIdsByMuterIdFromDatabase } from '@/core/MutingStore.js';
import { createNoteFavoriteInDatabase, deleteNoteFavoriteByIdFromDatabase, fetchNoteFavoriteFromDatabase, noteFavoriteExistsInDatabase } from '@/core/NoteFavoriteStore.js';
import {
	fetchNoteByIdFromDatabase,
	fetchNoteByIdOrFailFromDatabase,
	listChildNotesFromDatabase,
	listFeaturedNotesByIdsFromDatabase,
	listGlobalTimelineNotesFromDatabase,
	listHybridTimelineNotesFromDatabase,
	listLocalTimelineNotesFromDatabase,
	listMentionNotesFromDatabase,
	listRenoteNotesFromDatabase,
	listReplyNotesFromDatabase,
} from '@/core/NoteStore.js';
import { createNoteThreadMutingInDatabase, deleteNoteThreadMutingFromDatabase, noteThreadMutingExistsInDatabase } from '@/core/NoteThreadMutingStore.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { isDuplicateKeyValueDatabaseError } from '@/misc/is-duplicate-key-value-database-error.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { Packed } from '@/misc/json-schema.js';
import { HonoApiError } from './hono-api-error.js';
import { packNoteForHonoApi, packNoteManyForHonoApi, type HonoApiNoteDependencies } from './hono-api-note.js';
import { grantAchievementForHonoApi, type HonoApiNotificationDependencies } from './hono-api-notification.js';
import { getHonoApiRolePolicies, type HonoApiRolePolicyDependencies } from './hono-api-role-policy.js';
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

function notesGlobalTimelineDisabledError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Global timeline has been disabled.', code: 'GTL_DISABLED', id: '0332fc13-6ab2-4427-ae80-a9fadffd1a6b' });
}

const notesGlobalTimelineParamDef = {
	type: 'object',
	properties: {
		withFiles: { type: 'boolean', default: false },
		withRenotes: { type: 'boolean', default: true },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: [],
} as const;

type NotesGlobalTimelineParams = {
	withFiles: boolean;
	withRenotes: boolean;
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleHonoApiNotesGlobalTimeline(
	deps: HonoApiNotesDependencies & HonoApiRolePolicyDependencies,
	me: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(notesGlobalTimelineParamDef, body) as NotesGlobalTimelineParams;

	const policies = await getHonoApiRolePolicies(deps, me);
	if (!policies.gtlAvailable) throw notesGlobalTimelineDisabledError();

	const { sinceId, untilId } = resolveNoteSinceUntilId(deps.config, params);

	const timeline = await listGlobalTimelineNotesFromDatabase(deps.db, {
		limit: params.limit,
		sinceId,
		untilId,
		withFiles: params.withFiles,
		withRenotes: params.withRenotes,
		me: me ?? null,
		blockedHosts: deps.meta.blockedHosts,
	});

	return await packNoteManyForHonoApi(deps, timeline, me);
}

function notesLocalTimelineDisabledError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Local timeline has been disabled.', code: 'LTL_DISABLED', id: '45a6eb02-7695-4393-b023-dd3be9aaaefd' });
}

function notesLocalTimelineBothWithRepliesAndWithFilesError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Specifying both withReplies and withFiles is not supported', code: 'BOTH_WITH_REPLIES_AND_WITH_FILES', id: 'dd9c8400-1cb5-4eef-8a31-200c5f933793' });
}

const notesLocalTimelineParamDef = {
	type: 'object',
	properties: {
		withFiles: { type: 'boolean', default: false },
		withRenotes: { type: 'boolean', default: true },
		withReplies: { type: 'boolean', default: false },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		allowPartial: { type: 'boolean', default: false },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: [],
} as const;

type NotesLocalTimelineParams = {
	withFiles: boolean;
	withRenotes: boolean;
	withReplies: boolean;
	limit: number;
	sinceId?: string;
	untilId?: string;
	allowPartial: boolean;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleHonoApiNotesLocalTimeline(
	deps: HonoApiNotesDependencies & HonoApiRolePolicyDependencies,
	me: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(notesLocalTimelineParamDef, body) as NotesLocalTimelineParams;
	const { sinceId, untilId } = resolveNoteSinceUntilId(deps.config, params);

	const policies = await getHonoApiRolePolicies(deps, me);
	if (!policies.ltlAvailable) throw notesLocalTimelineDisabledError();

	if (params.withReplies && params.withFiles) throw notesLocalTimelineBothWithRepliesAndWithFilesError();

	let mutedChannelIds: string[] = [];
	if (me) {
		mutedChannelIds = await fetchActiveMutedChannelIdsFromDatabase(deps.db, me.id, new Date());
	}

	const timeline = await listLocalTimelineNotesFromDatabase(deps.db, {
		limit: params.limit,
		sinceId,
		untilId,
		withFiles: params.withFiles,
		withReplies: params.withReplies,
		me,
		blockedHosts: deps.meta.blockedHosts,
		mutedChannelIds,
	});

	return await packNoteManyForHonoApi(deps, timeline, me);
}

function notesHybridTimelineDisabledError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Hybrid timeline has been disabled.', code: 'STL_DISABLED', id: '620763f4-f621-4533-ab33-0577a1a3c342' });
}

function notesHybridTimelineBothWithRepliesAndWithFilesError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Specifying both withReplies and withFiles is not supported', code: 'BOTH_WITH_REPLIES_AND_WITH_FILES', id: 'dfaa3eb7-8002-4cb7-bcc4-1095df46656f' });
}

const notesHybridTimelineParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		allowPartial: { type: 'boolean', default: false },
		includeMyRenotes: { type: 'boolean', default: true },
		includeRenotedMyNotes: { type: 'boolean', default: true },
		includeLocalRenotes: { type: 'boolean', default: true },
		withFiles: { type: 'boolean', default: false },
		withRenotes: { type: 'boolean', default: true },
		withReplies: { type: 'boolean', default: false },
	},
	required: [],
} as const;

type NotesHybridTimelineParams = {
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
	allowPartial: boolean;
	includeMyRenotes: boolean;
	includeRenotedMyNotes: boolean;
	includeLocalRenotes: boolean;
	withFiles: boolean;
	withRenotes: boolean;
	withReplies: boolean;
};

export async function handleHonoApiNotesHybridTimeline(
	deps: HonoApiNotesDependencies & HonoApiRolePolicyDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(notesHybridTimelineParamDef, body) as NotesHybridTimelineParams;
	const { sinceId, untilId } = resolveNoteSinceUntilId(deps.config, params);

	const policies = await getHonoApiRolePolicies(deps, me);
	if (!policies.ltlAvailable) throw notesHybridTimelineDisabledError();

	if (params.withReplies && params.withFiles) throw notesHybridTimelineBothWithRepliesAndWithFilesError();

	const followees = await listAllFollowingsByFollowerIdFromDatabase(deps.db, me.id);
	const mutingChannelIds = await fetchActiveMutedChannelIdsFromDatabase(deps.db, me.id, new Date());
	const followingChannelIds = (await listFollowedChannelIdsByUserIdFromDatabase(deps.db, me.id))
		.filter(id => !mutingChannelIds.includes(id));

	const notes = await listHybridTimelineNotesFromDatabase(deps.db, {
		me,
		followeeIds: followees.map(f => f.followeeId),
		followingChannelIds,
		mutingChannelIds,
		limit: params.limit,
		sinceId,
		untilId,
		includeMyRenotes: params.includeMyRenotes,
		includeRenotedMyNotes: params.includeRenotedMyNotes,
		includeLocalRenotes: params.includeLocalRenotes,
		withFiles: params.withFiles,
		withReplies: params.withReplies,
		blockedHosts: deps.meta.blockedHosts,
	});

	return await packNoteManyForHonoApi(deps, notes, me);
}

const GLOBAL_NOTES_RANKING_WINDOW = 1000 * 60 * 60 * 24 * 3;
const notesFeaturedEpoc = new Date('2023-01-01T00:00:00Z').getTime();

function getCurrentNotesFeaturedWindow(windowRange: number): number {
	const passed = new Date().getTime() - notesFeaturedEpoc;
	return Math.floor(passed / windowRange);
}

async function getNotesFeaturedRanking(
	deps: HonoApiNotesDependencies,
	name: string,
	threshold: number,
): Promise<string[]> {
	const currentWindow = getCurrentNotesFeaturedWindow(GLOBAL_NOTES_RANKING_WINDOW);
	const previousWindow = currentWindow - 1;

	const redisPipeline = deps.redis.pipeline();
	redisPipeline.zrange(`${name}:${currentWindow}`, 0, threshold, 'REV', 'WITHSCORES');
	redisPipeline.zrange(`${name}:${previousWindow}`, 0, threshold, 'REV', 'WITHSCORES');
	const [currentRankingResult, previousRankingResult] = await redisPipeline.exec().then(result => result ? result.map(r => (r[1] ?? []) as string[]) : [[], []]);

	const ranking = new Map<string, number>();
	for (let i = 0; i < currentRankingResult.length; i += 2) {
		ranking.set(currentRankingResult[i]!, parseInt(currentRankingResult[i + 1]!, 10));
	}
	for (let i = 0; i < previousRankingResult.length; i += 2) {
		const id = previousRankingResult[i]!;
		const score = parseInt(previousRankingResult[i + 1]!, 10);
		const exist = ranking.get(id);
		ranking.set(id, exist != null ? (exist + score) / 2 : score);
	}

	return [...ranking.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, threshold);
}

let globalNotesRankingCache: string[] = [];
let globalNotesRankingCacheLastFetchedAt = 0;

const notesFeaturedParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		untilId: { type: 'string', format: 'misskey:id' },
		channelId: { type: 'string', nullable: true, format: 'misskey:id' },
	},
	required: [],
} as const;

type NotesFeaturedParams = {
	limit: number;
	untilId?: string;
	channelId?: string | null;
};

export function normalizeHonoApiNotesFeaturedQuery(query: Record<string, string>): Record<string, unknown> {
	const body: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(query)) {
		if (key === 'limit') {
			const numeric = Number(value);
			body[key] = Number.isInteger(numeric) ? numeric : value;
		} else if (key === 'channelId' && value === 'null') {
			body[key] = null;
		} else {
			body[key] = value;
		}
	}
	return body;
}

export async function handleHonoApiNotesFeatured(
	deps: HonoApiNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(notesFeaturedParamDef, body) as NotesFeaturedParams;

	let noteIds: string[];
	if (params.channelId) {
		noteIds = await getNotesFeaturedRanking(deps, `featuredInChannelNotesRanking:${params.channelId}`, 50);
	} else {
		if (globalNotesRankingCacheLastFetchedAt !== 0 && (Date.now() - globalNotesRankingCacheLastFetchedAt < 1000 * 60 * 30)) {
			noteIds = globalNotesRankingCache;
		} else {
			noteIds = await getNotesFeaturedRanking(deps, 'featuredGlobalNotesRanking', 100);
			globalNotesRankingCache = noteIds;
			globalNotesRankingCacheLastFetchedAt = Date.now();
		}
	}

	noteIds = [...noteIds].sort((a, b) => a > b ? -1 : 1);
	if (params.untilId) {
		noteIds = noteIds.filter(id => id < params.untilId!);
	}
	noteIds = noteIds.slice(0, params.limit);

	if (noteIds.length === 0) return [];

	const [mutedByMe, blockedByOthers] = me
		? await Promise.all([
			listMuteeIdsByMuterIdFromDatabase(deps.db, me.id),
			listBlockerIdsByBlockeeIdFromDatabase(deps.db, me.id),
		])
		: [[], []];
	const mutedSet = new Set(mutedByMe);
	const blockedSet = new Set(blockedByOthers);

	const notes = (await listFeaturedNotesByIdsFromDatabase(deps.db, noteIds, deps.meta.blockedHosts)).filter(note => {
		if (me && isUserRelated(note, blockedSet)) return false;
		if (me && isUserRelated(note, mutedSet)) return false;
		return true;
	});

	notes.sort((a, b) => a.id > b.id ? -1 : 1);

	return await packNoteManyForHonoApi(deps, notes, me);
}
