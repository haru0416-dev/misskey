/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { endpointMetas as notesContracts } from '@/server/api/metas/notes.js';
import type { ContractErrors } from '../endpoint-contract.js';
import type * as Redis from 'ioredis';
import { z } from 'zod';
import { listBlockerIdsByBlockeeIdFromDatabase } from '@/core/user/BlockingStore.js';
import { listActiveMutedChannelIdsByUserIdFromDatabase } from '@/core/channel/ChannelMutingStore.js';
import { listClipNoteClipIdsByNoteIdFromDatabase } from '@/core/clip/ClipNoteStore.js';
import { listClipsByIdsFromDatabase } from '@/core/clip/ClipStore.js';
import { listMuteeIdsByMuterIdFromDatabase } from '@/core/user/MutingStore.js';
import {
	createNoteFavoriteInDatabase,
	deleteNoteFavoriteByIdFromDatabase,
	fetchNoteFavoriteFromDatabase,
	noteFavoriteExistsInDatabase,
} from '@/core/note/NoteFavoriteStore.js';
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
} from '@/core/note/NoteStore.js';
import {
	createNoteThreadMutingInDatabase,
	deleteNoteThreadMutingFromDatabase,
	noteThreadMutingExistsInDatabase,
} from '@/core/note/NoteThreadMutingStore.js';
import { listUnvotedPublicPollNoteIdsFromDatabase } from '@/core/note/PollStore.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/user/UserStore.js';
import { fetchUserListByIdAndUserIdFromDatabase } from '@/core/user/UserListStore.js';
import {
	fanoutViewerRelationKinds,
	fetchViewerRelationSnapshotFromDatabase,
	homeTimelineViewerRelationKinds,
} from '@/core/user/ViewerRelationStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { omitUndefined } from '@/misc/clone.js';
import { isDuplicateKeyValueDatabaseError } from '@/misc/is-duplicate-key-value-database-error.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { Packed } from '@/misc/json-schema.js';
import { packClipsManyForApi } from '../clip/clips.js';
import type { ApiClipDependencies } from '../clip/clips.js';
import { ApiError } from '../error.js';
import { fetchNoteDiffsForApi, filterVisibleNotesForApi, packNoteForApi, packNoteManyForApi } from './note.js';
import type { ApiNoteDependencies } from './note.js';
import { grantAchievementForApi } from '../notification/notification.js';
import type { ApiNotificationDependencies } from '../notification/notification.js';
import { getApiRolePolicies } from '../role/role-policy.js';
import type { ApiRolePolicyDependencies } from '../role/role-policy.js';
import { getFanoutTimelineNotesForApi } from './fanout-timeline.js';
import { parseApiParams } from '../validation.js';
import type { ApiParams } from '../validation.js';
import { resolveApiDateIdBounds, resolveApiDateIdPagination } from '../date-id-pagination.js';

export type ApiNotesDependencies = ApiNoteDependencies &
	ApiNotificationDependencies & {
		meta: MiMeta;
		/** fanout タイムライン (Redis) 読み取りに必要。省略時は常にDBから読む。 */
		redisForTimelines?: Redis.Redis;
	};

export const notesShowParamDef = z.object({
	noteId: misskeyId(),
});

export const noteIdPaginationParamDef = z.object({
	noteId: misskeyId(),
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
});

export async function handleApiNotesChildren(
	deps: ApiNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	params: ApiParams<typeof noteIdPaginationParamDef>,
): Promise<Packed<'Note'>[]> {
	const { sinceId, untilId } = resolveApiDateIdPagination(params);

	const notes = await listChildNotesFromDatabase(deps.db, {
		noteId: params.noteId,
		limit: params.limit,
		sinceId,
		untilId,
		me: me ?? null,
		blockedHosts: deps.meta.blockedHosts,
	});

	return await packNoteManyForApi(deps, notes, me);
}

