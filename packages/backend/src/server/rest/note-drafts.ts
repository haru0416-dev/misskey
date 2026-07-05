/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { blockingExistsInDatabase } from '@/core/BlockingStore.js';
import { fetchChannelByIdFromDatabase } from '@/core/ChannelStore.js';
import { listDriveFilesByIdsAndUserIdPreservingOrderFromDatabase } from '@/core/DriveFileStore.js';
import {
	countNoteDraftsByUserIdFromDatabase,
	createNoteDraftInDatabase,
	deleteNoteDraftByIdFromDatabase,
	fetchNoteDraftByIdAndUserIdFromDatabase,
	listNoteDraftsByUserIdFromDatabase,
	resolveNoteDraftPagination,
	updateNoteDraftInDatabase,
} from '@/core/NoteDraftStore.js';
import { fetchNoteByIdFromDatabase } from '@/core/NoteStore.js';
import type { PostScheduledNoteQueue } from '@/core/QueueModule.js';
import { listUsersByIdsFromDatabase } from '@/core/UserStore.js';
import { isEntityNotFoundError } from '@/misc/db-errors.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { isQuote, isRenote } from '@/misc/is-renote.js';
import type { Packed } from '@/misc/json-schema.js';
import { MAX_NOTE_TEXT_LENGTH } from '@/const.js';
import type { MiNote } from '@/models/Note.js';
import type { MiNoteDraft } from '@/models/NoteDraft.js';
import type { MiLocalUser } from '@/models/User.js';
import { HonoApiError } from './error.js';
import { isVisibleForMeForHonoApi, packNoteForHonoApi, type HonoApiNoteDependencies } from './note.js';
import { packDriveFileManyByIdsForHonoApi } from './drive-file.js';
import { getHonoApiRolePolicies, type HonoApiRolePolicyDependencies } from './role-policy.js';
import { packUserLiteForHonoApi } from './user.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiNoteDraftDependencies = HonoApiNoteDependencies & HonoApiRolePolicyDependencies & {
	postScheduledNoteQueue: PostScheduledNoteQueue;
};

const countNoteDraftsParamDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

