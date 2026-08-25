/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import { z } from 'zod';
import { listBlockerIdsByBlockeeIdFromDatabase } from '@/core/BlockingStore.js';
import { listActiveMutedChannelIdsByUserIdFromDatabase } from '@/core/ChannelMutingStore.js';
import { listClipNoteClipIdsByNoteIdFromDatabase } from '@/core/ClipNoteStore.js';
import { listClipsByIdsFromDatabase } from '@/core/ClipStore.js';
import { listMuteeIdsByMuterIdFromDatabase } from '@/core/MutingStore.js';
import {
	createNoteFavoriteInDatabase,
	deleteNoteFavoriteByIdFromDatabase,
	fetchNoteFavoriteFromDatabase,
	noteFavoriteExistsInDatabase,
} from '@/core/NoteFavoriteStore.js';
import {
	fetchNoteByIdFromDatabase,
	fetchNoteByIdOrFailFromDatabase,
	listChildNotesFromDatabase,
	listFeaturedNotesByIdsFromDatabase,
	listGlobalTimelineNotesFromDatabase,
	listHomeTimelineNotesFromDatabase,
	listHybridTimelineNotesFromDatabase,
	listLocalTimelineNotesFromDatabase,
	listMentionNotesFromDatabase,
	listNotesByIdsFromDatabase,
	listNotesByTagSearchFromDatabase,
	listPublicNotesFromDatabase,
	listRenoteNotesFromDatabase,
	listReplyNotesFromDatabase,
	listUserListTimelineNotesFromDatabase,
	searchNotesByTextFromDatabase,
} from '@/core/NoteStore.js';
import {
	createNoteThreadMutingInDatabase,
	deleteNoteThreadMutingFromDatabase,
	noteThreadMutingExistsInDatabase,
} from '@/core/NoteThreadMutingStore.js';
import { listUnvotedPublicPollNoteIdsFromDatabase } from '@/core/PollStore.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { fetchUserListByIdAndUserIdFromDatabase } from '@/core/UserListStore.js';
import {
	fanoutViewerRelationKinds,
	fetchViewerRelationSnapshotFromDatabase,
	homeTimelineViewerRelationKinds,
} from '@/core/ViewerRelationStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { omitUndefined } from '@/misc/clone.js';
import { isDuplicateKeyValueDatabaseError } from '@/misc/is-duplicate-key-value-database-error.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { safeForSql } from '@/misc/safe-for-sql.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiMeta } from '@/models/_.js';
import type { MiNote } from '@/models/Note.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { Packed } from '@/misc/json-schema.js';
import { packClipsManyForHonoApi, type HonoApiClipDependencies } from './clips.js';
import { HonoApiError } from './error.js';
import {
	fetchNoteDiffsForHonoApi,
	filterVisibleNotesForHonoApi,
	packNoteForHonoApi,
	packNoteManyForHonoApi,
	type HonoApiNoteDependencies,
} from './note.js';
import { grantAchievementForHonoApi, type HonoApiNotificationDependencies } from './notification.js';
import { getHonoApiRolePolicies, type HonoApiRolePolicyDependencies } from './role-policy.js';
import { getFanoutTimelineNotesForHonoApi } from './fanout-timeline.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiNotesDependencies = HonoApiNoteDependencies &
	HonoApiNotificationDependencies & {
		meta: MiMeta;
		/** fanout タイムライン (Redis) 読み取りに必要。省略時は常にDBから読む。 */
		redisForTimelines?: Redis.Redis;
	};

export const notesShowParamDef = z.object({
	noteId: misskeyId(),
});

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

export const noteIdPaginationParamDef = z.object({
	noteId: misskeyId(),
	limit: z.number().int().min(1).max(100).optional().default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});

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
		if (params.sinceDate) sinceId = genId(params.sinceDate);
		if (params.untilDate) untilId = genId(params.untilDate);
	}
	return { sinceId, untilId };
}

export async function handleHonoApiNotesChildren(
	deps: HonoApiNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(noteIdPaginationParamDef, body);
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
	return new HonoApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: 'e1035875-9551-45ec-afa8-1ded1fcb53c8',
	});
}

export const notesConversationParamDef = z.object({
	noteId: misskeyId(),
	limit: z.number().int().min(1).max(100).optional().default(10),
	offset: z.number().int().optional().default(0),
});

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
	const params = parseHonoApiParams(notesConversationParamDef, body);
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

	return await packNoteManyForHonoApi(
		deps,
		conversation.filter((n) => n != null),
		me,
	);
}