export const notesConversationParamDef = z.object({
	noteId: misskeyId(),
	limit: z.int().min(1).max(100).optional().default(10),
	offset: z.int().nonnegative().optional().default(0),
});

export async function handleApiNotesConversation(
	deps: ApiNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	params: ApiParams<typeof notesConversationParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/conversation']>,
): Promise<Packed<'Note'>[]> {
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) {
		throw errors.noSuchNote();
	}

	const conversation: Awaited<ReturnType<typeof fetchNoteByIdFromDatabase>>[] = [];
	let i = 0;

	const get = async (id: string): Promise<void> => {
		i++;
		const p = await fetchNoteByIdFromDatabase(deps.db, id);
		if (p == null) {
			return;
		}

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

	return await packNoteManyForApi(
		deps,
		conversation.filter((n) => n != null),
		me,
	);
}

export const notesMentionsParamDef = z.object({
	following: z.boolean().optional().default(false),
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
	visibility: z.string().optional(),
});

export async function handleApiNotesMentions(
	deps: ApiNotesDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof notesMentionsParamDef>,
): Promise<Packed<'Note'>[]> {
	const { sinceId, untilId } = resolveApiDateIdPagination(params);

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

	return await packNoteManyForApi(deps, mentions, me);
}

export async function handleApiNotesReplies(
	deps: ApiNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	params: ApiParams<typeof noteIdPaginationParamDef>,
): Promise<Packed<'Note'>[]> {
	const { sinceId, untilId } = resolveApiDateIdPagination(params);

	const timeline = await listReplyNotesFromDatabase(deps.db, {
		replyId: params.noteId,
		limit: params.limit,
		sinceId,
		untilId,
		me: me ?? null,
		blockedHosts: deps.meta.blockedHosts,
	});

	return await packNoteManyForApi(deps, timeline, me);
}

export async function handleApiNotesRenotes(
	deps: ApiNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	params: ApiParams<typeof noteIdPaginationParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/renotes']>,
): Promise<Packed<'Note'>[]> {
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) {
		throw errors.noSuchNote();
	}

	const { sinceId, untilId } = resolveApiDateIdPagination(params);

	const renotes = await listRenoteNotesFromDatabase(deps.db, {
		renoteId: note.id,
		limit: params.limit,
		sinceId,
		untilId,
		me: me ?? null,
		blockedHosts: deps.meta.blockedHosts,
	});

	return await packNoteManyForApi(deps, renotes, me);
}

export const noteIdOnlyParamDef = z.object({
	noteId: misskeyId(),
});

export async function handleApiNotesState(
	deps: ApiNotesDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof noteIdOnlyParamDef>,
): Promise<{ isFavorited: boolean; isMutedThread: boolean }> {
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

export async function handleApiNotesFavoritesCreate(
	deps: ApiNotesDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof noteIdOnlyParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/favorites/create']>,
): Promise<void> {
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) {
		throw errors.noSuchNote();
	}

	const exist = await noteFavoriteExistsInDatabase(deps.db, me.id, note.id);
	if (exist) {
		throw errors.alreadyFavorited();
	}

	try {
		await createNoteFavoriteInDatabase(deps.db, {
			id: genId(),
			noteId: note.id,
			userId: me.id,
		});
	} catch (error) {
		if (isDuplicateKeyValueDatabaseError(error)) {
			throw errors.alreadyFavorited();
		}
		throw error;
	}

	if (note.userHost == null && note.userId !== me.id) {
		await grantAchievementForApi(deps, note.userId, 'myNoteFavorited1');
	}
}

export async function handleApiNotesFavoritesDelete(
	deps: ApiNotesDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof noteIdOnlyParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/favorites/delete']>,
): Promise<void> {
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) {
		throw errors.noSuchNote();
	}

	const exist = await fetchNoteFavoriteFromDatabase(deps.db, me.id, note.id);
	if (exist == null) {
		throw errors.notFavorited();
	}

	await deleteNoteFavoriteByIdFromDatabase(deps.db, exist.id);
}

