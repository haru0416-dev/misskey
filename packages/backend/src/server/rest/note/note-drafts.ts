/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { blockingExistsInDatabase } from '@/core/user/BlockingStore.js';
import { fetchChannelByIdFromDatabase, listChannelsByIdsFromDatabase } from '@/core/channel/ChannelStore.js';
import {
	listDriveFilesByIdsFromDatabase,
	listDriveFilesByIdsAndUserIdPreservingOrderFromDatabase,
} from '@/core/drive/DriveFileStore.js';
import {
	countNoteDraftsByUserIdFromDatabase,
	createNoteDraftInDatabase,
	deleteNoteDraftByIdFromDatabase,
	fetchNoteDraftByIdAndUserIdFromDatabase,
	listNoteDraftsByUserIdFromDatabase,
	resolveNoteDraftPagination,
	updateNoteDraftInDatabase,
} from '@/core/note/NoteDraftStore.js';
import { fetchNoteByIdFromDatabase, listNotesByIdsFromDatabase } from '@/core/note/NoteStore.js';
import type { PostScheduledNoteQueue } from '@/core/queue/queues.js';
import { queueRetentionOptions } from '@/queue/const.js';
import { listUsersByIdsFromDatabase } from '@/core/user/UserStore.js';
import { isEntityNotFoundError } from '@/misc/db-errors.js';
import { omitUndefined } from '@/misc/clone.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId, paginationParams, uniqueItems } from '@/misc/zod-params.js';
import { MAX_NOTE_TEXT_LENGTH } from '@/const.js';
import type { MiNote } from '@/models/Note.js';
import type { MiNoteDraft } from '@/models/NoteDraft.js';
import type { MiLocalUser } from '@/models/User.js';
import { ApiError } from '../error.js';
import { isVisibleForMeForApi, packNoteForApi, packNoteManyForApi, type ApiNoteDependencies } from './note.js';
import { packDriveFileManyByIdsForApi, packDriveFileManyForApi } from '../drive/drive-file.js';
import { getApiRolePolicies, type ApiRolePolicyDependencies } from '../role/role-policy.js';
import { packUserLiteForApi, packUserLiteManyForApi } from '../user/user.js';
import { parseApiParams } from '../validation.js';

export type ApiNoteDraftDependencies = ApiNoteDependencies &
	ApiRolePolicyDependencies & {
		postScheduledNoteQueue: PostScheduledNoteQueue;
	};

export const countNoteDraftsParamDef = z.object({});

