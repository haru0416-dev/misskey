/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { endpointMetas as notesContracts } from '@/server/api/metas/notes.js';
import type { ContractErrors } from '../endpoint-contract.js';
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
import type { ApiError } from '../error.js';
import { isVisibleForMeForApi, packNoteForApi, packNoteManyForApi } from './note.js';
import type { ApiNoteDependencies } from './note.js';
import { packDriveFileManyByIdsForApi, packDriveFileManyForApi } from '../drive/drive-file.js';
import { getApiRolePolicies } from '../role/role-policy.js';
import type { ApiRolePolicyDependencies } from '../role/role-policy.js';
import { packUserLiteForApi, packUserLiteManyForApi } from '../user/user.js';
import { parseApiParams } from '../validation.js';
import type { ApiParams } from '../validation.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';

export type ApiNoteDraftDependencies = ApiNoteDependencies &
	ApiRolePolicyDependencies & {
		postScheduledNoteQueue: PostScheduledNoteQueue;
	};

export const countNoteDraftsParamDef = z.object({});

export async function handleApiNotesDraftsCount(deps: ApiNoteDraftDependencies, me: MiLocalUser): Promise<number> {
	return await countNoteDraftsByUserIdFromDatabase(deps.db, me.id);
}

const notePollParamDef = z
	.object({
		choices: uniqueItems(z.array(z.string().min(1).max(50)).min(0).max(10)),
		multiple: z.boolean().optional(),
		expiresAt: z.int().nullable().optional(),
		expiredAfter: z.int().min(1).nullable().optional(),
	})
	.nullable();

const noteDraftReactionAcceptanceParamDef = z.union([
	z.enum(['likeOnly', 'likeOnlyForRemote', 'nonSensitiveOnly', 'nonSensitiveOnlyForLocalLikeOnlyForRemote']),
	z.null(),
]);

export const notesDraftsCreateParamDef = z.object({
	visibility: z.enum(['public', 'home', 'followers', 'specified']).default('public'),
	visibleUserIds: uniqueItems(z.array(misskeyId())).optional(),
	cw: z.string().min(1).max(100).nullable().optional(),
	hashtag: z.string().max(200).nullable().optional(),
	localOnly: z.boolean().default(false),
	reactionAcceptance: noteDraftReactionAcceptanceParamDef.default(null),
	replyId: misskeyId().nullable().optional(),
	renoteId: misskeyId().nullable().optional(),
	channelId: misskeyId().nullable().optional(),
	text: z.string().min(0).max(MAX_NOTE_TEXT_LENGTH).nullable().optional(),
	fileIds: uniqueItems(z.array(misskeyId()).min(0).max(16)).optional(),
	poll: notePollParamDef.optional(),
	scheduledAt: z.int().nullable().optional(),
	isActuallyScheduled: z.boolean().default(false),
});

export const notesDraftsUpdateParamDef = z.object({
	draftId: misskeyId(),
	visibility: z.enum(['public', 'home', 'followers', 'specified']).optional(),
	visibleUserIds: uniqueItems(z.array(misskeyId())).optional(),
	cw: z.string().min(1).max(100).nullable().optional(),
	hashtag: z.string().max(200).nullable().optional(),
	localOnly: z.boolean().optional(),
	reactionAcceptance: noteDraftReactionAcceptanceParamDef.optional(),
	replyId: misskeyId().nullable().optional(),
	renoteId: misskeyId().nullable().optional(),
	channelId: misskeyId().nullable().optional(),
	text: z.string().min(0).max(MAX_NOTE_TEXT_LENGTH).nullable().optional(),
	fileIds: uniqueItems(z.array(misskeyId()).min(0).max(16)).optional(),
	poll: notePollParamDef.optional(),
	scheduledAt: z.int().nullable().optional(),
	isActuallyScheduled: z.boolean().optional(),
});

export const notesDraftsDeleteParamDef = z.object({
	draftId: misskeyId(),
});

export const notesDraftsListParamDef = z.object({
	limit: z.int().min(1).max(100).default(30),
	...paginationParams,
	scheduled: z.boolean().nullable().optional(),
});