export const notesMentionsParamDef = z.object({
	following: z.boolean().optional().default(false),
	limit: z.number().int().min(1).max(100).optional().default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	visibility: z.string().optional(),
});

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
	const params = parseHonoApiParams(notesMentionsParamDef, body);
	const { sinceId, untilId } = resolveNoteSinceUntilId(deps.config, params);

	const mentions = await listMentionNotesFromDatabase(
		deps.db,
		omitUndefined({
			me,
			limit: params.limit,
			sinceId,
			untilId,
			visibility: params.visibility,
			following: params.following,
			blockedHosts: deps.meta.blockedHosts,
		}),
	);

	return await packNoteManyForHonoApi(deps, mentions, me);
}

export async function handleHonoApiNotesReplies(
	deps: HonoApiNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(noteIdPaginationParamDef, body);
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
	return new HonoApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: '12908022-2e21-46cd-ba6a-3edaf6093f46',
	});
}

export async function handleHonoApiNotesRenotes(
	deps: HonoApiNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(noteIdPaginationParamDef, body);
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

export const noteIdOnlyParamDef = z.object({
	noteId: misskeyId(),
});

type NoteIdOnlyParams = {
	noteId: string;
};

export async function handleHonoApiNotesState(
	deps: HonoApiNotesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ isFavorited: boolean; isMutedThread: boolean }> {
	const params = parseHonoApiParams(noteIdOnlyParamDef, body);
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
	return new HonoApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: '6dd26674-e060-4816-909a-45ba3f4da458',
	});
}

function notesFavoritesCreateAlreadyFavoritedError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'The note has already been marked as a favorite.',
		code: 'ALREADY_FAVORITED',
		id: 'a402c12b-34dd-41d2-97d8-4d2ffd96a1a6',
	});
}

export async function handleHonoApiNotesFavoritesCreate(
	deps: HonoApiNotesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(noteIdOnlyParamDef, body);
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw notesFavoritesCreateNoSuchNoteError();

	const exist = await noteFavoriteExistsInDatabase(deps.db, me.id, note.id);
	if (exist) throw notesFavoritesCreateAlreadyFavoritedError();

	try {
		await createNoteFavoriteInDatabase(deps.db, {
			id: genId(),
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
	return new HonoApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: '80848a2c-398f-4343-baa9-df1d57696c56',
	});
}

function notesFavoritesDeleteNotFavoritedError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'You have not marked that note a favorite.',
		code: 'NOT_FAVORITED',
		id: 'b625fc69-635e-45e9-86f4-dbefbef35af5',
	});
}

export async function handleHonoApiNotesFavoritesDelete(
	deps: HonoApiNotesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(noteIdOnlyParamDef, body);
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw notesFavoritesDeleteNoSuchNoteError();

	const exist = await fetchNoteFavoriteFromDatabase(deps.db, me.id, note.id);
	if (exist == null) throw notesFavoritesDeleteNotFavoritedError();

	await deleteNoteFavoriteByIdFromDatabase(deps.db, exist.id);
}

function notesThreadMutingCreateNoSuchNoteError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: '5ff67ada-ed3b-2e71-8e87-a1a421e177d2',
	});
}

function notesThreadMutingCreateAlreadyMutingError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'You are already muting that thread.',
		code: 'ALREADY_MUTING',
		id: 'c146e22d-1141-4b31-b28d-176371014d18',
	});
}

export async function handleHonoApiNotesThreadMutingCreate(
	deps: HonoApiNotesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(noteIdOnlyParamDef, body);
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw notesThreadMutingCreateNoSuchNoteError();

	try {
		await createNoteThreadMutingInDatabase(deps.db, {
			id: genId(),
			threadId: note.threadId ?? note.id,
			userId: me.id,
		});
	} catch (err) {
		// (userId, threadId) には unique 制約があるので、二重ミュートは 500 ではなく明示的なエラーにする
		if (isDuplicateKeyValueDatabaseError(err)) throw notesThreadMutingCreateAlreadyMutingError();
		throw err;
	}
}

function notesThreadMutingDeleteNoSuchNoteError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: 'bddd57ac-ceb3-b29d-4334-86ea5fae481a',
	});
}

export async function handleHonoApiNotesThreadMutingDelete(
	deps: HonoApiNotesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(noteIdOnlyParamDef, body);
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw notesThreadMutingDeleteNoSuchNoteError();

	await deleteNoteThreadMutingFromDatabase(deps.db, me.id, note.threadId ?? note.id);
}

