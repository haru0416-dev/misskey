/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isInstanceMuted } from '@/misc/is-instance-muted.js';
import { isQuotePacked, isRenotePacked } from '@/misc/is-renote.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import type { Packed } from '@/misc/json-schema.js';
import type { ApiNoteDependencies } from '@/server/rest/note/note.js';
import { isNoteVisibleForMeForStream, requiresSigninForStream, sendNoteToStream } from '../channel.js';
import type { StreamChannelContext, StreamChannelDefinition } from '../channel.js';

function isNoteMutedOrBlockedForChannelChannel(
	ctx: StreamChannelContext,
	channelId: string,
	note: Packed<'Note'>,
): boolean {
	if (isInstanceMuted(note, ctx.userMutedInstances)) {
		return true;
	}
	if (isUserRelated(note, ctx.userIdsWhoMeMuting)) {
		return true;
	}
	if (isUserRelated(note, ctx.userIdsWhoBlockingMe)) {
		return true;
	}
	if (isRenotePacked(note) && !isQuotePacked(note) && ctx.userIdsWhoMeMutingRenotes.has(note.user.id)) {
		return true;
	}

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
		if (typeof params['channelId'] !== 'string') {
			return;
		}
		const channelId = params['channelId'];

		const handler = async (note: Packed<'Note'>) => {
			if (note.channelId !== channelId) {
				return;
			}

			if (requiresSigninForStream(ctx, note)) {
				return;
			}

			if (!isNoteVisibleForMeForStream(ctx, note)) {
				return;
			}
			if (isNoteMutedOrBlockedForChannelChannel(ctx, channelId, note)) {
				return;
			}

			await sendNoteToStream(deps, ctx, note);
		};

		ctx.subscriber.on('notesStream', handler);

		return {
			dispose: () => {
				ctx.subscriber.off('notesStream', handler);
			},
		};
	},
};