// create と update は公開済みの id・code が一部異なるので、各エンドポイントが自分の契約のエラーから組み立てて渡す。
type DraftValidationErrorMap = {
	scheduledAtRequired: () => ApiError;
	scheduledAtMustBeInFuture: () => ApiError;
	cannotCreateAlreadyExpiredPoll: () => ApiError;
	noSuchFile: () => ApiError;
	noSuchRenoteTarget: () => ApiError;
	cannotReRenote: () => ApiError;
	youHaveBeenBlocked: () => ApiError;
	cannotRenoteDueToVisibility: () => ApiError;
	noSuchChannel: () => ApiError;
	cannotRenoteToExternal: () => ApiError;
	noSuchReplyTarget: () => ApiError;
	cannotReplyToPureRenote: () => ApiError;
	cannotReplyToInvisibleNote: () => ApiError;
	cannotReplyToSpecifiedVisibilityNoteWithExtendedVisibility: () => ApiError;
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
		if (data.scheduledAt == null) {
			throw errors.scheduledAtRequired();
		}
		if (data.scheduledAt.getTime() < Date.now()) {
			throw errors.scheduledAtMustBeInFuture();
		}
	}

	if (data.pollExpiresAt != null && data.pollExpiresAt.getTime() < Date.now()) {
		throw errors.cannotCreateAlreadyExpiredPoll();
	}

	if (data.visibleUserIds != null && data.visibleUserIds.length > 0) {
		await listUsersByIdsFromDatabase(deps.db, data.visibleUserIds, { includeSuspended: true });
	}

	if (data.fileIds != null && data.fileIds.length > 0) {
		const files = await listDriveFilesByIdsAndUserIdPreservingOrderFromDatabase(deps.db, data.fileIds, me.id);
		if (files.length !== data.fileIds.length) {
			throw errors.noSuchFile();
		}
	}

	if (data.renoteId != null) {
		const renote = await fetchNoteByIdFromDatabase(deps.db, data.renoteId);
		if (renote == null) {
			throw errors.noSuchRenoteTarget();
		}
		if (isRenote(renote) && !isQuote(renote)) {
			throw errors.cannotReRenote();
		}

		if (renote.userId !== me.id) {
			const blockExist = await blockingExistsInDatabase(deps.db, renote.userId, me.id);
			if (blockExist) {
				throw errors.youHaveBeenBlocked();
			}
		}

		if (renote.visibility === 'followers' && renote.userId !== me.id) {
			throw errors.cannotRenoteDueToVisibility();
		}
		if (renote.visibility === 'specified') {
			throw errors.cannotRenoteDueToVisibility();
		}

		if (renote.channelId && renote.channelId !== data.channelId) {
			const renoteChannel = await fetchChannelByIdFromDatabase(deps.db, renote.channelId);
			if (renoteChannel == null) {
				throw errors.noSuchChannel();
			}
			if (!renoteChannel.allowRenoteToExternal) {
				throw errors.cannotRenoteToExternal();
			}
		}
	}

	if (data.replyId != null) {
		const reply = await fetchNoteByIdFromDatabase(deps.db, data.replyId);
		if (reply == null) {
			throw errors.noSuchReplyTarget();
		}
		if (isRenote(reply) && !isQuote(reply)) {
			throw errors.cannotReplyToPureRenote();
		}
		if (!(await isVisibleForMeForApi(deps, reply, me.id))) {
			throw errors.cannotReplyToInvisibleNote();
		}
		if (reply.visibility === 'specified' && data.visibility !== 'specified') {
			throw errors.cannotReplyToSpecifiedVisibilityNoteWithExtendedVisibility();
		}

		if (reply.userId !== me.id) {
			const blockExist = await blockingExistsInDatabase(deps.db, reply.userId, me.id);
			if (blockExist) {
				throw errors.youHaveBeenBlocked();
			}
		}
	}

	if (data.channelId != null) {
		const channel = await fetchChannelByIdFromDatabase(deps.db, data.channelId);
		if (channel == null || channel.isArchived) {
			throw errors.noSuchChannel();
		}
	}
}