export async function handleApiNotesThreadMutingCreate(
	deps: ApiNotesDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof noteIdOnlyParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/thread-muting/create']>,
): Promise<void> {
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) {
		throw errors.noSuchNote();
	}

	try {
		await createNoteThreadMutingInDatabase(deps.db, {
			id: genId(),
			threadId: note.threadId ?? note.id,
			userId: me.id,
		});
	} catch (err) {
		// (userId, threadId) には unique 制約があるので、二重ミュートは 500 ではなく明示的なエラーにする
		if (isDuplicateKeyValueDatabaseError(err)) {
			throw errors.alreadyMuting();
		}
		throw err;
	}
}

export async function handleApiNotesThreadMutingDelete(
	deps: ApiNotesDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof noteIdOnlyParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/thread-muting/delete']>,
): Promise<void> {
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) {
		throw errors.noSuchNote();
	}

	await deleteNoteThreadMutingFromDatabase(deps.db, me.id, note.threadId ?? note.id);
}

export async function handleApiNotesShow(
	deps: ApiNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	params: ApiParams<typeof notesShowParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/show']>,
): Promise<Packed<'Note'>> {
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) {
		throw errors.noSuchNote();
	}

	const user = await fetchUserByIdOrFailFromDatabase(deps.db, note.userId);

	if (user.requireSigninToViewContents && me == null) {
		throw errors.contentRestrictedByUser();
	}

	if (deps.meta.ugcVisibilityForVisitor === 'none' && me == null) {
		throw errors.contentRestrictedByServer();
	}

	if (deps.meta.ugcVisibilityForVisitor === 'local' && note.userHost != null && me == null) {
		throw errors.contentRestrictedByServer();
	}

	return await packNoteForApi(deps, note, me, {
		detail: true,
	});
}

export const notesGlobalTimelineParamDef = z.object({
	withFiles: z.boolean().optional().default(false),
	withRenotes: z.boolean().optional().default(true),
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
});

export async function handleApiNotesGlobalTimeline(
	deps: ApiNotesDependencies & ApiRolePolicyDependencies,
	me: MiLocalUser | null,
	params: ApiParams<typeof notesGlobalTimelineParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/global-timeline']>,
): Promise<Packed<'Note'>[]> {
	const policies = await getApiRolePolicies(deps, me);
	if (!policies.gtlAvailable) {
		throw errors.gtlDisabled();
	}

	const { sinceId, untilId } = resolveApiDateIdPagination(params);

	const timeline = await listGlobalTimelineNotesFromDatabase(deps.db, {
		limit: params.limit,
		sinceId,
		untilId,
		withFiles: params.withFiles,
		withRenotes: params.withRenotes,
		me: me ?? null,
		blockedHosts: deps.meta.blockedHosts,
	});

	return await packNoteManyForApi(deps, timeline, me);
}

export const notesParamDef = z.object({
	local: z.boolean().optional().default(false),
	reply: z.boolean().optional(),
	renote: z.boolean().optional(),
	withFiles: z.boolean().optional(),
	poll: z.boolean().optional(),
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
});

export async function handleApiNotes(
	deps: ApiNotesDependencies,
	params: ApiParams<typeof notesParamDef>,
): Promise<Packed<'Note'>[]> {
	const { sinceId, untilId } = resolveApiDateIdPagination(params);

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

	// 公開 API のため、閲覧者固有情報を含めない。
	return await packNoteManyForApi(deps, notes, null);
}

export const notesLocalTimelineParamDef = z.object({
	withFiles: z.boolean().optional().default(false),
	withRenotes: z.boolean().optional().default(true),
	withReplies: z.boolean().optional().default(false),
	limit: z.int().min(1).max(100).optional().default(10),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	allowPartial: z.boolean().optional().default(false),
	sinceDate: z.int().optional(),
	untilDate: z.int().optional(),
});