export async function handleApiNotesDraftsCount(
	deps: ApiNoteDraftDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<number> {
	parseApiParams(countNoteDraftsParamDef, body);
	return await countNoteDraftsByUserIdFromDatabase(deps.db, me.id);
}

const notePollParamDef = z
	.object({
		choices: uniqueItems(z.array(z.string().min(1).max(50)).min(0).max(10)),
		multiple: z.boolean().optional(),
		expiresAt: z.number().int().nullable().optional(),
		expiredAfter: z.number().int().min(1).nullable().optional(),
	})
	.nullable();

export const notesDraftsCreateParamDef = z.object({
	visibility: z.enum(['public', 'home', 'followers', 'specified']).default('public'),
	visibleUserIds: uniqueItems(z.array(misskeyId())).optional(),
	cw: z.string().min(1).max(100).nullable().optional(),
	hashtag: z.string().max(200).nullable().optional(),
	localOnly: z.boolean().default(false),
	reactionAcceptance: z
		.union([
			z.enum(['likeOnly', 'likeOnlyForRemote', 'nonSensitiveOnly', 'nonSensitiveOnlyForLocalLikeOnlyForRemote']),
			z.null(),
		])
		.default(null),
	replyId: misskeyId().nullable().optional(),
	renoteId: misskeyId().nullable().optional(),
	channelId: misskeyId().nullable().optional(),
	text: z.string().min(0).max(MAX_NOTE_TEXT_LENGTH).nullable().optional(),
	fileIds: uniqueItems(z.array(misskeyId()).min(0).max(16)).optional(),
	poll: notePollParamDef.optional(),
	scheduledAt: z.number().int().nullable().optional(),
	isActuallyScheduled: z.boolean().default(false),
});

type NotesDraftsCreateParams = {
	visibility: 'public' | 'home' | 'followers' | 'specified';
	visibleUserIds?: string[];
	cw?: string | null;
	hashtag?: string | null;
	localOnly: boolean;
	reactionAcceptance?: string | null;
	replyId?: string | null;
	renoteId?: string | null;
	channelId?: string | null;
	text?: string | null;
	fileIds?: string[];
	poll?: {
		choices: string[];
		multiple?: boolean;
		expiresAt?: number | null;
		expiredAfter?: number | null;
	} | null;
	scheduledAt?: number | null;
	isActuallyScheduled: boolean;
};

export const notesDraftsUpdateParamDef = z.object({
	draftId: misskeyId(),
	visibility: z.enum(['public', 'home', 'followers', 'specified']).optional(),
	visibleUserIds: uniqueItems(z.array(misskeyId())).optional(),
	cw: z.string().min(1).max(100).nullable().optional(),
	hashtag: z.string().max(200).nullable().optional(),
	localOnly: z.boolean().optional(),
	reactionAcceptance: z
		.union([
			z.enum(['likeOnly', 'likeOnlyForRemote', 'nonSensitiveOnly', 'nonSensitiveOnlyForLocalLikeOnlyForRemote']),
			z.null(),
		])
		.optional(),
	replyId: misskeyId().nullable().optional(),
	renoteId: misskeyId().nullable().optional(),
	channelId: misskeyId().nullable().optional(),
	text: z.string().min(0).max(MAX_NOTE_TEXT_LENGTH).nullable().optional(),
	fileIds: uniqueItems(z.array(misskeyId()).min(0).max(16)).optional(),
	poll: notePollParamDef.optional(),
	scheduledAt: z.number().int().nullable().optional(),
	isActuallyScheduled: z.boolean().optional(),
});

type NotesDraftsUpdateParams = {
	draftId: string;
	visibility?: 'public' | 'home' | 'followers' | 'specified';
	visibleUserIds?: string[];
	cw?: string | null;
	hashtag?: string | null;
	localOnly?: boolean;
	reactionAcceptance?: string | null;
	replyId?: string | null;
	renoteId?: string | null;
	channelId?: string | null;
	text?: string | null;
	fileIds?: string[];
	poll?: {
		choices: string[];
		multiple?: boolean;
		expiresAt?: number | null;
		expiredAfter?: number | null;
	} | null;
	scheduledAt?: number | null;
	isActuallyScheduled?: boolean;
};

export const notesDraftsDeleteParamDef = z.object({
	draftId: misskeyId(),
});

type NotesDraftsDeleteParams = {
	draftId: string;
};

export const notesDraftsListParamDef = z.object({
	limit: z.number().int().min(1).max(100).default(30),
	...paginationParams,
	scheduled: z.boolean().nullable().optional(),
});

type NotesDraftsListParams = {
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
	scheduled?: boolean | null;
};

function draftNoSuchNoteDraftError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such note draft.',
		code: 'NO_SUCH_NOTE_DRAFT',
		id: '49cd6b9d-848e-41ee-b0b9-adaca711a6b1',
	});
}

type DraftValidationErrorMap = {
	scheduledAtRequired: ApiError;
	scheduledAtMustBeInFuture: ApiError;
	cannotCreateAlreadyExpiredPoll: ApiError;
	noSuchFile: ApiError;
	noSuchRenoteTarget: ApiError;
	cannotReRenote: ApiError;
	youHaveBeenBlocked: ApiError;
	cannotRenoteDueToVisibility: ApiError;
	noSuchChannel: ApiError;
	cannotRenoteToExternal: ApiError;
	noSuchReplyTarget: ApiError;
	cannotReplyToPureRenote: ApiError;
	cannotReplyToInvisibleNote: ApiError;
	cannotReplyToSpecifiedVisibilityNoteWithExtendedVisibility: ApiError;
};