export async function handleHonoApiNotesShow(
	deps: HonoApiNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>> {
	const params = parseHonoApiParams(notesShowParamDef, body);
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
	return new HonoApiError({
		status: 400,
		message: 'Global timeline has been disabled.',
		code: 'GTL_DISABLED',
		id: '0332fc13-6ab2-4427-ae80-a9fadffd1a6b',
	});
}

export const notesGlobalTimelineParamDef = z.object({
	withFiles: z.boolean().optional().default(false),
	withRenotes: z.boolean().optional().default(true),
	limit: z.number().int().min(1).max(100).optional().default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});

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
	const params = parseHonoApiParams(notesGlobalTimelineParamDef, body);

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

export const notesParamDef = z.object({
	local: z.boolean().optional().default(false),
	reply: z.boolean().optional(),
	renote: z.boolean().optional(),
	withFiles: z.boolean().optional(),
	poll: z.boolean().optional(),
	limit: z.number().int().min(1).max(100).optional().default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});

type NotesParams = {
	local: boolean;
	reply?: boolean;
	renote?: boolean;
	withFiles?: boolean;
	poll?: boolean;
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleHonoApiNotes(
	deps: HonoApiNotesDependencies,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(notesParamDef, body);
	const { sinceId, untilId } = resolveNoteSinceUntilId(deps.config, params);

	const notes = await listPublicNotesFromDatabase(
		deps.db,
		omitUndefined({
			limit: params.limit,
			sinceId,
			untilId,
			local: params.local,
			reply: params.reply,
			renote: params.renote,
			withFiles: params.withFiles,
			poll: params.poll,
		}),
	);

	// me を指定せず、常に匿名としてパックする。
	return await packNoteManyForHonoApi(deps, notes, null);
}

function notesLocalTimelineDisabledError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Local timeline has been disabled.',
		code: 'LTL_DISABLED',
		id: '45a6eb02-7695-4393-b023-dd3be9aaaefd',
	});
}

function notesLocalTimelineBothWithRepliesAndWithFilesError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Specifying both withReplies and withFiles is not supported',
		code: 'BOTH_WITH_REPLIES_AND_WITH_FILES',
		id: 'dd9c8400-1cb5-4eef-8a31-200c5f933793',
	});
}

export const notesLocalTimelineParamDef = z.object({
	withFiles: z.boolean().optional().default(false),
	withRenotes: z.boolean().optional().default(true),
	withReplies: z.boolean().optional().default(false),
	limit: z.number().int().min(1).max(100).optional().default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	allowPartial: z.boolean().optional().default(false),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});

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
	const params = parseHonoApiParams(notesLocalTimelineParamDef, body);
	const { sinceId, untilId } = resolveNoteSinceUntilId(deps.config, params);

	const policies = await getHonoApiRolePolicies(deps, me);
	if (!policies.ltlAvailable) throw notesLocalTimelineDisabledError();

	if (params.withReplies && params.withFiles) throw notesLocalTimelineBothWithRepliesAndWithFilesError();

	// ローカルタイムラインはフォロー関係を見ないので、fanout のフィルタが読む種別だけで足りる
	const viewerRelation = me
		? await fetchViewerRelationSnapshotFromDatabase(deps.db, me.id, new Date(), fanoutViewerRelationKinds)
		: undefined;

	const getFromDb = (dbUntilId: string | null, dbSinceId: string | null, limit: number) =>
		listLocalTimelineNotesFromDatabase(deps.db, {
			limit,
			sinceId: dbSinceId,
			untilId: dbUntilId,
			withFiles: params.withFiles,
			withRenotes: params.withRenotes,
			withReplies: params.withReplies,
			me,
			blockedHosts: deps.meta.blockedHosts,
			mutedChannelIds: viewerRelation?.mutedChannelIds ?? [],
		});

	if (deps.meta.enableFanoutTimeline && deps.redisForTimelines != null) {
		const notes = await getFanoutTimelineNotesForHonoApi(
			{ db: deps.db, meta: deps.meta, redisForTimelines: deps.redisForTimelines },
			{
				untilId,
				sinceId,
				limit: params.limit,
				allowPartial: params.allowPartial,
				me,
				viewerRelation,
				useDbFallback: deps.meta.enableFanoutTimelineDbFallback,
				redisTimelines: params.withFiles
					? ['localTimelineWithFiles']
					: params.withReplies
						? ['localTimeline', 'localTimelineWithReplies']
						: me
							? ['localTimeline', `localTimelineWithReplyTo:${me.id}`]
							: ['localTimeline'],
				alwaysIncludeMyNotes: true,
				excludePureRenotes: !params.withRenotes,
				dbFallback: getFromDb,
			},
		);

		return await packNoteManyForHonoApi(deps, notes, me);
	}

	const timeline = await getFromDb(untilId, sinceId, params.limit);

	return await packNoteManyForHonoApi(deps, timeline, me);
}

