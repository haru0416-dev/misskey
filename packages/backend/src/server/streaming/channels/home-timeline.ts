/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isQuotePacked, isRenotePacked } from '@/misc/is-renote.js';
import type { Packed } from '@/misc/json-schema.js';
import {
	filterNoteForStreamingHidingForApi,
	populateMyReactionForApi,
	type ApiNoteDependencies,
} from '@/server/rest/note/note.js';
import {
	isNoteMutedOrBlockedForStream,
	isNoteVisibleForMeForStream,
	type StreamChannelDefinition,
} from '../channel.js';

export const honoStreamChannelHomeTimeline: StreamChannelDefinition<ApiNoteDependencies> = {
	shouldShare: false,
	requireCredential: true,
	kind: 'read:account',
	init: async (deps, ctx, params) => {
		if (!ctx.user) return false;
		const user = ctx.user;

		const withRenotes = !!(params['withRenotes'] ?? true);
		const withFiles = !!(params['withFiles'] ?? false);

		const handler = async (note: Packed<'Note'>) => {
			const isMe = user.id === note.userId;

			if (withFiles && (note.fileIds == null || note.fileIds.length === 0)) return;

			if (note.channelId) {
				if (!ctx.followingChannels.has(note.channelId)) {
					return;
				}
			} else {
				if (!isMe && !Object.hasOwn(ctx.following, note.userId)) return;
			}

			if (!isNoteVisibleForMeForStream(ctx, note)) return;

			if (note.reply) {
				const reply = note.reply;
				if (ctx.following[note.userId]?.withReplies) {
					// withReplies で返信を含めても、返信先の followers 公開範囲は越えない。
					if (
						reply.visibility === 'followers' &&
						!Object.hasOwn(ctx.following, reply.userId) &&
						reply.userId !== user.id
					)
						return;
				} else {
					// withReplies 無効時も、自分宛て・自分の返信・投稿者の自己返信は含める。
					if (reply.userId !== user.id && !isMe && reply.userId !== note.userId) return;
				}
			}

			if (isRenotePacked(note) && !isQuotePacked(note) && note.renote) {
				if (!withRenotes) return;
				if (note.renote.reply) {
					const reply = note.renote.reply;
					// リノート経由でも返信先の followers 公開範囲は越えない。
					if (
						reply.visibility === 'followers' &&
						!Object.hasOwn(ctx.following, reply.userId) &&
						reply.userId !== user.id
					)
						return;
				}
			}

			if (isNoteMutedOrBlockedForStream(ctx, note)) return;

			const filtered = await filterNoteForStreamingHidingForApi(deps, note, user.id);
			if (!filtered) return;

			if (isRenotePacked(filtered) && !isQuotePacked(filtered)) {
				if (filtered.renote && Object.keys(filtered.renote.reactions).length > 0) {
					filtered.renote.myReaction = await populateMyReactionForApi(
						deps,
						{
							id: filtered.renote.id,
							reactions: filtered.renote.reactions,
							reactionAndUserPairCache: filtered.renote.reactionAndUserPairCache ?? [],
						},
						user.id,
					);
				}
			}

			ctx.send('note', filtered);
		};

		ctx.subscriber.on('notesStream', handler);

		return {
			dispose: () => {
				ctx.subscriber.off('notesStream', handler);
			},
		};
	},
};