async function validateNoteDraft(
	deps: ApiNoteDraftDependencies,
	me: MiLocalUser,
	data: {
		isActuallyScheduled?: boolean;
		scheduledAt?: Date | null;
		pollExpiresAt?: Date | null;
		visibleUserIds?: string[];
		fileIds?: string[];
		renoteId?: string | null;
		replyId?: string | null;
		visibility?: string;
		channelId?: string | null;
	},
	errors: DraftValidationErrorMap,
): Promise<void> {
	if (data.isActuallyScheduled) {
		if (data.scheduledAt == null) throw errors.scheduledAtRequired;
		if (data.scheduledAt.getTime() < Date.now()) throw errors.scheduledAtMustBeInFuture;
	}

	if (data.pollExpiresAt != null && data.pollExpiresAt.getTime() < Date.now()) {
		throw errors.cannotCreateAlreadyExpiredPoll;
	}

	if (data.visibleUserIds != null && data.visibleUserIds.length > 0) {
		await listUsersByIdsFromDatabase(deps.db, data.visibleUserIds, { includeSuspended: true });
	}

	if (data.fileIds != null && data.fileIds.length > 0) {
		const files = await listDriveFilesByIdsAndUserIdPreservingOrderFromDatabase(deps.db, data.fileIds, me.id);
		if (files.length !== data.fileIds.length) throw errors.noSuchFile;
	}

	if (data.renoteId != null) {
		const renote = await fetchNoteByIdFromDatabase(deps.db, data.renoteId);
		if (renote == null) throw errors.noSuchRenoteTarget;
		if (isRenote(renote) && !isQuote(renote)) throw errors.cannotReRenote;

		if (renote.userId !== me.id) {
			const blockExist = await blockingExistsInDatabase(deps.db, renote.userId, me.id);
			if (blockExist) throw errors.youHaveBeenBlocked;
		}

		if (renote.visibility === 'followers' && renote.userId !== me.id) throw errors.cannotRenoteDueToVisibility;
		if (renote.visibility === 'specified') throw errors.cannotRenoteDueToVisibility;

		if (renote.channelId && renote.channelId !== data.channelId) {
			const renoteChannel = await fetchChannelByIdFromDatabase(deps.db, renote.channelId);
			if (renoteChannel == null) throw errors.noSuchChannel;
			if (!renoteChannel.allowRenoteToExternal) throw errors.cannotRenoteToExternal;
		}
	}

	if (data.replyId != null) {
		const reply = await fetchNoteByIdFromDatabase(deps.db, data.replyId);
		if (reply == null) throw errors.noSuchReplyTarget;
		if (isRenote(reply) && !isQuote(reply)) throw errors.cannotReplyToPureRenote;
		if (!(await isVisibleForMeForApi(deps, reply, me.id))) throw errors.cannotReplyToInvisibleNote;
		if (reply.visibility === 'specified' && data.visibility !== 'specified')
			throw errors.cannotReplyToSpecifiedVisibilityNoteWithExtendedVisibility;

		if (reply.userId !== me.id) {
			const blockExist = await blockingExistsInDatabase(deps.db, reply.userId, me.id);
			if (blockExist) throw errors.youHaveBeenBlocked;
		}
	}

	if (data.channelId != null) {
		const channel = await fetchChannelByIdFromDatabase(deps.db, data.channelId);
		if (channel == null || channel.isArchived) throw errors.noSuchChannel;
	}
}

async function scheduleNoteDraft(deps: ApiNoteDraftDependencies, draft: MiNoteDraft): Promise<void> {
	if (!draft.isActuallyScheduled) return;
	if (draft.scheduledAt == null) return;
	if (draft.scheduledAt.getTime() <= Date.now()) return;

	const delay = draft.scheduledAt.getTime() - Date.now();
	await deps.postScheduledNoteQueue.add(
		draft.id,
		{
			noteDraftId: draft.id,
			scheduledAt: draft.scheduledAt.getTime(),
		},
		{
			jobId: `scheduled-${draft.id}-${draft.scheduledAt.getTime()}`,
			delay,
			attempts: 3,
			backoff: {
				type: 'exponential',
				delay: 30_000,
			},
			...queueRetentionOptions(deps.config),
		},
	);
}