function notesHybridTimelineDisabledError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Hybrid timeline has been disabled.',
		code: 'STL_DISABLED',
		id: '620763f4-f621-4533-ab33-0577a1a3c342',
	});
}

function notesHybridTimelineBothWithRepliesAndWithFilesError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Specifying both withReplies and withFiles is not supported',
		code: 'BOTH_WITH_REPLIES_AND_WITH_FILES',
		id: 'dfaa3eb7-8002-4cb7-bcc4-1095df46656f',
	});
}

export const notesHybridTimelineParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	allowPartial: z.boolean().optional().default(false),
	includeMyRenotes: z.boolean().optional().default(true),
	includeRenotedMyNotes: z.boolean().optional().default(true),
	includeLocalRenotes: z.boolean().optional().default(true),
	withFiles: z.boolean().optional().default(false),
	withRenotes: z.boolean().optional().default(true),
	withReplies: z.boolean().optional().default(false),
});

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
	const params = parseHonoApiParams(notesHybridTimelineParamDef, body);
	const { sinceId, untilId } = resolveNoteSinceUntilId(deps.config, params);

	const policies = await getHonoApiRolePolicies(deps, me);
	if (!policies.ltlAvailable) throw notesHybridTimelineDisabledError();

	if (params.withReplies && params.withFiles) throw notesHybridTimelineBothWithRepliesAndWithFilesError();

	// 閲覧者コンテキストは fanout 側のフィルタでも同じものが要るので、ここで1本にまとめて取って渡す
	const viewerRelation = await fetchViewerRelationSnapshotFromDatabase(
		deps.db,
		me.id,
		new Date(),
		homeTimelineViewerRelationKinds,
	);
	const followeeIds = viewerRelation.followeeIds;
	const followeeIdSet = new Set(followeeIds);
	const mutingChannelIds = viewerRelation.mutedChannelIds;
	const mutingChannelIdSet = new Set(mutingChannelIds);
	const followingChannelIds = viewerRelation.followingChannelIds.filter((id) => !mutingChannelIdSet.has(id));

	const getFromDb = (dbUntilId: string | null, dbSinceId: string | null, limit: number) =>
		listHybridTimelineNotesFromDatabase(deps.db, {
			me,
			followeeIds,
			followingChannelIds,
			mutingChannelIds,
			limit,
			sinceId: dbSinceId,
			untilId: dbUntilId,
			includeMyRenotes: params.includeMyRenotes,
			includeRenotedMyNotes: params.includeRenotedMyNotes,
			includeLocalRenotes: params.includeLocalRenotes,
			withFiles: params.withFiles,
			withRenotes: params.withRenotes,
			withReplies: params.withReplies,
			blockedHosts: deps.meta.blockedHosts,
		});

	if (deps.meta.enableFanoutTimeline && deps.redisForTimelines != null) {
		let timelineConfig: string[];
		if (params.withFiles) {
			timelineConfig = [`homeTimelineWithFiles:${me.id}`, 'localTimelineWithFiles'];
		} else if (params.withReplies) {
			timelineConfig = [`homeTimeline:${me.id}`, 'localTimeline', 'localTimelineWithReplies'];
		} else {
			timelineConfig = [`homeTimeline:${me.id}`, 'localTimeline', `localTimelineWithReplyTo:${me.id}`];
		}

		const notes = await getFanoutTimelineNotesForHonoApi(
			{ db: deps.db, meta: deps.meta, redisForTimelines: deps.redisForTimelines },
			{
				untilId,
				sinceId,
				limit: params.limit,
				allowPartial: params.allowPartial,
				me,
				viewerRelation,
				useDbFallback: deps.meta.enableFanoutTimelineDbFallback,
				redisTimelines: timelineConfig,
				alwaysIncludeMyNotes: true,
				excludePureRenotes: !params.withRenotes,
				noteFilter: (note) => {
					if (note.reply?.visibility === 'followers') {
						if (!followeeIdSet.has(note.reply.userId) && note.reply.userId !== me.id) return false;
					}

					return true;
				},
				dbFallback: getFromDb,
			},
		);

		return await packNoteManyForHonoApi(deps, notes, me, { followeeIds: followeeIdSet });
	}

	const notes = await getFromDb(untilId, sinceId, params.limit);

	return await packNoteManyForHonoApi(deps, notes, me, { followeeIds: followeeIdSet });
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
	redisPipeline.zrange(`${name}:${currentWindow}`, 0, String(threshold), 'REV', 'WITHSCORES');
	redisPipeline.zrange(`${name}:${previousWindow}`, 0, String(threshold), 'REV', 'WITHSCORES');
	const [currentRankingResult = [], previousRankingResult = []] = await redisPipeline
		.exec()
		.then((result) => (result ? result.map((r) => (r[1] ?? []) as string[]) : []));

	const ranking = new Map<string, number>();
	for (let i = 0; i < currentRankingResult.length; i += 2) {
		const id = currentRankingResult[i];
		const score = currentRankingResult[i + 1];
		if (id == null || score == null) continue;
		ranking.set(id, Number.parseInt(score, 10));
	}
	for (let i = 0; i < previousRankingResult.length; i += 2) {
		const id = previousRankingResult[i];
		const scoreValue = previousRankingResult[i + 1];
		if (id == null || scoreValue == null) continue;
		const score = Number.parseInt(scoreValue, 10);
		const exist = ranking.get(id);
		ranking.set(id, exist != null ? (exist + score) / 2 : score);
	}

	return [...ranking.entries()]
		.sort((a, b) => b[1] - a[1])
		.map((x) => x[0])
		.slice(0, threshold);
}