export async function handleApiNotesLocalTimeline(
	deps: ApiNotesDependencies & ApiRolePolicyDependencies,
	me: MiLocalUser | null,
	params: ApiParams<typeof notesLocalTimelineParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/local-timeline']>,
): Promise<Packed<'Note'>[]> {
	const { sinceId, untilId } = resolveApiDateIdPagination(params);

	const policies = await getApiRolePolicies(deps, me);
	if (!policies.ltlAvailable) {
		throw errors.ltlDisabled();
	}

	if (params.withReplies && params.withFiles) {
		throw errors.bothWithRepliesAndWithFiles();
	}

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
		const notes = await getFanoutTimelineNotesForApi(
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

		return await packNoteManyForApi(deps, notes, me);
	}

	const timeline = await getFromDb(untilId, sinceId, params.limit);

	return await packNoteManyForApi(deps, timeline, me);
}

export const notesHybridTimelineParamDef = z.object({
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
	allowPartial: z.boolean().optional().default(false),
	includeMyRenotes: z.boolean().optional().default(true),
	includeRenotedMyNotes: z.boolean().optional().default(true),
	includeLocalRenotes: z.boolean().optional().default(true),
	withFiles: z.boolean().optional().default(false),
	withRenotes: z.boolean().optional().default(true),
	withReplies: z.boolean().optional().default(false),
});

export async function handleApiNotesHybridTimeline(
	deps: ApiNotesDependencies & ApiRolePolicyDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof notesHybridTimelineParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/hybrid-timeline']>,
): Promise<Packed<'Note'>[]> {
	const { sinceId, untilId } = resolveApiDateIdPagination(params);

	const policies = await getApiRolePolicies(deps, me);
	if (!policies.ltlAvailable) {
		throw errors.stlDisabled();
	}

	if (params.withReplies && params.withFiles) {
		throw errors.bothWithRepliesAndWithFiles();
	}

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

		const notes = await getFanoutTimelineNotesForApi(
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
						if (!followeeIdSet.has(note.reply.userId) && note.reply.userId !== me.id) {
							return false;
						}
					}

					return true;
				},
				dbFallback: getFromDb,
			},
		);

		return await packNoteManyForApi(deps, notes, me, { followeeIds: followeeIdSet });
	}

	const notes = await getFromDb(untilId, sinceId, params.limit);

	return await packNoteManyForApi(deps, notes, me, { followeeIds: followeeIdSet });
}

const GLOBAL_NOTES_RANKING_WINDOW = 1000 * 60 * 60 * 24 * 3;
const notesFeaturedEpoc = new Date('2023-01-01T00:00:00Z').getTime();

function getCurrentNotesFeaturedWindow(windowRange: number): number {
	const passed = Date.now() - notesFeaturedEpoc;
	return Math.floor(passed / windowRange);
}

async function getNotesFeaturedRanking(deps: ApiNotesDependencies, name: string, threshold: number): Promise<string[]> {
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
		if (id == null || score == null) {
			continue;
		}
		ranking.set(id, Number.parseInt(score, 10));
	}
	for (let i = 0; i < previousRankingResult.length; i += 2) {
		const id = previousRankingResult[i];
		const scoreValue = previousRankingResult[i + 1];
		if (id == null || scoreValue == null) {
			continue;
		}
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
	limit: z.int().min(1).max(100).optional().default(10),
	untilId: misskeyId().optional(),
	channelId: misskeyId().nullable().optional(),
});

