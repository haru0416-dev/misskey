/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Packed } from '@/misc/json-schema.js';
import { z } from 'zod';
import { MAX_NOTE_TEXT_LENGTH } from '@/const.js';
import { fetchAndCreateNote } from '@/core/note/NoteCreationService.js';
import type { NoteCreationDependencies } from '@/core/note/NoteCreationService.js';
import type { NotePostProcessing } from '@/core/note/NotePostProcessing.js';
import { NotePostProcessingUnavailableError } from '@/core/note/NotePostProcessing.js';
import { omitUndefined } from '@/misc/clone.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { misskeyId, uniqueItems } from '@/misc/zod-params.js';
import type { MiUser } from '@/models/User.js';
import { ApiError } from '../error.js';
import { parseApiParams } from '../validation.js';
import type { ApiParams } from '../validation.js';
import { packNoteForApi } from './note.js';

function noSuchRenoteTargetError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such renote target.',
		code: 'NO_SUCH_RENOTE_TARGET',
		id: 'b5c90186-4ab0-49c8-9bba-a1f76c282ba4',
	});
}
function cannotReRenoteError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'You can not Renote a pure Renote.',
		code: 'CANNOT_RENOTE_TO_A_PURE_RENOTE',
		id: 'fd4cc33e-2a37-48dd-99cc-9b806eb2031a',
	});
}
function cannotRenoteDueToVisibilityError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'You can not Renote due to target visibility.',
		code: 'CANNOT_RENOTE_DUE_TO_VISIBILITY',
		id: 'be9529e9-fe72-4de0-ae43-0b363c4938af',
	});
}
function noSuchReplyTargetError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such reply target.',
		code: 'NO_SUCH_REPLY_TARGET',
		id: '749ee0f6-d3da-459a-bf02-282e2da4292c',
	});
}
function cannotReplyToInvisibleNoteError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'You cannot reply to an invisible Note.',
		code: 'CANNOT_REPLY_TO_AN_INVISIBLE_NOTE',
		id: 'b98980fa-3780-406c-a935-b6d0eeee10d1',
	});
}
function cannotReplyToPureRenoteError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'You can not reply to a pure Renote.',
		code: 'CANNOT_REPLY_TO_A_PURE_RENOTE',
		id: '3ac74a84-8fd5-4bb0-870f-01804f82ce15',
	});
}
function cannotReplyToSpecifiedVisibilityNoteWithExtendedVisibilityError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'You cannot reply to a specified visibility note with extended visibility.',
		code: 'CANNOT_REPLY_TO_SPECIFIED_VISIBILITY_NOTE_WITH_EXTENDED_VISIBILITY',
		id: 'ed940410-535c-4d5e-bfa3-af798671e93c',
	});
}
function cannotCreateAlreadyExpiredPollError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Poll is already expired.',
		code: 'CANNOT_CREATE_ALREADY_EXPIRED_POLL',
		id: '04da457d-b083-4055-9082-955525eda5a5',
	});
}
function noSuchChannelError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such channel.',
		code: 'NO_SUCH_CHANNEL',
		id: 'b1653923-5453-4edc-b786-7c4f39bb0bbb',
	});
}
function youHaveBeenBlockedError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'You have been blocked by this user.',
		code: 'YOU_HAVE_BEEN_BLOCKED',
		id: 'b390d7e1-8a5e-46ed-b625-06271cafd3d3',
	});
}
function noSuchFileError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Some files are not found.',
		code: 'NO_SUCH_FILE',
		id: 'b6992544-63e7-67f0-fa7f-32444b1b5306',
	});
}
function cannotRenoteOutsideOfChannelError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Cannot renote outside of channel.',
		code: 'CANNOT_RENOTE_OUTSIDE_OF_CHANNEL',
		id: '33510210-8452-094c-6227-4a6c05d99f00',
	});
}
function containsProhibitedWordsError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Cannot post because it contains prohibited words.',
		code: 'CONTAINS_PROHIBITED_WORDS',
		id: 'aa6e01d3-a85c-669d-758a-76aab43af334',
	});
}
function containsTooManyMentionsError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Cannot post because it exceeds the allowed number of mentions.',
		code: 'CONTAINS_TOO_MANY_MENTIONS',
		id: '4de0363a-3046-481b-9b0f-feff3e211025',
	});
}

/**
 * renoteId/fileIds/mediaIds/poll がすべて null または未指定の場合だけ、空白でない text を必須にする。
 */
