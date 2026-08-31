/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isInstanceMuted } from '@/misc/is-instance-muted.js';
import { isQuotePacked, isRenotePacked } from '@/misc/is-renote.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import type { Packed } from '@/misc/json-schema.js';
import {
	filterNoteForStreamingHidingForApi,
	populateMyReactionForApi,
	type ApiNoteDependencies,
} from '@/server/rest/note/note.js';
import { isNoteVisibleForMeForStream, type StreamChannelContext, type StreamChannelDefinition } from '../channel.js';

function isNoteMutedOrBlockedForChannelChannel(
	ctx: StreamChannelContext,
	channelId: string,
	note: Packed<'Note'>,
): boolean {
	if (isInstanceMuted(note, ctx.userMutedInstances)) return true;
	if (isUserRelated(note, ctx.userIdsWhoMeMuting)) return true;
	if (isUserRelated(note, ctx.userIdsWhoBlockingMe)) return true;
	if (isRenotePacked(note) && !isQuotePacked(note) && ctx.userIdsWhoMeMutingRenotes.has(note.user.id)) return true;

	// 閲覧中のチャンネル自体はミュート対象外だが、別チャンネルのリノートは除外する。
	if (
		note.renote &&
		note.renote.channelId !== channelId &&
		note.renote.channelId &&
		ctx.mutingChannels.has(note.renote.channelId)
	) {
		return true;
	}

	return false;
}

export const honoStreamChannelChannel: StreamChannelDefinition<ApiNoteDependencies> = {
	shouldShare: false,
	requireCredential: false,
	kind: null,
	init: async (deps, ctx, params) => {
		if (typeof params['channelId'] !== 'string') return;
		const channelId = params['channelId'];

		const handler = async (note: Packed<'Note'>) => {
			if (note.channelId !== channelId) return;

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

			if (!isNoteVisibleForMeForStream(ctx, note)) return;
			if (isNoteMutedOrBlockedForChannelChannel(ctx, channelId, note)) return;

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