export async function handleApiNotesFeatured(
	deps: ApiNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	params: ApiParams<typeof notesFeaturedParamDef>,
): Promise<Packed<'Note'>[]> {
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

	if (noteIds.length === 0) {
		return [];
	}

	const [mutedByMe, blockedByOthers] = me
		? await Promise.all([
				listMuteeIdsByMuterIdFromDatabase(deps.db, me.id),
				listBlockerIdsByBlockeeIdFromDatabase(deps.db, me.id),
			])
		: [[], []];
	const mutedSet = new Set(mutedByMe);
	const blockedSet = new Set(blockedByOthers);

	const notes = (await listFeaturedNotesByIdsFromDatabase(deps.db, noteIds, deps.meta.blockedHosts)).filter((note) => {
		if (me && isUserRelated(note, blockedSet)) {
			return false;
		}
		if (me && isUserRelated(note, mutedSet)) {
			return false;
		}
		return true;
	});

	notes.sort((a, b) => (a.id > b.id ? -1 : 1));

	return await packNoteManyForApi(deps, notes, me);
}

export async function handleApiNotesClips(
	deps: ApiNotesDependencies & ApiClipDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	params: ApiParams<typeof noteIdOnlyParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/clips']>,
): Promise<Packed<'Clip'>[]> {
	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) {
		throw errors.noSuchNote();
	}

	const clipIds = await listClipNoteClipIdsByNoteIdFromDatabase(deps.db, note.id);
	if (clipIds.length === 0) {
		return [];
	}

	const clips = await listClipsByIdsFromDatabase(deps.db, clipIds, { isPublic: true });

	return await packClipsManyForApi(deps, clips, me);
}

