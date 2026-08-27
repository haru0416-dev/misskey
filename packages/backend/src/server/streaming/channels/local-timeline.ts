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
import { getApiRolePolicies, type ApiRolePolicyDependencies } from '@/server/rest/role/role-policy.js';
import { isNoteMutedOrBlockedForStream, type StreamChannelDefinition } from '../channel.js';

export const honoStreamChannelLocalTimeline: StreamChannelDefinition<ApiNoteDependencies & ApiRolePolicyDependencies> =
	{
		shouldShare: false,
		requireCredential: false,
		kind: null,
		init: async (deps, ctx, params) => {
			const policies = await getApiRolePolicies(deps, ctx.user ?? null);
			if (!policies.ltlAvailable) return;

			const withRenotes = !!(params['withRenotes'] ?? true);
			const withReplies = !!(params['withReplies'] ?? false);
			const withFiles = !!(params['withFiles'] ?? false);

			const handler = async (note: Packed<'Note'>) => {
				if (withFiles && (note.fileIds == null || note.fileIds.length === 0)) return;

				if (note.user.host !== null) return;
				if (note.visibility !== 'public') return;
				if (note.channelId != null) return;
				if ((note.user as { requireSigninToViewContents?: boolean }).requireSigninToViewContents && ctx.user == null)
					return;
				if (
					note.renote &&
					(note.renote.user as { requireSigninToViewContents?: boolean }).requireSigninToViewContents &&
					ctx.user == null
				)
					return;
				if (
					note.reply &&
					(note.reply.user as { requireSigninToViewContents?: boolean }).requireSigninToViewContents &&
					ctx.user == null
				)
					return;

				// 関係ない返信は除外
				if (note.reply && ctx.user && !ctx.following[note.userId]?.withReplies && !withReplies) {
					const reply = note.reply;
					// 「チャンネル接続主への返信」でもなければ、「チャンネル接続主が行った返信」でもなければ、「投稿者の投稿者自身への返信」でもない場合
					if (reply.userId !== ctx.user.id && note.userId !== ctx.user.id && reply.userId !== note.userId) return;
				}

				if (isRenotePacked(note) && !isQuotePacked(note) && !withRenotes) return;

				if (isNoteMutedOrBlockedForStream(ctx, note)) return;

				const filtered = await filterNoteForStreamingHidingForApi(deps, note, ctx.user?.id ?? null);
				if (!filtered) return;

				if (ctx.user) {
					if (isRenotePacked(filtered) && !isQuotePacked(filtered)) {
						if (filtered.renote && Object.keys(filtered.renote.reactions).length > 0) {
							filtered.renote.myReaction = await populateMyReactionForApi(
								deps,
								{
									id: filtered.renote.id,
									reactions: filtered.renote.reactions,
									reactionAndUserPairCache: filtered.renote.reactionAndUserPairCache ?? [],
								},
								ctx.user.id,
							);
						}
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