async function clearNoteDraftSchedule(deps: ApiNoteDraftDependencies, draft: MiNoteDraft): Promise<void> {
	if (draft.scheduledAt != null) {
		const job = await deps.postScheduledNoteQueue.getJob(`scheduled-${draft.id}-${draft.scheduledAt.getTime()}`);
		if (job != null && !(await job.isActive())) await job.remove();
	}

	// 古い revision は worker が拒否するため、リクエスト処理でキュー全体を走査しない。
}

async function packNoteDraftForApi(
	deps: ApiNoteDraftDependencies,
	draft: MiNoteDraft,
	me: { id: string } | null | undefined,
	hint?: {
		packedUser?: Packed<'UserLite'>;
		packedFiles?: Map<string, Packed<'DriveFile'>>;
		channel?: NonNullable<Awaited<ReturnType<typeof fetchChannelByIdFromDatabase>>> | null;
		reply?: Packed<'Note'> | null;
		renote?: Packed<'Note'> | null;
	},
): Promise<Packed<'NoteDraft'>> {
	const channel = draft.channelId
		? hint?.channel !== undefined
			? hint.channel
			: await fetchChannelByIdFromDatabase(deps.db, draft.channelId)
		: null;

	async function nullIfEntityNotFound<T>(promise: Promise<T>): Promise<T | null> {
		try {
			return await promise;
		} catch (err) {
			if (isEntityNotFoundError(err)) return null;
			throw err;
		}
	}

	const [user, files, reply, renote] = await Promise.all([
		hint?.packedUser ?? packUserLiteForApi(deps, draft.userId),
		hint?.packedFiles
			? draft.fileIds
					.map((fileId) => hint.packedFiles?.get(fileId))
					.filter((file): file is Packed<'DriveFile'> => file != null)
			: packDriveFileManyByIdsForApi(deps, draft.fileIds),
		draft.replyId
			? hint?.reply !== undefined
				? hint.reply
				: nullIfEntityNotFound(packNoteForApi(deps, draft.replyId, me, { detail: false }))
			: Promise.resolve(undefined),
		draft.renoteId
			? hint?.renote !== undefined
				? hint.renote
				: nullIfEntityNotFound(packNoteForApi(deps, draft.renoteId, me, { detail: true }))
			: Promise.resolve(undefined),
	]);

	return {
		id: draft.id,
		createdAt: parseId(draft.id).date.toISOString(),
		scheduledAt: draft.scheduledAt?.getTime() ?? null,
		isActuallyScheduled: draft.isActuallyScheduled,
		userId: draft.userId,
		user,
		text: draft.text,
		cw: draft.cw,
		visibility: draft.visibility,
		localOnly: draft.localOnly,
		reactionAcceptance: draft.reactionAcceptance,
		visibleUserIds: draft.visibleUserIds,
		hashtag: draft.hashtag,
		fileIds: draft.fileIds,
		files,
		replyId: draft.replyId,
		renoteId: draft.renoteId,
		channelId: draft.channelId,
		channel: channel
			? {
					id: channel.id,
					name: channel.name,
					color: channel.color,
					isSensitive: channel.isSensitive,
					allowRenoteToExternal: channel.allowRenoteToExternal,
					userId: channel.userId,
				}
			: undefined,
		poll: draft.hasPoll
			? {
					choices: draft.pollChoices,
					multiple: draft.pollMultiple,
					expiresAt: draft.pollExpiresAt?.toISOString(),
					expiredAfter: draft.pollExpiredAfter,
				}
			: null,
		reply: draft.replyId ? reply : undefined,
		renote: draft.renoteId ? renote : undefined,
	} satisfies Packed<'NoteDraft'>;
}

