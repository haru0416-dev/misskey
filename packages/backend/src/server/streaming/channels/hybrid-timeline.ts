/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isQuotePacked, isRenotePacked } from '@/misc/is-renote.js';
import type { Packed } from '@/misc/json-schema.js';
import { filterNoteForStreamingHidingForHonoApi, populateMyReactionForHonoApi, type HonoApiNoteDependencies } from '../../rest/note.js';
import { getHonoApiRolePolicies, type HonoApiRolePolicyDependencies } from '../../rest/role-policy.js';
import { isNoteMutedOrBlockedForHonoStream, isNoteVisibleForMeForHonoStream, type HonoStreamChannelDefinition } from '../channel.js';

export const honoStreamChannelHybridTimeline: HonoStreamChannelDefinition<HonoApiNoteDependencies & HonoApiRolePolicyDependencies> = {
	shouldShare: false,
	requireCredential: true,
	kind: 'read:account',
	init: async (deps, ctx, params) => {
		if (!ctx.user) return false;
		const user = ctx.user;

		const policies = await getHonoApiRolePolicies(deps, user);
		if (!policies.ltlAvailable) return;

		const withRenotes = !!(params['withRenotes'] ?? true);
		const withReplies = !!(params['withReplies'] ?? false);
		const withFiles = !!(params['withFiles'] ?? false);

		const handler = async (note: Packed<'Note'>) => {
			const isMe = user.id === note.userId;

			if (withFiles && (note.fileIds == null || note.fileIds.length === 0)) return;

			if (!note.channelId) {
				// 以下の条件に該当するノートのみ後続処理に通す（ので、以下のif文は該当しないノートをすべて弾くようにする）
				// - 自分自身の投稿
				// - その投稿のユーザーをフォローしている
				// - 全体公開のローカルの投稿
				if (!(
					isMe ||
					Object.hasOwn(ctx.following, note.userId) ||
					(note.user.host == null && note.visibility === 'public')
				)) {
					return;
				}
			} else {
				// 以下の条件に該当するノートのみ後続処理に通す（ので、以下のif文は該当しないノートをすべて弾くようにする）
				// - フォローしているチャンネルの投稿
				if (!ctx.followingChannels.has(note.channelId)) {
					return;
				}
			}

			if (!isNoteVisibleForMeForHonoStream(ctx, note)) return;
			if (isNoteMutedOrBlockedForHonoStream(ctx, note)) return;

			if (note.reply) {
				const reply = note.reply;
				if ((ctx.following[note.userId]?.withReplies ?? false) || withReplies) {
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