export async function handleHonoApiNotesDraftsCount(
	deps: HonoApiNoteDraftDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<number> {
	parseHonoApiParams(countNoteDraftsParamDef, body);
	return await countNoteDraftsByUserIdFromDatabase(deps.db, me.id);
}

const notePollParamDef = {
	type: 'object',
	nullable: true,
	properties: {
		choices: {
			type: 'array',
			uniqueItems: true,
			minItems: 0,
			maxItems: 10,
			items: { type: 'string', minLength: 1, maxLength: 50 },
		},
		multiple: { type: 'boolean' },
		expiresAt: { type: 'integer', nullable: true },
		expiredAfter: { type: 'integer', nullable: true, minimum: 1 },
	},
	required: ['choices'],
} as const;

const notesDraftsCreateParamDef = {
	type: 'object',
	properties: {
		visibility: { type: 'string', enum: ['public', 'home', 'followers', 'specified'], default: 'public' },
		visibleUserIds: { type: 'array', uniqueItems: true, items: { type: 'string', format: 'misskey:id' } },
		cw: { type: 'string', nullable: true, minLength: 1, maxLength: 100 },
		hashtag: { type: 'string', nullable: true, maxLength: 200 },
		localOnly: { type: 'boolean', default: false },
		reactionAcceptance: { type: 'string', nullable: true, enum: [null, 'likeOnly', 'likeOnlyForRemote', 'nonSensitiveOnly', 'nonSensitiveOnlyForLocalLikeOnlyForRemote'], default: null },
		replyId: { type: 'string', format: 'misskey:id', nullable: true },
		renoteId: { type: 'string', format: 'misskey:id', nullable: true },
		channelId: { type: 'string', format: 'misskey:id', nullable: true },
		text: { type: 'string', minLength: 0, maxLength: MAX_NOTE_TEXT_LENGTH, nullable: true },
		fileIds: { type: 'array', uniqueItems: true, minItems: 0, maxItems: 16, items: { type: 'string', format: 'misskey:id' } },
		poll: notePollParamDef,
		scheduledAt: { type: 'integer', nullable: true },
		isActuallyScheduled: { type: 'boolean', default: false },
	},
	required: [],
} as const;

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

const notesDraftsUpdateParamDef = {
	type: 'object',
	properties: {
		draftId: { type: 'string', nullable: false, format: 'misskey:id' },
		visibility: { type: 'string', enum: ['public', 'home', 'followers', 'specified'] },
		visibleUserIds: { type: 'array', uniqueItems: true, items: { type: 'string', format: 'misskey:id' } },
		cw: { type: 'string', nullable: true, minLength: 1, maxLength: 100 },
		hashtag: { type: 'string', nullable: true, maxLength: 200 },
		localOnly: { type: 'boolean' },
		reactionAcceptance: { type: 'string', nullable: true, enum: [null, 'likeOnly', 'likeOnlyForRemote', 'nonSensitiveOnly', 'nonSensitiveOnlyForLocalLikeOnlyForRemote'] },
		replyId: { type: 'string', format: 'misskey:id', nullable: true },
		renoteId: { type: 'string', format: 'misskey:id', nullable: true },
		channelId: { type: 'string', format: 'misskey:id', nullable: true },
		text: { type: 'string', minLength: 0, maxLength: MAX_NOTE_TEXT_LENGTH, nullable: true },
		fileIds: { type: 'array', uniqueItems: true, minItems: 0, maxItems: 16, items: { type: 'string', format: 'misskey:id' } },
		poll: notePollParamDef,
		scheduledAt: { type: 'integer', nullable: true },
		isActuallyScheduled: { type: 'boolean' },
	},
	required: ['draftId'],
} as const;

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

const notesDraftsDeleteParamDef = {
	type: 'object',
	properties: {
		draftId: { type: 'string', nullable: false, format: 'misskey:id' },
	},
	required: ['draftId'],
} as const;

type NotesDraftsDeleteParams = {
	draftId: string;
};

const notesDraftsListParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		scheduled: { type: 'boolean', nullable: true },
	},
	required: [],
} as const;

type NotesDraftsListParams = {
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
	scheduled?: boolean | null;
};

function draftNoSuchNoteDraftError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such note draft.', code: 'NO_SUCH_NOTE_DRAFT', id: '49cd6b9d-848e-41ee-b0b9-adaca711a6b1' });
}

function draftAccessDeniedError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Access denied.', code: 'ACCESS_DENIED', id: '56f35758-7dd5-468b-8439-5d6fb8ec9b8e' });
}

type DraftValidationErrorMap = {
	scheduledAtRequired: HonoApiError;
	scheduledAtMustBeInFuture: HonoApiError;
	cannotCreateAlreadyExpiredPoll: HonoApiError;
	noSuchFile: HonoApiError;
	noSuchRenoteTarget: HonoApiError;
	cannotReRenote: HonoApiError;
	youHaveBeenBlocked: HonoApiError;
	cannotRenoteDueToVisibility: HonoApiError;
	noSuchChannel: HonoApiError;
	cannotRenoteToExternal: HonoApiError;
	noSuchReplyTarget: HonoApiError;
	cannotReplyToPureRenote: HonoApiError;
	cannotReplyToInvisibleNote: HonoApiError;
	cannotReplyToSpecifiedVisibilityNoteWithExtendedVisibility: HonoApiError;
};