async function packNoteDraftManyForApi(
	deps: ApiNoteDraftDependencies,
	drafts: MiNoteDraft[],
	me: { id: string } | null | undefined,
): Promise<Packed<'NoteDraft'>[]> {
	if (drafts.length === 0) return [];

	const userSources = [...new Set(drafts.map((draft) => draft.userId))];
	const fileIds = [...new Set(drafts.flatMap((draft) => draft.fileIds))];
	const channelIds = [...new Set(drafts.map((draft) => draft.channelId).filter((id): id is string => id != null))];
	const replyIds = [...new Set(drafts.map((draft) => draft.replyId).filter((id): id is string => id != null))];
	const renoteIds = [...new Set(drafts.map((draft) => draft.renoteId).filter((id): id is string => id != null))];

	const [packedUsers, files, channels, replyNotes, renoteNotes] = await Promise.all([
		packUserLiteManyForApi(deps, userSources),
		fileIds.length > 0 ? listDriveFilesByIdsFromDatabase(deps.db, fileIds) : Promise.resolve([]),
		channelIds.length > 0 ? listChannelsByIdsFromDatabase(deps.db, channelIds) : Promise.resolve([]),
		replyIds.length > 0 ? listNotesByIdsFromDatabase(deps.db, replyIds) : Promise.resolve([]),
		renoteIds.length > 0 ? listNotesByIdsFromDatabase(deps.db, renoteIds) : Promise.resolve([]),
	]);

	const [packedFiles, packedReplies, packedRenotes] = await Promise.all([
		packDriveFileManyForApi(deps, files),
		packNoteManyForApi(deps, replyNotes, me, { detail: false }),
		packNoteManyForApi(deps, renoteNotes, me, { detail: true }),
	]);

	const userById = new Map(packedUsers.map((user) => [user.id, user]));
	const fileById = new Map(packedFiles.map((file) => [file.id, file]));
	const channelById = new Map(channels.map((channel) => [channel.id, channel]));
	const replyById = new Map(packedReplies.map((note) => [note.id, note]));
	const renoteById = new Map(packedRenotes.map((note) => [note.id, note]));

	return await Promise.all(
		drafts.map((draft) =>
			packNoteDraftForApi(
				deps,
				draft,
				me,
				omitUndefined({
					packedUser: userById.get(draft.userId),
					packedFiles: fileById,
					channel: draft.channelId ? (channelById.get(draft.channelId) ?? null) : null,
					reply: draft.replyId ? (replyById.get(draft.replyId) ?? null) : undefined,
					renote: draft.renoteId ? (renoteById.get(draft.renoteId) ?? null) : undefined,
				}),
			),
		),
	);
}

