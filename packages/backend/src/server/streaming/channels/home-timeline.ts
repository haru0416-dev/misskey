/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isQuotePacked, isRenotePacked } from '@/misc/is-renote.js';
import type { Packed } from '@/misc/json-schema.js';
import { filterNoteForStreamingHidingForHonoApi, populateMyReactionForHonoApi, type HonoApiNoteDependencies } from '../../rest/note.js';
import { isNoteMutedOrBlockedForHonoStream, isNoteVisibleForMeForHonoStream, type HonoStreamChannelDefinition } from '../channel.js';

export const honoStreamChannelHomeTimeline: HonoStreamChannelDefinition<HonoApiNoteDependencies> = {
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
				// そのチャンネルをフォローしていない
				if (!ctx.followingChannels.has(note.channelId)) {
					return;
				}
			} else {
				// その投稿のユーザーをフォローしていなかったら弾く
				if (!isMe && !Object.hasOwn(ctx.following, note.userId)) return;
			}

			if (!isNoteVisibleForMeForHonoStream(ctx, note)) return;

			if (note.reply) {
				const reply = note.reply;
				if (ctx.following[note.userId]?.withReplies) {
					// 自分のフォローしていないユーザーの visibility: followers な投稿への返信は弾く
					if (reply.visibility === 'followers' && !Object.hasOwn(ctx.following, reply.userId) && reply.userId !== user.id) return;
				} else {
					// 「チャンネル接続主への返信」でもなければ、「チャンネル接続主が行った返信」でもなければ、「投稿者の投稿者自身への返信」でもない場合
					if (reply.userId !== user.id && !isMe && reply.userId !== note.userId) return;
				}
			}

			// 純粋なリノート（引用リノートでないリノート）の場合
			if (isRenotePacked(note) && !isQuotePacked(note) && note.renote) {
				if (!withRenotes) return;
				if (note.renote.reply) {
					const reply = note.renote.reply;
					// 自分のフォローしていないユーザーの visibility: followers な投稿への返信のリノートは弾く
					if (reply.visibility === 'followers' && !Object.hasOwn(ctx.following, reply.userId) && reply.userId !== user.id) return;
				}
			}

			if (isNoteMutedOrBlockedForHonoStream(ctx, note)) return;

			const filtered = await filterNoteForStreamingHidingForHonoApi(deps, note, user.id);
			if (!filtered) return;

			if (isRenotePacked(filtered) && !isQuotePacked(filtered)) {
				if (filtered.renote && Object.keys(filtered.renote.reactions).length > 0) {
					filtered.renote.myReaction = await populateMyReactionForHonoApi(deps, {
						id: filtered.renote.id,
						reactions: filtered.renote.reactions,
						reactionAndUserPairCache: filtered.renote.reactionAndUserPairCache ?? [],
					}, user.id);
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
