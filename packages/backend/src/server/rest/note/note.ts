/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { endpointMetas as usersContracts } from '@/server/rest/contracts/users.js';
import type { endpointMetas as notesContracts } from '@/server/rest/contracts/notes.js';
import type { ContractErrors } from '../endpoint-contract.js';
import { URLSearchParams } from 'node:url';
import { z } from 'zod';
import {
	followingExistsInDatabase,
	listFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabase,
} from '@/core/user/following-store.js';
import {
	fetchNoteByIdFromDatabase,
	listFeaturedNotesByIdsFromDatabase,
	listNotesByIdsFromDatabase,
	listUserTimelineNotesFromDatabase,
} from '@/core/note/note-store.js';
import { listNoteReactionsByUserAndNoteIdsFromDatabase } from '@/core/note/note-reaction-store.js';
import { listPollVotesByNoteIdsAndUserFromDatabase } from '@/core/note/poll-vote-store.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/user/user-store.js';
import { listBlockerIdsByBlockeeIdFromDatabase } from '@/core/user/blocking-store.js';
import { listMuteeIdsByMuterIdFromDatabase } from '@/core/user/muting-store.js';
import {
	fanoutViewerRelationKinds,
	fetchViewerRelationSnapshotFromDatabase,
} from '@/core/user/viewer-relation-store.js';
import type { HttpRequestService } from '@/core/net/http-request-service.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { shouldHideNoteByTime } from '@/misc/should-hide-note-by-time.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { omitUndefined } from '@/misc/clone.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { ApiError } from '../error.js';
import { fetchRolePolicies } from '../../../core/role/role-policy.js';
import type { RolePolicyDependencies } from '../../../core/role/role-policy.js';
import { fetchFanoutTimelineNotes } from './fanout-timeline.js';
import { parseApiParams } from '../validation.js';
import type { Params } from '../validation.js';
import { resolveApiDateIdBounds } from '../date-id-pagination.js';
import { PER_USER_NOTES_RANKING_WINDOW, readFeaturedRanking } from '@/core/featured/featured-ranking.js';
import { collectFilteredInOrder } from '@/misc/collect-filtered-in-order.js';
import type { NoteDependencies, PackNoteBatchHint } from '@/core/note/note-packing.js';
import {
	buildPackNoteStaticHint,
	collectPackNoteTargets,
	isVisibleForMe,
	normalizeReactionKey,
	normalizeReactionKeys,
	packNote,
} from '@/core/note/note-packing.js';

/**
 * 本文を読む・投票する・リアクションする経路の判定。公開範囲に加えて、作者が「過去の投稿を非公開にする」
 * 「過去の投稿をフォロワー限定にする」と設定した投稿を、pack が隠すのと同じ条件で見えないものとして扱う。
 * (isVisibleForMe は公開範囲の列しか見ないので、pack を通らない経路ではこちらを使う)
 */
export async function isNoteContentVisibleForMe(
	deps: NoteDependencies,
	note: MiNote,
	meId: MiUser['id'] | null,
): Promise<boolean> {
	if (meId === note.userId) {
		return true;
	}
	const author = await fetchUserByIdOrFailFromDatabase(deps.db, note.userId);
	const createdAt = parseId(note.id).date;
	if (author.requireSigninToViewContents && meId == null) {
		return false;
	}
	if (shouldHideNoteByTime(author.makeNotesHiddenBefore, createdAt)) {
		return false;
	}
	if (
		(note.visibility === 'public' || note.visibility === 'home') &&
		shouldHideNoteByTime(author.makeNotesFollowersOnlyBefore, createdAt)
	) {
		return await isVisibleForMe(deps, { ...note, visibility: 'followers' }, meId);
	}
	return await isVisibleForMe(deps, note, meId);
}