export const notesCreateParamDef = z
	.object({
		visibility: z.enum(['public', 'home', 'followers', 'specified']).default('public'),
		visibleUserIds: uniqueItems(z.array(misskeyId())).optional(),
		cw: z.string().min(1).max(100).nullable().optional(),
		localOnly: z.boolean().default(false),
		reactionAcceptance: z
			.union([
				z.enum(['likeOnly', 'likeOnlyForRemote', 'nonSensitiveOnly', 'nonSensitiveOnlyForLocalLikeOnlyForRemote']),
				z.null(),
			])
			.default(null),
		noExtractMentions: z.boolean().default(false),
		noExtractHashtags: z.boolean().default(false),
		noExtractEmojis: z.boolean().default(false),
		replyId: misskeyId().nullable().optional(),
		renoteId: misskeyId().nullable().optional(),
		channelId: misskeyId().nullable().optional(),
		text: z.string().min(1).max(MAX_NOTE_TEXT_LENGTH).nullable().optional(),
		fileIds: uniqueItems(z.array(misskeyId()).min(1).max(16)).optional(),
		mediaIds: uniqueItems(z.array(misskeyId()).min(1).max(16)).optional(),
		poll: z
			.object({
				choices: uniqueItems(z.array(z.string().min(1).max(50)).min(2).max(10)),
				multiple: z.boolean().optional(),
				expiresAt: z.int().nullable().optional(),
				expiredAfter: z.int().min(1).nullable().optional(),
			})
			.nullable()
			.optional(),
	})
	.superRefine((data, ctx) => {
		const noAttachment = data.renoteId == null && data.fileIds == null && data.mediaIds == null && data.poll == null;
		if (noAttachment && (data.text == null || !/[^\s]+/.test(data.text))) {
			ctx.addIssue({ code: 'custom', path: ['text'], message: "must have required property 'text'" });
		}
	});

export async function handleApiNotesCreate(
	deps: NoteCreationDependencies & { notePostProcessing: NotePostProcessing },
	me: { id: MiUser['id']; username: string; host: MiUser['host']; isBot: boolean },
	ps: ApiParams<typeof notesCreateParamDef>,
	signal?: AbortSignal,
): Promise<{ createdNote: Packed<'Note'> }> {
	try {
		return await deps.notePostProcessing.runProducer(async (reservation) => {
			const note = await fetchAndCreateNote(
				deps,
				me,
				omitUndefined({
					createdAt: new Date(),
					fileIds: ps.fileIds ?? ps.mediaIds ?? [],
					poll: ps.poll
						? {
								choices: ps.poll.choices,
								multiple: ps.poll.multiple ?? false,
								expiresAt: ps.poll.expiredAfter
									? new Date(Date.now() + ps.poll.expiredAfter)
									: ps.poll.expiresAt
										? new Date(ps.poll.expiresAt)
										: null,
							}
						: null,
					text: ps.text ?? null,
					replyId: ps.replyId ?? null,
					renoteId: ps.renoteId ?? null,
					cw: ps.cw ?? null,
					localOnly: ps.localOnly,
					reactionAcceptance: ps.reactionAcceptance,
					visibility: ps.visibility,
					visibleUserIds: ps.visibleUserIds ?? [],
					channelId: ps.channelId ?? null,
					apMentions: ps.noExtractMentions ? [] : undefined,
					apHashtags: ps.noExtractHashtags ? [] : undefined,
					apEmojis: ps.noExtractEmojis ? [] : undefined,
				}),
				undefined,
				omitUndefined({ reservation, signal }),
			);

			return { createdNote: await packNoteForApi(deps, note, me) };
		}, signal);
	} catch (err) {
		if (err instanceof NotePostProcessingUnavailableError) {
			throw new ApiError({
				status: 503,
				message: 'Post processing is temporarily unavailable. No note was created.',
				code: 'POST_PROCESSING_UNAVAILABLE',
				id: '12c03e69-0e54-4b4a-971f-24633604a7f9',
				kind: 'server',
			});
		}
		if (err instanceof ApiError) {
			throw err;
		}
		if (err instanceof IdentifiableError) {
			switch (err.id) {
				case 'b5c90186-4ab0-49c8-9bba-a1f76c282ba4':
					throw noSuchRenoteTargetError();
				case 'fd4cc33e-2a37-48dd-99cc-9b806eb2031a':
					throw cannotReRenoteError();
				case 'be9529e9-fe72-4de0-ae43-0b363c4938af':
					throw cannotRenoteDueToVisibilityError();
				case '749ee0f6-d3da-459a-bf02-282e2da4292c':
					throw noSuchReplyTargetError();
				case 'b98980fa-3780-406c-a935-b6d0eeee10d1':
					throw cannotReplyToInvisibleNoteError();
				case '3ac74a84-8fd5-4bb0-870f-01804f82ce15':
					throw cannotReplyToPureRenoteError();
				case 'ed940410-535c-4d5e-bfa3-af798671e93c':
					throw cannotReplyToSpecifiedVisibilityNoteWithExtendedVisibilityError();
				case '04da457d-b083-4055-9082-955525eda5a5':
					throw cannotCreateAlreadyExpiredPollError();
				case 'b1653923-5453-4edc-b786-7c4f39bb0bbb':
					throw noSuchChannelError();
				case 'b390d7e1-8a5e-46ed-b625-06271cafd3d3':
					throw youHaveBeenBlockedError();
				case 'b6992544-63e7-67f0-fa7f-32444b1b5306':
					throw noSuchFileError();
				case '33510210-8452-094c-6227-4a6c05d99f00':
					throw cannotRenoteOutsideOfChannelError();
				case '689ee33f-f97c-479a-ac49-1b9f8140af99':
					throw containsProhibitedWordsError();
				case '9f466dab-c856-48cd-9e65-ff90ff750580':
					throw containsTooManyMentionsError();
			}
		}
		throw err;
	}
}