export const notesSearchParamDef = z.object({
	query: z.string(),
	rangeStartAt: z.int().nullable().optional(),
	rangeEndAt: z.int().nullable().optional(),
	...paginationParams,
	limit: z.int().min(1).max(100).optional().default(10),
	offset: z.int().nonnegative().optional().default(0),
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

export async function handleApiNotesSearch(
	deps: ApiNotesDependencies & ApiRolePolicyDependencies,
	me: MiLocalUser | null,
	params: ApiParams<typeof notesSearchParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/search']>,
): Promise<Packed<'Note'>[]> {
	const { sinceId, untilId } = resolveApiDateIdBounds(params);

	const policies = await getApiRolePolicies(deps, me);
	if (!policies.canSearchNotes) {
		throw errors.unavailable();
	}

	const provider = deps.config.search.provider ?? 'sqlLike';
	if (provider !== 'sqlLike' && provider !== 'sqlPgroonga') {
		// 全文検索は SQL ベースの provider に限る。
		throw errors.unavailable();
	}

	const notes = await searchNotesByTextFromDatabase(
		deps.db,
		omitUndefined({
			query: params.query,
			usePgroonga: provider === 'sqlPgroonga',
			useTextIndex: deps.config.search.noteTextIndex,
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

	return await packNoteManyForApi(deps, notes, me);
}

// anyOf の各分岐は互いのプロパティを検証しないため、tag/query 自体は z.unknown() とする。
// 一方が有効なら他方が不正でも許可する互換性を superRefine で維持する。
// tag か query のどちらかを必須にする。両方あれば tag を使い、正しくない側は union の分岐で捨てる。
// この定義がそのまま実行時の検証と OpenAPI / misskey-js の型になる。
const notesSearchByTagCommonFieldsSchema = z.object({
	reply: z.boolean().nullable().optional().default(null),
	renote: z.boolean().nullable().optional().default(null),
	withFiles: z.boolean().optional().default(false),
	poll: z.boolean().nullable().optional().default(null),
	...paginationParams,
	limit: z.int().min(1).max(100).optional().default(10),
});
export const notesSearchByTagParamDef = z.intersection(
	z.union([
		z.object({ tag: z.string().min(1) }),
		z.object({ query: z.array(z.array(z.string().min(1)).min(1)).min(1) }),
	]),
	notesSearchByTagCommonFieldsSchema,
);

export async function handleApiNotesSearchByTag(
	deps: ApiNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	params: ApiParams<typeof notesSearchByTagParamDef>,
): Promise<Packed<'Note'>[]> {
	const { sinceId, untilId } = resolveApiDateIdPagination(params);
	// タグはパラメータとして束縛するので、文字種で弾く必要はない。
	const tagQuery: string[][] =
		'tag' in params
			? [[normalizeForSearch(params.tag)]]
			: params.query.map((tags) => tags.map((tag) => normalizeForSearch(tag)));

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

	return await packNoteManyForApi(deps, notes, me);
}

export const notesShowPartialBulkParamDef = z.object({
	noteIds: z.array(misskeyId()).min(1).max(100),
});

export async function handleApiNotesShowPartialBulk(
	deps: ApiNotesDependencies,
	me: { id: MiUser['id'] } | null | undefined,
	params: ApiParams<typeof notesShowPartialBulkParamDef>,
): Promise<{ id: string; reactions: Record<string, number>; reactionEmojis: Record<string, string> }[]> {
	const notes = await listNotesByIdsFromDatabase(deps.db, params.noteIds);
	const visibleNotes = await filterVisibleNotesForApi(deps, notes, me?.id ?? null);
	return await fetchNoteDiffsForApi(deps, visibleNotes);
}

export const notesTimelineParamDef = z.object({
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
	allowPartial: z.boolean().optional().default(false),
	includeMyRenotes: z.boolean().optional().default(true),
	includeRenotedMyNotes: z.boolean().optional().default(true),
	includeLocalRenotes: z.boolean().optional().default(true),
	withFiles: z.boolean().optional().default(false),
	withRenotes: z.boolean().optional().default(true),
});

export async function handleApiNotesTimeline(
	deps: ApiNotesDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof notesTimelineParamDef>,
): Promise<Packed<'Note'>[]> {
	const { sinceId, untilId } = resolveApiDateIdPagination(params);

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
		const notes = await getFanoutTimelineNotesForApi(
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
						if (!followeeIdSet.has(note.reply.userId) && note.reply.userId !== me.id) {
							return false;
						}
					}

					return true;
				},
				dbFallback: getFromDb,
			},
		);

		return await packNoteManyForApi(deps, notes, me, { followeeIds: followeeIdSet });
	}

	const notes = await getFromDb(untilId, sinceId, params.limit);

	return await packNoteManyForApi(deps, notes, me, { followeeIds: followeeIdSet });
}

export const notesUserListTimelineParamDef = z.object({
	listId: misskeyId(),
	limit: z.int().min(1).max(100).optional().default(10),
	...paginationParams,
	allowPartial: z.boolean().optional().default(false),
	includeMyRenotes: z.boolean().optional().default(true),
	includeRenotedMyNotes: z.boolean().optional().default(true),
	includeLocalRenotes: z.boolean().optional().default(true),
	withRenotes: z.boolean().optional().default(true),
	withFiles: z.boolean().optional().default(false),
});

export async function handleApiNotesUserListTimeline(
	deps: ApiNotesDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof notesUserListTimelineParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/user-list-timeline']>,
): Promise<Packed<'Note'>[]> {
	const { sinceId, untilId } = resolveApiDateIdPagination(params);

	const list = await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.listId, me.id);
	if (list == null) {
		throw errors.noSuchList();
	}

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

	return await packNoteManyForApi(deps, notes, me);
}

export const notesPollsRecommendationParamDef = z.object({
	limit: z.int().min(1).max(100).optional().default(10),
	offset: z.int().nonnegative().optional().default(0),
	excludeChannels: z.boolean().optional().default(false),
});

export async function handleApiNotesPollsRecommendation(
	deps: ApiNotesDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof notesPollsRecommendationParamDef>,
): Promise<Packed<'Note'>[]> {
	const noteIds = await listUnvotedPublicPollNoteIdsFromDatabase(deps.db, {
		meId: me.id,
		excludeChannels: params.excludeChannels,
		limit: params.limit,
		offset: params.offset,
	});

	if (noteIds.length === 0) {
		return [];
	}

	const notes = await listNotesByIdsFromDatabase(deps.db, noteIds);
	notes.sort((a, b) => b.id.localeCompare(a.id));

	return await packNoteManyForApi(deps, notes, me, {
		detail: true,
	});
}
