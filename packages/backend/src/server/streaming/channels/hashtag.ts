/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { normalizeForSearch } from '@/misc/normalize-for-search.js';
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

export const honoStreamChannelHashtag: StreamChannelDefinition<ApiNoteDependencies> = {
	shouldShare: false,
	requireCredential: false,
	kind: null,
	init: async (deps, ctx, params) => {
		const query = params['q'];
		if (!Array.isArray(query)) return false;
		if (!query.every((x): x is string[] => Array.isArray(x) && x.length >= 1 && x.every((y) => typeof y === 'string')))
			return false;
		const q = query;

		const handler = async (note: Packed<'Note'>) => {
			const noteTags = note.tags ? note.tags.map((t: string) => t.toLowerCase()) : [];
			const matched = q.some((tags) => tags.every((tag) => noteTags.includes(normalizeForSearch(tag))));
			if (!matched) return;

			if (!isNoteVisibleForMeForStream(ctx, note)) return;
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