let globalNotesRankingCache: string[] = [];
let globalNotesRankingCacheLastFetchedAt = 0;

export const notesFeaturedParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(10),
	untilId: misskeyId().optional(),
	channelId: misskeyId().nullable().optional(),
});

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
	const params = parseHonoApiParams(notesFeaturedParamDef, body);

	let noteIds: string[];
	if (params.channelId) {
		noteIds = await getNotesFeaturedRanking(deps, `featuredInChannelNotesRanking:${params.channelId}`, 50);
	} else {
		if (
			globalNotesRankingCacheLastFetchedAt !== 0 &&
			Date.now() - globalNotesRankingCacheLastFetchedAt < 1000 * 60 * 30
		) {
			noteIds = globalNotesRankingCache;
		} else {
			noteIds = await getNotesFeaturedRanking(deps, 'featuredGlobalNotesRanking', 100);
			globalNotesRankingCache = noteIds;
			globalNotesRankingCacheLastFetchedAt = Date.now();
		}
	}

	noteIds = [...noteIds].sort((a, b) => (a > b ? -1 : 1));
	if (params.untilId) {
		noteIds = noteIds.filter((id) => id < params.untilId!);
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

	const notes = (await listFeaturedNotesByIdsFromDatabase(deps.db, noteIds, deps.meta.blockedHosts)).filter((note) => {
		if (me && isUserRelated(note, blockedSet)) return false;
		if (me && isUserRelated(note, mutedSet)) return false;
		return true;
	});

	notes.sort((a, b) => (a.id > b.id ? -1 : 1));

	return await packNoteManyForHonoApi(deps, notes, me);
}

function notesClipsNoSuchNoteError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: '47db1a1c-b0af-458d-8fb4-986e4efafe1e',
	});
}

export async function handleHonoApiNotesClips(
	deps: HonoApiNotesDependencies & HonoApiClipDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Clip'>[]> {
	const params = parseHonoApiParams(noteIdOnlyParamDef, body);
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) throw notesClipsNoSuchNoteError();

	const clipIds = await listClipNoteClipIdsByNoteIdFromDatabase(deps.db, note.id);
	if (clipIds.length === 0) return [];

	const clips = await listClipsByIdsFromDatabase(deps.db, clipIds, { isPublic: true });

	return await packClipsManyForHonoApi(deps, clips, me);
}

function notesSearchUnavailableError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Search of notes unavailable.',
		code: 'UNAVAILABLE',
		id: '0b44998d-77aa-4427-80d0-d2c9b8523011',
	});
}

export const notesSearchParamDef = z.object({
	query: z.string(),
	rangeStartAt: z.number().int().nullable().optional(),
	rangeEndAt: z.number().int().nullable().optional(),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	limit: z.number().int().min(1).max(100).optional().default(10),
	offset: z.number().int().optional().default(0),
	host: z.string().optional(),
	userId: misskeyId().nullable().optional().default(null),
	channelId: misskeyId().nullable().optional().default(null),
	withFiles: z.boolean().nullable().optional().default(null),
	withSensitiveFiles: z.boolean().nullable().optional().default(null),
	withReplies: z.boolean().nullable().optional().default(null),
	withQuotes: z.boolean().nullable().optional().default(null),
	withCw: z.boolean().nullable().optional().default(null),
	visibility: z.enum(['public', 'home', 'followers', 'specified']).nullable().optional().default(null),
});

