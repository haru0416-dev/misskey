/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { endpointMetas as notesContracts } from '@/server/api/metas/notes.js';
import type { ContractErrors } from '../endpoint-contract.js';
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
import { parseApiParams } from '../validation.js';
import type { ApiParams } from '../validation.js';
import { packNoteForApi } from './note.js';

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
	errors: ContractErrors<(typeof notesContracts)['notes/create']>,
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
			throw errors.postProcessingUnavailable();
		}
		// id が契約と一致する IdentifiableError は登録側が宣言どおりに変換する。ここでは id が異なる 2 件だけを対応づける。
		if (err instanceof IdentifiableError) {
			if (err.id === '689ee33f-f97c-479a-ac49-1b9f8140af99') throw errors.containsProhibitedWords();
			if (err.id === '9f466dab-c856-48cd-9e65-ff90ff750580') throw errors.containsTooManyMentions();
		}
		throw err;
	}
}