export async function handleApiNotesDraftsCreate(
	deps: ApiNoteDraftDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ createdDraft: Packed<'NoteDraft'> }> {
	const params = parseApiParams(notesDraftsCreateParamDef, body);

	const policies = await getApiRolePolicies(deps, me);
	const currentCount = await countNoteDraftsByUserIdFromDatabase(deps.db, me.id);
	if (currentCount >= policies.noteDraftLimit) {
		throw new ApiError({
			status: 400,
			message: 'You cannot create drafts any more.',
			code: 'TOO_MANY_DRAFTS',
			id: '9ee33bbe-fde3-4c71-9b51-e50492c6b9c8',
		});
	}

	if (params.isActuallyScheduled) {
		const currentScheduledCount = await countNoteDraftsByUserIdFromDatabase(deps.db, me.id, {
			isActuallyScheduled: true,
		});
		if (currentScheduledCount >= policies.scheduledNoteLimit) {
			throw new ApiError({
				status: 400,
				message: 'You cannot create scheduled notes any more.',
				code: 'TOO_MANY_SCHEDULED_NOTES',
				id: '22ae69eb-09e3-4541-a850-773cfa45e693',
			});
		}
	}

	const scheduledAt = params.scheduledAt ? new Date(params.scheduledAt) : null;
	const pollExpiresAt = params.poll?.expiresAt ? new Date(params.poll.expiresAt) : null;

	await validateNoteDraft(
		deps,
		me,
		omitUndefined({
			isActuallyScheduled: params.isActuallyScheduled,
			scheduledAt,
			pollExpiresAt,
			visibleUserIds: params.visibleUserIds,
			fileIds: params.fileIds,
			renoteId: params.renoteId,
			replyId: params.replyId,
			visibility: params.visibility,
			channelId: params.channelId,
		}),
		{
			scheduledAtRequired: new ApiError({
				status: 400,
				message: 'scheduledAt is required when isActuallyScheduled is true.',
				code: 'SCHEDULED_AT_REQUIRED',
				id: '15e28a55-e74c-4d65-89b7-8880cdaaa87d',
			}),
			scheduledAtMustBeInFuture: new ApiError({
				status: 400,
				message: 'scheduledAt must be in the future.',
				code: 'SCHEDULED_AT_MUST_BE_IN_FUTURE',
				id: 'e4bed6c9-017e-4934-aed0-01c22cc60ec1',
			}),
			cannotCreateAlreadyExpiredPoll: new ApiError({
				status: 400,
				message: 'Poll is already expired.',
				code: 'CANNOT_CREATE_ALREADY_EXPIRED_POLL',
				id: '04da457d-b083-4055-9082-955525eda5a5',
			}),
			noSuchFile: new ApiError({
				status: 400,
				message: 'Some files are not found.',
				code: 'NO_SUCH_FILE',
				id: 'b6992544-63e7-67f0-fa7f-32444b1b5306',
			}),
			noSuchRenoteTarget: new ApiError({
				status: 400,
				message: 'No such renote target.',
				code: 'NO_SUCH_RENOTE_TARGET',
				id: 'b5c90186-4ab0-49c8-9bba-a1f76c282ba4',
			}),
			cannotReRenote: new ApiError({
				status: 400,
				message: 'You can not Renote a pure Renote.',
				code: 'CANNOT_RENOTE_TO_A_PURE_RENOTE',
				id: 'fd4cc33e-2a37-48dd-99cc-9b806eb2031a',
			}),
			youHaveBeenBlocked: new ApiError({
				status: 400,
				message: 'You have been blocked by this user.',
				code: 'YOU_HAVE_BEEN_BLOCKED',
				id: 'b390d7e1-8a5e-46ed-b625-06271cafd3d3',
			}),
			cannotRenoteDueToVisibility: new ApiError({
				status: 400,
				message: 'You can not Renote due to target visibility.',
				code: 'CANNOT_RENOTE_DUE_TO_VISIBILITY',
				id: 'be9529e9-fe72-4de0-ae43-0b363c4938af',
			}),
			noSuchChannel: new ApiError({
				status: 400,
				message: 'No such channel.',
				code: 'NO_SUCH_CHANNEL',
				id: 'b1653923-5453-4edc-b786-7c4f39bb0bbb',
			}),
			cannotRenoteToExternal: new ApiError({
				status: 400,
				message: 'Cannot Renote to External.',
				code: 'CANNOT_RENOTE_TO_EXTERNAL',
				id: 'ed1952ac-2d26-4957-8b30-2deda76bedf7',
			}),
			noSuchReplyTarget: new ApiError({
				status: 400,
				message: 'No such reply target.',
				code: 'NO_SUCH_REPLY_TARGET',
				id: '749ee0f6-d3da-459a-bf02-282e2da4292c',
			}),
			cannotReplyToPureRenote: new ApiError({
				status: 400,
				message: 'You can not reply to a pure Renote.',
				code: 'CANNOT_REPLY_TO_A_PURE_RENOTE',
				id: '3ac74a84-8fd5-4bb0-870f-01804f82ce15',
			}),
			cannotReplyToInvisibleNote: new ApiError({
				status: 400,
				message: 'You cannot reply to an invisible Note.',
				code: 'CANNOT_REPLY_TO_AN_INVISIBLE_NOTE',
				id: 'b98980fa-3780-406c-a935-b6d0eeee10d1',
			}),
			cannotReplyToSpecifiedVisibilityNoteWithExtendedVisibility: new ApiError({
				status: 400,
				message: 'You cannot reply to a specified visibility note with extended visibility.',
				code: 'CANNOT_REPLY_TO_SPECIFIED_VISIBILITY_NOTE_WITH_EXTENDED_VISIBILITY',
				id: 'ed940410-535c-4d5e-bfa3-af798671e93c',
			}),
		},
	);

	const draft = await createNoteDraftInDatabase(deps.db, {
		id: genId(),
		userId: me.id,
		fileIds: params.fileIds ?? [],
		pollChoices: params.poll?.choices ?? [],
		pollMultiple: params.poll?.multiple ?? false,
		pollExpiresAt,
		pollExpiredAfter: params.poll?.expiredAfter ?? null,
		hasPoll: params.poll != null,
		text: params.text ?? null,
		replyId: params.replyId ?? null,
		renoteId: params.renoteId ?? null,
		cw: params.cw ?? null,
		hashtag: params.hashtag ?? null,
		localOnly: params.localOnly,
		reactionAcceptance: (params.reactionAcceptance ?? null) as MiNote['reactionAcceptance'],
		visibility: params.visibility,
		visibleUserIds: params.visibleUserIds ?? [],
		channelId: params.channelId ?? null,
		scheduledAt,
		isActuallyScheduled: params.isActuallyScheduled,
	});

	if (draft.scheduledAt && draft.isActuallyScheduled) {
		await scheduleNoteDraft(deps, draft);
	}

	return { createdDraft: await packNoteDraftForApi(deps, draft, me) };
}