async function scheduleNoteDraft(deps: ApiNoteDraftDependencies, draft: MiNoteDraft): Promise<void> {
	if (!draft.isActuallyScheduled) {
		return;
	}
	if (draft.scheduledAt == null) {
		return;
	}
	if (draft.scheduledAt.getTime() <= Date.now()) {
		return;
	}

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
		if (job != null && !(await job.isActive())) {
			await job.remove();
		}
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
			if (isEntityNotFoundError(err)) {
				return null;
			}
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
	if (drafts.length === 0) {
		return [];
	}

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
	params: ApiParams<typeof notesDraftsCreateParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/drafts/create']>,
): Promise<{ createdDraft: Packed<'NoteDraft'> }> {
	const policies = await getApiRolePolicies(deps, me);
	const currentCount = await countNoteDraftsByUserIdFromDatabase(deps.db, me.id);
	if (currentCount >= policies.noteDraftLimit) {
		throw errors.tooManyDrafts();
	}

	if (params.isActuallyScheduled) {
		const currentScheduledCount = await countNoteDraftsByUserIdFromDatabase(deps.db, me.id, {
			isActuallyScheduled: true,
		});
		if (currentScheduledCount >= policies.scheduledNoteLimit) {
			throw errors.tooManyScheduledNotes();
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
			scheduledAtRequired: errors.scheduledAtRequired,
			scheduledAtMustBeInFuture: errors.scheduledAtMustBeInFuture,
			cannotCreateAlreadyExpiredPoll: errors.cannotCreateAlreadyExpiredPoll,
			noSuchFile: errors.noSuchFile,
			noSuchRenoteTarget: errors.noSuchRenoteTarget,
			cannotReRenote: errors.cannotReRenote,
			youHaveBeenBlocked: errors.youHaveBeenBlocked,
			cannotRenoteDueToVisibility: errors.cannotRenoteDueToVisibility,
			noSuchChannel: errors.noSuchChannel,
			cannotRenoteToExternal: errors.cannotRenoteToExternal,
			noSuchReplyTarget: errors.noSuchReplyTarget,
			cannotReplyToPureRenote: errors.cannotReplyToPureRenote,
			cannotReplyToInvisibleNote: errors.cannotReplyToInvisibleNote,
			cannotReplyToSpecifiedVisibilityNoteWithExtendedVisibility:
				errors.cannotReplyToSpecifiedVisibilityNoteWithExtendedVisibility,
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
	params: ApiParams<typeof notesDraftsUpdateParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/drafts/update']>,
): Promise<{ updatedDraft: Packed<'NoteDraft'> }> {
	const existing = await fetchNoteDraftByIdAndUserIdFromDatabase(deps.db, params.draftId, me.id);
	if (existing == null) {
		throw errors.noSuchNoteDraft();
	}

	const policies = await getApiRolePolicies(deps, me);
	if (!existing.isActuallyScheduled && params.isActuallyScheduled) {
		const currentScheduledCount = await countNoteDraftsByUserIdFromDatabase(deps.db, me.id, {
			isActuallyScheduled: true,
		});
		if (currentScheduledCount >= policies.scheduledNoteLimit) {
			throw errors.tooManyScheduledNotes();
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
			scheduledAtRequired: errors.scheduledAtRequired,
			scheduledAtMustBeInFuture: errors.scheduledAtMustBeInFuture,
			cannotCreateAlreadyExpiredPoll: errors.cannotCreateAlreadyExpiredPoll,
			noSuchFile: errors.noSuchFile,
			noSuchRenoteTarget: errors.noSuchRenote,
			cannotReRenote: errors.cannotRenote,
			youHaveBeenBlocked: errors.youHaveBeenBlocked,
			cannotRenoteDueToVisibility: errors.cannotRenoteDueToVisibility,
			noSuchChannel: errors.noSuchChannel,
			cannotRenoteToExternal: errors.cannotRenoteToExternal,
			noSuchReplyTarget: errors.noSuchReply,
			cannotReplyToPureRenote: errors.cannotReplyToPureRenote,
			cannotReplyToInvisibleNote: errors.cannotReplyToInvisibleNote,
			cannotReplyToSpecifiedVisibilityNoteWithExtendedVisibility:
				errors.cannotReplyToSpecifiedVisibilityNoteWithExtendedVisibility,
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
	params: ApiParams<typeof notesDraftsDeleteParamDef>,
	errors: ContractErrors<(typeof notesContracts)['notes/drafts/delete']>,
): Promise<void> {
	const draft = await fetchNoteDraftByIdAndUserIdFromDatabase(deps.db, params.draftId, me.id);
	if (draft == null) {
		throw errors.noSuchNoteDraft();
	}

	await deleteNoteDraftByIdFromDatabase(deps.db, draft.id);
	await clearNoteDraftSchedule(deps, draft);
}

export async function handleApiNotesDraftsList(
	deps: ApiNoteDraftDependencies,
	me: MiLocalUser,
	params: ApiParams<typeof notesDraftsListParamDef>,
): Promise<Packed<'NoteDraft'>[]> {
	const pagination = resolveDateIdPagination({ gen: genId }, params);

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