async function validateNoteDraft(
	deps: HonoApiNoteDraftDependencies,
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
		if (!await isVisibleForMeForHonoApi(deps, reply, me.id)) throw errors.cannotReplyToInvisibleNote;
		if (reply.visibility === 'specified' && data.visibility !== 'specified') throw errors.cannotReplyToSpecifiedVisibilityNoteWithExtendedVisibility;

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

function scheduleNoteDraft(deps: HonoApiNoteDraftDependencies, draft: MiNoteDraft): void {
	if (!draft.isActuallyScheduled) return;
	if (draft.scheduledAt == null) return;
	if (draft.scheduledAt.getTime() <= Date.now()) return;

	const delay = draft.scheduledAt.getTime() - Date.now();
	deps.postScheduledNoteQueue.add(draft.id, {
		noteDraftId: draft.id,
	}, {
		delay,
		removeOnComplete: {
			age: 3600 * 24 * 7,
			count: 30,
		},
		removeOnFail: {
			age: 3600 * 24 * 7,
			count: 100,
		},
	});
}

async function clearNoteDraftSchedule(deps: HonoApiNoteDraftDependencies, draftId: string): Promise<void> {
	const jobs = await deps.postScheduledNoteQueue.getJobs(['delayed', 'waiting', 'active']);
	for (const job of jobs) {
		if (job.data.noteDraftId === draftId) {
			await job.remove();
		}
	}
}

async function packNoteDraftForHonoApi(
	deps: HonoApiNoteDraftDependencies,
	draft: MiNoteDraft,
	me: { id: string } | null | undefined,
): Promise<Packed<'NoteDraft'>> {
	const channel = draft.channelId ? await fetchChannelByIdFromDatabase(deps.db, draft.channelId) : null;

	async function nullIfEntityNotFound<T>(promise: Promise<T>): Promise<T | null> {
		try {
			return await promise;
		} catch (err) {
			if (isEntityNotFoundError(err)) return null;
			throw err;
		}
	}

	const [user, files, reply, renote] = await Promise.all([
		packUserLiteForHonoApi(deps, draft.userId),
		packDriveFileManyByIdsForHonoApi(deps, draft.fileIds),
		draft.replyId ? nullIfEntityNotFound(packNoteForHonoApi(deps, draft.replyId, me, { detail: false })) : Promise.resolve(undefined),
		draft.renoteId ? nullIfEntityNotFound(packNoteForHonoApi(deps, draft.renoteId, me, { detail: true })) : Promise.resolve(undefined),
	]);

	return {
		id: draft.id,
		createdAt: parseId(deps.config, draft.id).date.toISOString(),
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
		channel: channel ? {
			id: channel.id,
			name: channel.name,
			color: channel.color,
			isSensitive: channel.isSensitive,
			allowRenoteToExternal: channel.allowRenoteToExternal,
			userId: channel.userId,
		} : undefined,
		poll: draft.hasPoll ? {
			choices: draft.pollChoices,
			multiple: draft.pollMultiple,
			expiresAt: draft.pollExpiresAt?.toISOString(),
			expiredAfter: draft.pollExpiredAfter,
		} : null,
		reply: draft.replyId ? reply : undefined,
		renote: draft.renoteId ? renote : undefined,
	} satisfies Packed<'NoteDraft'>;
}

export async function handleHonoApiNotesDraftsCreate(
	deps: HonoApiNoteDraftDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ createdDraft: Packed<'NoteDraft'> }> {
	const params = parseHonoApiParams(notesDraftsCreateParamDef, body);

	const policies = await getHonoApiRolePolicies(deps, me);
	const currentCount = await countNoteDraftsByUserIdFromDatabase(deps.db, me.id);
	if (currentCount >= policies.noteDraftLimit) {
		throw new HonoApiError({ status: 400, message: 'You cannot create drafts any more.', code: 'TOO_MANY_DRAFTS', id: '9ee33bbe-fde3-4c71-9b51-e50492c6b9c8' });
	}

	if (params.isActuallyScheduled) {
		const currentScheduledCount = await countNoteDraftsByUserIdFromDatabase(deps.db, me.id, { isActuallyScheduled: true });
		if (currentScheduledCount >= policies.scheduledNoteLimit) {
			throw new HonoApiError({ status: 400, message: 'You cannot create scheduled notes any more.', code: 'TOO_MANY_SCHEDULED_NOTES', id: '22ae69eb-09e3-4541-a850-773cfa45e693' });
		}
	}

	const scheduledAt = params.scheduledAt ? new Date(params.scheduledAt) : null;
	const pollExpiresAt = params.poll?.expiresAt ? new Date(params.poll.expiresAt) : null;

	await validateNoteDraft(deps, me, {
		isActuallyScheduled: params.isActuallyScheduled,
		scheduledAt,
		pollExpiresAt,
		visibleUserIds: params.visibleUserIds,
		fileIds: params.fileIds,
		renoteId: params.renoteId,
		replyId: params.replyId,
		visibility: params.visibility,
		channelId: params.channelId,
	}, {
		scheduledAtRequired: new HonoApiError({ status: 400, message: 'scheduledAt is required when isActuallyScheduled is true.', code: 'SCHEDULED_AT_REQUIRED', id: '15e28a55-e74c-4d65-89b7-8880cdaaa87d' }),
		scheduledAtMustBeInFuture: new HonoApiError({ status: 400, message: 'scheduledAt must be in the future.', code: 'SCHEDULED_AT_MUST_BE_IN_FUTURE', id: 'e4bed6c9-017e-4934-aed0-01c22cc60ec1' }),
		cannotCreateAlreadyExpiredPoll: new HonoApiError({ status: 400, message: 'Poll is already expired.', code: 'CANNOT_CREATE_ALREADY_EXPIRED_POLL', id: '04da457d-b083-4055-9082-955525eda5a5' }),
		noSuchFile: new HonoApiError({ status: 400, message: 'Some files are not found.', code: 'NO_SUCH_FILE', id: 'b6992544-63e7-67f0-fa7f-32444b1b5306' }),
		noSuchRenoteTarget: new HonoApiError({ status: 400, message: 'No such renote target.', code: 'NO_SUCH_RENOTE_TARGET', id: 'b5c90186-4ab0-49c8-9bba-a1f76c282ba4' }),
		cannotReRenote: new HonoApiError({ status: 400, message: 'You can not Renote a pure Renote.', code: 'CANNOT_RENOTE_TO_A_PURE_RENOTE', id: 'fd4cc33e-2a37-48dd-99cc-9b806eb2031a' }),
		youHaveBeenBlocked: new HonoApiError({ status: 400, message: 'You have been blocked by this user.', code: 'YOU_HAVE_BEEN_BLOCKED', id: 'b390d7e1-8a5e-46ed-b625-06271cafd3d3' }),
		cannotRenoteDueToVisibility: new HonoApiError({ status: 400, message: 'You can not Renote due to target visibility.', code: 'CANNOT_RENOTE_DUE_TO_VISIBILITY', id: 'be9529e9-fe72-4de0-ae43-0b363c4938af' }),
		noSuchChannel: new HonoApiError({ status: 400, message: 'No such channel.', code: 'NO_SUCH_CHANNEL', id: 'b1653923-5453-4edc-b786-7c4f39bb0bbb' }),
		cannotRenoteToExternal: new HonoApiError({ status: 400, message: 'Cannot Renote to External.', code: 'CANNOT_RENOTE_TO_EXTERNAL', id: 'ed1952ac-2d26-4957-8b30-2deda76bedf7' }),
		noSuchReplyTarget: new HonoApiError({ status: 400, message: 'No such reply target.', code: 'NO_SUCH_REPLY_TARGET', id: '749ee0f6-d3da-459a-bf02-282e2da4292c' }),
		cannotReplyToPureRenote: new HonoApiError({ status: 400, message: 'You can not reply to a pure Renote.', code: 'CANNOT_REPLY_TO_A_PURE_RENOTE', id: '3ac74a84-8fd5-4bb0-870f-01804f82ce15' }),
		cannotReplyToInvisibleNote: new HonoApiError({ status: 400, message: 'You cannot reply to an invisible Note.', code: 'CANNOT_REPLY_TO_AN_INVISIBLE_NOTE', id: 'b98980fa-3780-406c-a935-b6d0eeee10d1' }),
		cannotReplyToSpecifiedVisibilityNoteWithExtendedVisibility: new HonoApiError({ status: 400, message: 'You cannot reply to a specified visibility note with extended visibility.', code: 'CANNOT_REPLY_TO_SPECIFIED_VISIBILITY_NOTE_WITH_EXTENDED_VISIBILITY', id: 'ed940410-535c-4d5e-bfa3-af798671e93c' }),
	});

	const draft = await createNoteDraftInDatabase(deps.db, {
		id: genId(deps.config),
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
		scheduleNoteDraft(deps, draft);
	}

	return { createdDraft: await packNoteDraftForHonoApi(deps, draft, me) };
}

export async function handleHonoApiNotesDraftsUpdate(
	deps: HonoApiNoteDraftDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ updatedDraft: Packed<'NoteDraft'> }> {
	const params = parseHonoApiParams(notesDraftsUpdateParamDef, body);

	const existing = await fetchNoteDraftByIdAndUserIdFromDatabase(deps.db, params.draftId, me.id);
	if (existing == null) throw draftNoSuchNoteDraftError();

	const policies = await getHonoApiRolePolicies(deps, me);
	if (!existing.isActuallyScheduled && params.isActuallyScheduled) {
		const currentScheduledCount = await countNoteDraftsByUserIdFromDatabase(deps.db, me.id, { isActuallyScheduled: true });
		if (currentScheduledCount >= policies.scheduledNoteLimit) {
			throw new HonoApiError({ status: 400, message: 'You cannot create scheduled notes any more.', code: 'TOO_MANY_SCHEDULED_NOTES', id: '02f5df79-08ae-4a33-8524-f1503c8f6212' });
		}
	}

	const scheduledAt = params.scheduledAt ? new Date(params.scheduledAt) : null;
	const pollExpiresAt = params.poll?.expiresAt ? new Date(params.poll.expiresAt) : null;

	await validateNoteDraft(deps, me, {
		isActuallyScheduled: params.isActuallyScheduled,
		scheduledAt,
		pollExpiresAt,
		visibleUserIds: params.visibleUserIds,
		fileIds: params.fileIds,
		renoteId: params.renoteId,
		replyId: params.replyId,
		visibility: params.visibility,
		channelId: params.channelId,
	}, {
		scheduledAtRequired: new HonoApiError({ status: 400, message: 'scheduledAt is required when isActuallyScheduled is true.', code: 'SCHEDULED_AT_REQUIRED', id: 'fe9737d5-cc41-498c-af9d-149207307530' }),
		scheduledAtMustBeInFuture: new HonoApiError({ status: 400, message: 'scheduledAt must be in the future.', code: 'SCHEDULED_AT_MUST_BE_IN_FUTURE', id: 'ed1a6673-d0d1-4364-aaae-9bf3f139cbc5' }),
		cannotCreateAlreadyExpiredPoll: new HonoApiError({ status: 400, message: 'Poll is already expired.', code: 'CANNOT_CREATE_ALREADY_EXPIRED_POLL', id: '04da457d-b083-4055-9082-955525eda5a5' }),
		noSuchFile: new HonoApiError({ status: 400, message: 'Some files are not found.', code: 'NO_SUCH_FILE', id: 'b6992544-63e7-67f0-fa7f-32444b1b5306' }),
		noSuchRenoteTarget: new HonoApiError({ status: 400, message: 'No such renote.', code: 'NO_SUCH_RENOTE', id: '64929870-2540-4d11-af41-3b484d78c956' }),
		cannotReRenote: new HonoApiError({ status: 400, message: 'Cannot renote.', code: 'CANNOT_RENOTE', id: '76cc5583-5a14-4ad3-8717-0298507e32db' }),
		youHaveBeenBlocked: new HonoApiError({ status: 400, message: 'You have been blocked by this user.', code: 'YOU_HAVE_BEEN_BLOCKED', id: 'b390d7e1-8a5e-46ed-b625-06271cafd3d3' }),
		cannotRenoteDueToVisibility: new HonoApiError({ status: 400, message: 'You can not Renote due to target visibility.', code: 'CANNOT_RENOTE_DUE_TO_VISIBILITY', id: 'be9529e9-fe72-4de0-ae43-0b363c4938af' }),
		noSuchChannel: new HonoApiError({ status: 400, message: 'No such channel.', code: 'NO_SUCH_CHANNEL', id: 'b1653923-5453-4edc-b786-7c4f39bb0bbb' }),
		cannotRenoteToExternal: new HonoApiError({ status: 400, message: 'Cannot Renote to External.', code: 'CANNOT_RENOTE_TO_EXTERNAL', id: 'ed1952ac-2d26-4957-8b30-2deda76bedf7' }),
		noSuchReplyTarget: new HonoApiError({ status: 400, message: 'No such reply.', code: 'NO_SUCH_REPLY', id: 'c4721841-22fc-4bb7-ad3d-897ef1d375b5' }),
		cannotReplyToPureRenote: new HonoApiError({ status: 400, message: 'You can not reply to a pure Renote.', code: 'CANNOT_REPLY_TO_A_PURE_RENOTE', id: '3ac74a84-8fd5-4bb0-870f-01804f82ce15' }),
		cannotReplyToInvisibleNote: new HonoApiError({ status: 400, message: 'You cannot reply to an invisible Note.', code: 'CANNOT_REPLY_TO_AN_INVISIBLE_NOTE', id: 'b98980fa-3780-406c-a935-b6d0eeee10d1' }),
		cannotReplyToSpecifiedVisibilityNoteWithExtendedVisibility: new HonoApiError({ status: 400, message: 'You cannot reply to a specified visibility note with extended visibility.', code: 'CANNOT_REPLY_TO_SPECIFIED_NOTE_WITH_EXTENDED_VISIBILITY', id: '215dbc76-336c-4d2a-9605-95766ba7dab0' }),
	});

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
		isActuallyScheduled: params.isActuallyScheduled,
	});

	await clearNoteDraftSchedule(deps, params.draftId);
	if (updatedDraft.scheduledAt != null && updatedDraft.isActuallyScheduled) {
		scheduleNoteDraft(deps, updatedDraft);
	}

	return { updatedDraft: await packNoteDraftForHonoApi(deps, updatedDraft, me) };
}

export async function handleHonoApiNotesDraftsDelete(
	deps: HonoApiNoteDraftDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(notesDraftsDeleteParamDef, body);
	const draft = await fetchNoteDraftByIdAndUserIdFromDatabase(deps.db, params.draftId, me.id);
	if (draft == null) throw draftNoSuchNoteDraftError();
	if (draft.userId !== me.id) throw draftAccessDeniedError();

	await deleteNoteDraftByIdFromDatabase(deps.db, draft.id);
	await clearNoteDraftSchedule(deps, params.draftId);
}

export async function handleHonoApiNotesDraftsList(
	deps: HonoApiNoteDraftDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'NoteDraft'>[]> {
	const params = parseHonoApiParams(notesDraftsListParamDef, body);
	const pagination = resolveNoteDraftPagination({ gen: (time) => genId(deps.config, time) }, params);

	const drafts = await listNoteDraftsByUserIdFromDatabase(deps.db, me.id, {
		limit: params.limit,
		scheduled: params.scheduled,
		...pagination,
	});

	return await Promise.all(drafts.map(draft => packNoteDraftForHonoApi(deps, draft, me)));
}