type NotesSearchParams = {
	query: string;
	rangeStartAt?: number | null;
	rangeEndAt?: number | null;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
	limit: number;
	offset: number;
	host?: string;
	userId?: string | null;
	channelId?: string | null;
	withFiles?: boolean | null;
	withSensitiveFiles?: boolean | null;
	withReplies?: boolean | null;
	withQuotes?: boolean | null;
	withCw?: boolean | null;
	visibility?: MiNote['visibility'] | null;
};

export async function handleHonoApiNotesSearch(
	deps: HonoApiNotesDependencies & HonoApiRolePolicyDependencies,
	me: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(notesSearchParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(params.untilDate) : undefined);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(params.sinceDate) : undefined);

	const policies = await getHonoApiRolePolicies(deps, me);
	if (!policies.canSearchNotes) throw notesSearchUnavailableError();

	const provider = deps.config.search.provider ?? 'sqlLike';
	if (provider !== 'sqlLike' && provider !== 'sqlPgroonga') {
		// Meilisearch 検索は Hono に移植していないため、SQL ベースの全文検索 provider 設定時だけ到達する。
		throw notesSearchUnavailableError();
	}

	const notes = await searchNotesByTextFromDatabase(
		deps.db,
		omitUndefined({
			query: params.query,
			usePgroonga: provider === 'sqlPgroonga',
			me,
			blockedHosts: deps.meta.blockedHosts,
			limit: params.limit,
			sinceId,
			untilId,
			userId: params.userId,
			channelId: params.channelId,
			host: params.host,
			rangeStartId: params.rangeStartAt != null ? genId(params.rangeStartAt - 1) : null,
			rangeEndId: params.rangeEndAt != null ? genId(params.rangeEndAt + 1) : null,
			withFiles: params.withFiles,
			withSensitiveFiles: params.withSensitiveFiles,
			withReplies: params.withReplies,
			withQuotes: params.withQuotes,
			withCw: params.withCw,
			visibility: params.visibility,
		}),
	);

	return await packNoteManyForHonoApi(deps, notes, me);
}

// 元の ajv スキーマは `allOf: [{ anyOf: [tag必須, query必須] }, { 共通プロパティ (additionalProperties 制限なし) }]`。
// anyOf の各分岐は互いのプロパティを一切検証しない (例: query 分岐は tag の型を問わない) ため、
// tag/query 自体には型制約を掛けず (z.unknown()) 、「anyOf のどちらかの分岐を素朴に満たすか」を
// isValidTagBranch/isValidQueryBranch で ajv 同等に再現し、superRefine で判定する。
// これにより「tag が不正でも query が有効なら許可」のような ajv 特有の緩さを完全一致させる。
function isValidTagBranch(tag: unknown): tag is string {
	return typeof tag === 'string' && tag.length >= 1;
}

function isValidQueryBranch(query: unknown): query is string[][] {
	return (
		Array.isArray(query) &&
		query.length >= 1 &&
		query.every(
			(inner) =>
				Array.isArray(inner) && inner.length >= 1 && inner.every((tag) => typeof tag === 'string' && tag.length >= 1),
		)
	);
}

const notesSearchByTagParamDef = z
	.object({
		tag: z.unknown().optional(),
		query: z.unknown().optional(),
		reply: z.boolean().nullable().optional().default(null),
		renote: z.boolean().nullable().optional().default(null),
		withFiles: z.boolean().optional().default(false),
		poll: z.boolean().nullable().optional().default(null),
		sinceId: misskeyId().optional(),
		untilId: misskeyId().optional(),
		sinceDate: z.number().int().optional(),
		untilDate: z.number().int().optional(),
		limit: z.number().int().min(1).max(100).optional().default(10),
	})
	.superRefine((data, ctx) => {
		if (!isValidTagBranch(data.tag) && !isValidQueryBranch(data.query)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'must match "anyOf" schema (tag or query)',
				path: [],
			});
		}
	});