export async function handleApiNotesDraftsUpdate(
	deps: ApiNoteDraftDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ updatedDraft: Packed<'NoteDraft'> }> {
	const params = parseApiParams(notesDraftsUpdateParamDef, body);

	const existing = await fetchNoteDraftByIdAndUserIdFromDatabase(deps.db, params.draftId, me.id);
	if (existing == null) throw draftNoSuchNoteDraftError();

	const policies = await getApiRolePolicies(deps, me);
	if (!existing.isActuallyScheduled && params.isActuallyScheduled) {
		const currentScheduledCount = await countNoteDraftsByUserIdFromDatabase(deps.db, me.id, {
			isActuallyScheduled: true,
		});
		if (currentScheduledCount >= policies.scheduledNoteLimit) {
			throw new ApiError({
				status: 400,
				message: 'You cannot create scheduled notes any more.',
				code: 'TOO_MANY_SCHEDULED_NOTES',
				id: '02f5df79-08ae-4a33-8524-f1503c8f6212',
			});
		}
	}

	const scheduledAt =
		params.scheduledAt === undefined
			? existing.scheduledAt
			: params.scheduledAt == null
				? null
				: new Date(params.scheduledAt);
	const pollExpiresAt = params.poll?.expiresAt ? new Date(params.poll.expiresAt) : null;
	const isActuallyScheduled = params.isActuallyScheduled ?? existing.isActuallyScheduled;

	await validateNoteDraft(
		deps,
		me,
		omitUndefined({
			isActuallyScheduled,
			scheduledAt,
			pollExpiresAt,
			visibleUserIds: params.visibleUserIds,
			fileIds: params.fileIds,
			renoteId: params.renoteId,
			replyId: params.replyId,
			visibility: params.visibility,
			channelId: params.channelId,
		}),
		{
			scheduledAtRequired: new ApiError({
				status: 400,
				message: 'scheduledAt is required when isActuallyScheduled is true.',
				code: 'SCHEDULED_AT_REQUIRED',
				id: 'fe9737d5-cc41-498c-af9d-149207307530',
			}),
			scheduledAtMustBeInFuture: new ApiError({
				status: 400,
				message: 'scheduledAt must be in the future.',
				code: 'SCHEDULED_AT_MUST_BE_IN_FUTURE',
				id: 'ed1a6673-d0d1-4364-aaae-9bf3f139cbc5',
			}),
			cannotCreateAlreadyExpiredPoll: new ApiError({
				status: 400,
				message: 'Poll is already expired.',
				code: 'CANNOT_CREATE_ALREADY_EXPIRED_POLL',
				id: '04da457d-b083-4055-9082-955525eda5a5',
			}),
			noSuchFile: new ApiError({
				status: 400,
				message: 'Some files are not found.',
				code: 'NO_SUCH_FILE',
				id: 'b6992544-63e7-67f0-fa7f-32444b1b5306',
			}),
			noSuchRenoteTarget: new ApiError({
				status: 400,
				message: 'No such renote.',
				code: 'NO_SUCH_RENOTE',
				id: '64929870-2540-4d11-af41-3b484d78c956',
			}),
			cannotReRenote: new ApiError({
				status: 400,
				message: 'Cannot renote.',
				code: 'CANNOT_RENOTE',
				id: '76cc5583-5a14-4ad3-8717-0298507e32db',
			}),
			youHaveBeenBlocked: new ApiError({
				status: 400,
				message: 'You have been blocked by this user.',
				code: 'YOU_HAVE_BEEN_BLOCKED',
				id: 'b390d7e1-8a5e-46ed-b625-06271cafd3d3',
			}),
			cannotRenoteDueToVisibility: new ApiError({
				status: 400,
				message: 'You can not Renote due to target visibility.',
				code: 'CANNOT_RENOTE_DUE_TO_VISIBILITY',
				id: 'be9529e9-fe72-4de0-ae43-0b363c4938af',
			}),
			noSuchChannel: new ApiError({
				status: 400,
				message: 'No such channel.',
				code: 'NO_SUCH_CHANNEL',
				id: 'b1653923-5453-4edc-b786-7c4f39bb0bbb',
			}),
			cannotRenoteToExternal: new ApiError({
				status: 400,
				message: 'Cannot Renote to External.',
				code: 'CANNOT_RENOTE_TO_EXTERNAL',
				id: 'ed1952ac-2d26-4957-8b30-2deda76bedf7',
			}),
			noSuchReplyTarget: new ApiError({
				status: 400,
				message: 'No such reply.',
				code: 'NO_SUCH_REPLY',
				id: 'c4721841-22fc-4bb7-ad3d-897ef1d375b5',
			}),
			cannotReplyToPureRenote: new ApiError({
				status: 400,
				message: 'You can not reply to a pure Renote.',
				code: 'CANNOT_REPLY_TO_A_PURE_RENOTE',
				id: '3ac74a84-8fd5-4bb0-870f-01804f82ce15',
			}),
			cannotReplyToInvisibleNote: new ApiError({
				status: 400,
				message: 'You cannot reply to an invisible Note.',
				code: 'CANNOT_REPLY_TO_AN_INVISIBLE_NOTE',
				id: 'b98980fa-3780-406c-a935-b6d0eeee10d1',
			}),
			cannotReplyToSpecifiedVisibilityNoteWithExtendedVisibility: new ApiError({
				status: 400,
				message: 'You cannot reply to a specified visibility note with extended visibility.',
				code: 'CANNOT_REPLY_TO_SPECIFIED_VISIBILITY_NOTE_WITH_EXTENDED_VISIBILITY',
				id: '215dbc76-336c-4d2a-9605-95766ba7dab0',
			}),
		},
	);

	const updatedDraft = await updateNoteDraftInDatabase(deps.db, params.draftId, {
		fileIds: params.fileIds,
		pollChoices: params.poll?.choices,
		pollMultiple: params.poll?.multiple,
		pollExpiresAt,
		pollExpiredAfter: params.poll?.expiredAfter,
		text: params.text,
		replyId: params.replyId,
		renoteId: params.renoteId,
		cw: params.cw,
		hashtag: params.hashtag,
		localOnly: params.localOnly,
		reactionAcceptance: params.reactionAcceptance as MiNote['reactionAcceptance'] | undefined,
		visibility: params.visibility,
		visibleUserIds: params.visibleUserIds,
		channelId: params.channelId,
		scheduledAt,
		isActuallyScheduled,
	});

	await clearNoteDraftSchedule(deps, existing);
	if (updatedDraft.scheduledAt != null && updatedDraft.isActuallyScheduled) {
		await scheduleNoteDraft(deps, updatedDraft);
	}

	return { updatedDraft: await packNoteDraftForApi(deps, updatedDraft, me) };
}

export async function handleApiNotesDraftsDelete(
	deps: ApiNoteDraftDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(notesDraftsDeleteParamDef, body);
	const draft = await fetchNoteDraftByIdAndUserIdFromDatabase(deps.db, params.draftId, me.id);
	if (draft == null) throw draftNoSuchNoteDraftError();

	await deleteNoteDraftByIdFromDatabase(deps.db, draft.id);
	await clearNoteDraftSchedule(deps, draft);
}

export async function handleApiNotesDraftsList(
	deps: ApiNoteDraftDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'NoteDraft'>[]> {
	const params = parseApiParams(notesDraftsListParamDef, body);
	const pagination = resolveNoteDraftPagination({ gen: (time) => genId(time) }, params);

	const drafts = await listNoteDraftsByUserIdFromDatabase(
		deps.db,
		me.id,
		omitUndefined({
			limit: params.limit,
			scheduled: params.scheduled,
			...pagination,
		}),
	);

	return await packNoteDraftManyForApi(deps, drafts, me);
}