export async function packNoteMany(
	deps: NoteDependencies,
	notes: MiNote[],
	me: { id: MiUser['id'] } | null | undefined,
	options?: {
		detail?: boolean;
		skipHide?: boolean;
		followeeIds?: Set<MiUser['id']>;
	},
): Promise<Packed<'Note'>[]> {
	if (notes.length === 0) {
		return [];
	}

	const detail = options?.detail ?? true;
	const meId = me ? me.id : null;
	if (detail) {
		const relationIds = new Set<MiNote['id']>();
		for (const note of notes) {
			if (note.replyId != null && note.reply == null) {
				relationIds.add(note.replyId);
			}
			if (note.renoteId != null && note.renote == null) {
				relationIds.add(note.renoteId);
			}
		}
		if (relationIds.size > 0) {
			const relations = await listNotesByIdsFromDatabase(deps.db, [...relationIds]);
			const relationById = new Map(relations.map((note) => [note.id, note]));
			for (const note of notes) {
				if (note.replyId != null && note.reply == null) {
					note.reply = relationById.get(note.replyId) ?? null;
				}
				if (note.renoteId != null && note.renote == null) {
					note.renote = relationById.get(note.renoteId) ?? null;
				}
			}
		}
	}
	const targetInfo = collectPackNoteTargets(notes, detail);
	const { targets, detailTargetIds, pollTargetIds } = targetInfo;
	const followeeIdCoverage =
		options?.followeeIds == null && meId != null && !options?.skipHide
			? new Set(
					targets
						.filter((target) => target.visibility === 'followers' && target.userId !== meId)
						.map((target) => target.userId),
				)
			: undefined;

	const [staticHint, pollVotes, packedFolloweeIds] = await Promise.all([
		buildPackNoteStaticHint(deps, targetInfo),
		meId != null ? listPollVotesByNoteIdsAndUserFromDatabase(deps.db, pollTargetIds, meId) : Promise.resolve([]),
		followeeIdCoverage != null && meId != null
			? listFolloweeIdsByFollowerIdAndFolloweeIdsFromDatabase(deps.db, meId, [...followeeIdCoverage])
			: Promise.resolve([]),
	]);

	// pair cache で解決できない myReaction だけを 1 クエリでまとめて取得する。
	const myReactions = new Map<MiNote['id'], string | undefined>();
	if (meId != null && detail) {
		const idsNeedingDbLookup: MiNote['id'][] = [];
		for (const target of targets) {
			if (!detailTargetIds.has(target.id)) {
				continue;
			}
			const reactions = normalizeReactionKeys(target.reactions);
			const reactionsCount = Object.values(reactions).reduce((a, b) => a + b, 0);
			if (reactionsCount === 0) {
				myReactions.set(target.id, undefined);
				continue;
			}
			const pairCache = target.reactionAndUserPairCache ?? [];
			if (reactionsCount <= pairCache.length) {
				const pair = pairCache.find((pair) => pair.startsWith(meId));
				myReactions.set(target.id, pair ? normalizeReactionKey(pair.split('/')[1]!) : undefined);
				continue;
			}
			if (parseId(target.id).date.getTime() + 2000 > Date.now()) {
				myReactions.set(target.id, undefined);
				continue;
			}
			idsNeedingDbLookup.push(target.id);
		}
		if (idsNeedingDbLookup.length > 0) {
			const rows = await listNoteReactionsByUserAndNoteIdsFromDatabase(deps.db, meId, idsNeedingDbLookup);
			const reactionByNoteId = new Map(rows.map((row) => [row.noteId, row.reaction]));
			for (const id of idsNeedingDbLookup) {
				const reaction = reactionByNoteId.get(id);
				myReactions.set(id, reaction != null ? normalizeReactionKey(reaction) : undefined);
			}
		}
	}

	const hint: PackNoteBatchHint = {
		...staticHint,
		myReactions,
		pollVotes: Map.groupBy(pollVotes, (vote) => vote.noteId),
		pollVoteNoteIds: meId != null ? new Set(pollTargetIds) : new Set(),
		...omitUndefined({
			followeeIds: options?.followeeIds ?? (followeeIdCoverage != null ? new Set(packedFolloweeIds) : undefined),
			followeeIdCoverage,
		}),
	};

	return await Promise.all(notes.map((note) => packNote(deps, note, me, { ...options, hint })));
}

export const usersFeaturedNotesParamDef = z.object({
	limit: z.int().min(1).max(100).default(10),
	untilId: misskeyId().optional(),
	userId: misskeyId(),
});