// OpenAPI/misskey-js コード生成専用。上の superRefine (tag/query の anyOf 判定) は
// JSON Schema 化できないため、docs 用には元 ajv 版と同じ allOf+anyOf 構造を union+intersection で表現する。
const notesSearchByTagCommonFieldsDocsSchema = z.object({
	reply: z.boolean().nullable().optional().default(null),
	renote: z.boolean().nullable().optional().default(null),
	withFiles: z.boolean().optional().default(false),
	poll: z.boolean().nullable().optional().default(null),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	limit: z.number().int().min(1).max(100).optional().default(10),
});
export const notesSearchByTagDocsParamDef = z.intersection(
	z.union([
		z.object({ tag: z.string().min(1) }),
		z.object({ query: z.array(z.array(z.string().min(1)).min(1)).min(1) }),
	]),
	notesSearchByTagCommonFieldsDocsSchema,
);

type NotesSearchByTagParams = {
	tag?: string;
	query?: string[][];
	reply?: boolean | null;
	renote?: boolean | null;
	withFiles: boolean;
	poll?: boolean | null;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
	limit: number;
};

export async function handleHonoApiNotesSearchByTag(
	deps: HonoApiNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(notesSearchByTagParamDef, body) as NotesSearchByTagParams;

	try {
		const { sinceId, untilId } = resolveNoteSinceUntilId(deps.config, params);

		let tagQuery: string[][];
		if (params.tag != null) {
			const tag = normalizeForSearch(params.tag);
			if (!safeForSql(tag)) throw new Error('Injection');
			tagQuery = [[tag]];
		} else {
			tagQuery = params.query!.map((tags) =>
				tags.map((tag) => {
					const normalized = normalizeForSearch(tag);
					if (!safeForSql(normalized)) throw new Error('Injection');
					return normalized;
				}),
			);
		}

		const notes = await listNotesByTagSearchFromDatabase(
			deps.db,
			omitUndefined({
				limit: params.limit,
				sinceId,
				untilId,
				tagQuery,
				reply: params.reply,
				renote: params.renote,
				withFiles: params.withFiles,
				poll: params.poll,
				me: me ?? null,
				blockedHosts: deps.meta.blockedHosts,
			}),
		);

		return await packNoteManyForHonoApi(deps, notes, me);
	} catch (e) {
		if (e instanceof Error && e.message === 'Injection') return [];
		throw e;
	}
}

export const notesShowPartialBulkParamDef = z.object({
	noteIds: z.array(misskeyId()).min(1).max(100),
});

type NotesShowPartialBulkParams = {
	noteIds: string[];
};

export async function handleHonoApiNotesShowPartialBulk(
	deps: HonoApiNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	body: Record<string, unknown>,
): Promise<{ id: string; reactions: Record<string, number>; reactionEmojis: Record<string, string> }[]> {
	const params = parseHonoApiParams(notesShowPartialBulkParamDef, body);
	const notes = await listNotesByIdsFromDatabase(deps.db, params.noteIds);
	const visibleNotes = await filterVisibleNotesForHonoApi(deps, notes, me?.id ?? null);
	return await fetchNoteDiffsForHonoApi(deps, visibleNotes);
}

export const notesTimelineParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	allowPartial: z.boolean().optional().default(false),
	includeMyRenotes: z.boolean().optional().default(true),
	includeRenotedMyNotes: z.boolean().optional().default(true),
	includeLocalRenotes: z.boolean().optional().default(true),
	withFiles: z.boolean().optional().default(false),
	withRenotes: z.boolean().optional().default(true),
});

type NotesTimelineParams = {
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
};

export async function handleHonoApiNotesTimeline(
	deps: HonoApiNotesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(notesTimelineParamDef, body);
	const { sinceId, untilId } = resolveNoteSinceUntilId(deps.config, params);

	// 閲覧者コンテキストは fanout 側のフィルタでも同じものが要るので、ここで1本にまとめて取って渡す
	const viewerRelation = await fetchViewerRelationSnapshotFromDatabase(
		deps.db,
		me.id,
		new Date(),
		homeTimelineViewerRelationKinds,
	);
	const followeeIds = viewerRelation.followeeIds;
	const followeeIdSet = new Set(followeeIds);
	const mutingChannelIds = viewerRelation.mutedChannelIds;
	const mutingChannelIdSet = new Set(mutingChannelIds);
	const followingChannelIds = viewerRelation.followingChannelIds.filter((id) => !mutingChannelIdSet.has(id));

	const getFromDb = (dbUntilId: string | null, dbSinceId: string | null, limit: number) =>
		listHomeTimelineNotesFromDatabase(deps.db, {
			me,
			followeeIds,
			followingChannelIds,
			mutingChannelIds,
			limit,
			sinceId: dbSinceId,
			untilId: dbUntilId,
			includeMyRenotes: params.includeMyRenotes,
			includeRenotedMyNotes: params.includeRenotedMyNotes,
			includeLocalRenotes: params.includeLocalRenotes,
			withFiles: params.withFiles,
			withRenotes: params.withRenotes,
			blockedHosts: deps.meta.blockedHosts,
		});

	if (deps.meta.enableFanoutTimeline && deps.redisForTimelines != null) {
		const notes = await getFanoutTimelineNotesForHonoApi(
			{ db: deps.db, meta: deps.meta, redisForTimelines: deps.redisForTimelines },
			{
				untilId,
				sinceId,
				limit: params.limit,
				allowPartial: params.allowPartial,
				me,
				viewerRelation,
				useDbFallback: deps.meta.enableFanoutTimelineDbFallback,
				redisTimelines: params.withFiles ? [`homeTimelineWithFiles:${me.id}`] : [`homeTimeline:${me.id}`],
				alwaysIncludeMyNotes: true,
				excludePureRenotes: !params.withRenotes,
				noteFilter: (note) => {
					if (note.reply?.visibility === 'followers') {
						if (!followeeIdSet.has(note.reply.userId) && note.reply.userId !== me.id) return false;
					}

					return true;
				},
				dbFallback: getFromDb,
			},
		);

		return await packNoteManyForHonoApi(deps, notes, me, { followeeIds: followeeIdSet });
	}

	const notes = await getFromDb(untilId, sinceId, params.limit);

	return await packNoteManyForHonoApi(deps, notes, me, { followeeIds: followeeIdSet });
}

function notesUserListTimelineNoSuchListError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such list.',
		code: 'NO_SUCH_LIST',
		id: '8fb1fbd5-e476-4c37-9fb0-43d55b63a2ff',
	});
}

export const notesUserListTimelineParamDef = z.object({
	listId: misskeyId(),
	limit: z.number().int().min(1).max(100).optional().default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
	allowPartial: z.boolean().optional().default(false),
	includeMyRenotes: z.boolean().optional().default(true),
	includeRenotedMyNotes: z.boolean().optional().default(true),
	includeLocalRenotes: z.boolean().optional().default(true),
	withRenotes: z.boolean().optional().default(true),
	withFiles: z.boolean().optional().default(false),
});

type NotesUserListTimelineParams = {
	listId: string;
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
	allowPartial: boolean;
	includeMyRenotes: boolean;
	includeRenotedMyNotes: boolean;
	includeLocalRenotes: boolean;
	withRenotes: boolean;
	withFiles: boolean;
};

export async function handleHonoApiNotesUserListTimeline(
	deps: HonoApiNotesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(notesUserListTimelineParamDef, body);
	const { sinceId, untilId } = resolveNoteSinceUntilId(deps.config, params);

	const list = await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.listId, me.id);
	if (list == null) throw notesUserListTimelineNoSuchListError();

	const mutedChannelIds = await listActiveMutedChannelIdsByUserIdFromDatabase(deps.db, me.id, new Date());

	const notes = await listUserListTimelineNotesFromDatabase(deps.db, {
		listId: list.id,
		me,
		mutedChannelIds,
		limit: params.limit,
		sinceId,
		untilId,
		includeMyRenotes: params.includeMyRenotes,
		includeRenotedMyNotes: params.includeRenotedMyNotes,
		includeLocalRenotes: params.includeLocalRenotes,
		withRenotes: params.withRenotes,
		withFiles: params.withFiles,
		blockedHosts: deps.meta.blockedHosts,
	});

	return await packNoteManyForHonoApi(deps, notes, me);
}

export const notesPollsRecommendationParamDef = z.object({
	limit: z.number().int().min(1).max(100).optional().default(10),
	offset: z.number().int().optional().default(0),
	excludeChannels: z.boolean().optional().default(false),
});

type NotesPollsRecommendationParams = {
	limit: number;
	offset: number;
	excludeChannels: boolean;
};

export async function handleHonoApiNotesPollsRecommendation(
	deps: HonoApiNotesDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(notesPollsRecommendationParamDef, body);
	const noteIds = await listUnvotedPublicPollNoteIdsFromDatabase(deps.db, {
		meId: me.id,
		excludeChannels: params.excludeChannels,
		limit: params.limit,
		offset: params.offset,
	});

	if (noteIds.length === 0) return [];

	const notes = await listNotesByIdsFromDatabase(deps.db, noteIds);
	notes.sort((a, b) => b.id.localeCompare(a.id));

	return await packNoteManyForHonoApi(deps, notes, me, {
		detail: true,
	});
}