export async function handleApiUsersFeaturedNotes(
	deps: NoteDependencies,
	me: MiUser | null | undefined,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseApiParams(usersFeaturedNotesParamDef, body);

	const userIdsWhoBlockingMe = me
		? new Set(await listBlockerIdsByBlockeeIdFromDatabase(deps.db, me.id))
		: new Set<string>();

	if (userIdsWhoBlockingMe.has(params.userId)) {
		return [];
	}

	let noteIds = await readFeaturedRanking(
		deps.redis,
		`featuredPerUserNotesRanking:${params.userId}`,
		PER_USER_NOTES_RANKING_WINDOW,
		50,
	);

	noteIds.sort((a, b) => (a > b ? -1 : 1));
	if (params.untilId) {
		noteIds = noteIds.filter((id) => id < params.untilId!);
	}

	if (noteIds.length === 0) {
		return [];
	}

	const userIdsWhoMeMuting = me ? new Set(await listMuteeIdsByMuterIdFromDatabase(deps.db, me.id)) : new Set<string>();

	const notes = await collectFilteredInOrder(noteIds, params.limit, async (ids) =>
		(await listFeaturedNotesByIdsFromDatabase(deps.db, ids, deps.meta.blockedHosts)).filter(
			(note) =>
				!(me && (isUserRelated(note, userIdsWhoBlockingMe, false) || isUserRelated(note, userIdsWhoMeMuting, true))),
		),
	);

	return await packNoteMany(deps, notes, me);
}

function notesTranslateUnavailableError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Translate of notes unavailable.',
		code: 'UNAVAILABLE',
		id: '50a70314-2d8a-431b-b433-efa5cc56444c',
	});
}

export const notesTranslateParamDef = z.object({
	noteId: misskeyId(),
	targetLang: z.string(),
});

export type NotesTranslateDependencies = NoteDependencies &
	RolePolicyDependencies & {
		httpRequestService: Pick<HttpRequestService, 'send'>;
	};

const deeplTranslationResponse = z.object({
	translations: z
		.array(
			z.object({
				detected_source_language: z.string(),
				text: z.string(),
			}),
		)
		.min(1),
});

const libreTranslateResponse = z.object({
	translatedText: z.string(),
	detectedLanguage: z
		.object({
			language: z.string(),
		})
		.optional(),
});

export async function translateText(
	deps: Pick<NotesTranslateDependencies, 'meta' | 'httpRequestService'>,
	text: string,
	targetLang: string,
): Promise<{ sourceLang: string; text: string }> {
	if (deps.meta.translatorProvider === 'libreTranslate') {
		if (deps.meta.libreTranslateApiUrl == null) {
			throw notesTranslateUnavailableError();
		}

		const endpoint = new URL(deps.meta.libreTranslateApiUrl);
		endpoint.pathname = `${endpoint.pathname.replace(/\/$/, '')}/translate`;
		const body: {
			q: string;
			source: string;
			target: string;
			format: string;
			api_key?: string;
		} = {
			q: text,
			source: 'auto',
			target: targetLang.toLowerCase(),
			format: 'text',
		};
		if (deps.meta.libreTranslateApiKey != null) {
			body.api_key = deps.meta.libreTranslateApiKey;
		}

		const res = await deps.httpRequestService.send(endpoint.href, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json, */*',
			},
			body: JSON.stringify(body),
			timeout: 30_000,
			size: 1024 * 1024,
			isLocalAddressAllowed: true,
		});
		const json = libreTranslateResponse.parse(await res.json());

		return {
			sourceLang: json.detectedLanguage?.language ?? 'auto',
			text: json.translatedText,
		};
	}

	if (deps.meta.deeplAuthKey == null) {
		throw notesTranslateUnavailableError();
	}

	const searchParams = new URLSearchParams();
	searchParams.append('text', text);
	searchParams.append('target_lang', targetLang);
	const endpoint = deps.meta.deeplIsPro
		? 'https://api.deepl.com/v2/translate'
		: 'https://api-free.deepl.com/v2/translate';
	const res = await deps.httpRequestService.send(endpoint, {
		method: 'POST',
		headers: {
			Authorization: `DeepL-Auth-Key ${deps.meta.deeplAuthKey}`,
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json, */*',
		},
		body: searchParams.toString(),
	});
	const json = deeplTranslationResponse.parse(await res.json());
	const translation = json.translations[0];
	if (translation == null) {
		throw notesTranslateUnavailableError();
	}

	return {
		sourceLang: translation.detected_source_language,
		text: translation.text,
	};
}

export async function handleApiNotesTranslate(
	deps: NotesTranslateDependencies,
	me: MiUser,
	params: Params<typeof notesTranslateParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/translate']>,
): Promise<{ sourceLang: string; text: string } | undefined> {
	const policies = await fetchRolePolicies(deps, me);
	if (!policies.canUseTranslator) {
		throw errors.unavailable();
	}

	const note = await fetchNoteByIdFromDatabase(deps.db, params.noteId);
	if (note == null) {
		throw errors.noSuchNote();
	}

	if (!(await isNoteContentVisibleForMe(deps, note, me.id))) {
		throw errors.cannotTranslateInvisibleNote();
	}

	// CW も訳す。区切り線はクライアントのブラウザ内翻訳と同じ形にそろえる。
	const text = note.cw != null ? `${note.cw}\n-----\n${note.text ?? ''}` : (note.text ?? '');
	if (text.trim() === '') {
		return undefined;
	}

	let targetLang = params.targetLang;
	if (targetLang.includes('-')) {
		targetLang = targetLang.split('-')[0]!;
	}

	return await translateText(deps, text, targetLang);
}

export const usersNotesParamDef = z.object({
	userId: misskeyId(),
	withReplies: z.boolean().default(false),
	withRenotes: z.boolean().default(true),
	withChannelNotes: z.boolean().default(false),
	limit: z.int().min(1).max(100).default(10),
	...paginationParams,
	allowPartial: z.boolean().default(false),
	withFiles: z.boolean().default(false),
});

export async function handleApiUsersNotes(
	deps: NoteDependencies,
	me: MiUser | null | undefined,
	params: Params<typeof usersNotesParamDef>,
	errors: ContractErrors<(typeof usersContracts)['users/notes']>,
): Promise<Packed<'Note'>[]> {
	if (params.withReplies && params.withFiles) {
		throw errors.bothWithRepliesAndWithFiles();
	}

	const { sinceId, untilId } = resolveApiDateIdBounds(params);

	// ブロック・チャンネルミュート・fanout が共有する関係を 1 クエリで取得する。
	const viewerRelation =
		me != null
			? await fetchViewerRelationSnapshotFromDatabase(deps.db, me.id, new Date(), fanoutViewerRelationKinds)
			: undefined;

	if (viewerRelation != null && viewerRelation.blockerIds.includes(params.userId)) {
		return [];
	}

	const getFromDb = (dbUntilId: string | null, dbSinceId: string | null, limit: number) =>
		listUserTimelineNotesFromDatabase(deps.db, {
			userId: params.userId,
			limit,
			sinceId: dbSinceId,
			untilId: dbUntilId,
			withChannelNotes: params.withChannelNotes,
			withFiles: params.withFiles,
			withRenotes: params.withRenotes,
			withReplies: params.withReplies,
			me: me ?? null,
			blockedHosts: deps.meta.blockedHosts,
			mutingChannelIds: viewerRelation?.mutedChannelIds ?? [],
		});

	if (deps.meta.enableFanoutTimeline && deps.redisForTimelines != null) {
		const isSelf = me != null && me.id === params.userId;

		const redisTimelines = [
			params.withFiles ? `userTimelineWithFiles:${params.userId}` : `userTimeline:${params.userId}`,
		];
		if (params.withReplies) {
			redisTimelines.push(`userTimelineWithReplies:${params.userId}`);
		}
		if (params.withChannelNotes) {
			redisTimelines.push(`userTimelineWithChannel:${params.userId}`);
		}

		const isFollowing = me != null && (await followingExistsInDatabase(deps.db, me.id, params.userId));

		const notes = await fetchFanoutTimelineNotes(
			{ db: deps.db, meta: deps.meta, redisForTimelines: deps.redisForTimelines },
			{
				untilId,
				sinceId,
				limit: params.limit,
				allowPartial: params.allowPartial,
				me,
				viewerRelation,
				useDbFallback: true,
				redisTimelines,
				ignoreAuthorFromMute: true,
				ignoreAuthorFromInstanceBlock: true,
				ignoreAuthorFromUserSuspension: true,
				excludeReplies: params.withChannelNotes && !params.withReplies,
				excludeNoFiles: params.withChannelNotes && params.withFiles,
				excludePureRenotes: !params.withRenotes,
				// 他ユーザーの一覧だけがセンシティブチャンネルを除外するため、チャンネル情報を取得する。
				hydrateChannels: !isSelf,
				noteFilter: (note) => {
					// リノート経由の本文にも同じセンシティブ判定を適用する。
					if (!isSelf && (note.channel?.isSensitive || note.renote?.channel?.isSensitive)) {
						return false;
					}
					if (
						note.visibility === 'specified' &&
						(!me || (me.id !== note.userId && !note.visibleUserIds.includes(me.id)))
					) {
						return false;
					}
					if (note.visibility === 'followers' && !isFollowing && !isSelf) {
						return false;
					}

					return true;
				},
				dbFallback: getFromDb,
			},
		);

		return await packNoteMany(deps, notes, me);
	}

	const notes = await getFromDb(untilId, sinceId, params.limit);

	return await packNoteMany(deps, notes, me);
}
