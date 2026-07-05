/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { isQuotePacked, isRenotePacked } from '@/misc/is-renote.js';
import type { Packed } from '@/misc/json-schema.js';
import { filterNoteForStreamingHidingForHonoApi, populateMyReactionForHonoApi, type HonoApiNoteDependencies } from '../../rest/note.js';
import { isNoteMutedOrBlockedForHonoStream, isNoteVisibleForMeForHonoStream, type HonoStreamChannelDefinition } from '../channel.js';

/** HashtagChannel 相当。 */
export const honoStreamChannelHashtag: HonoStreamChannelDefinition<HonoApiNoteDependencies> = {
	shouldShare: false,
	requireCredential: false,
	kind: null,
	init: async (deps, ctx, params) => {
		if (!Array.isArray(params.q)) return false;
		if (!params.q.every((x): x is string[] => (
			Array.isArray(x) &&
			x.length >= 1 &&
			x.every(y => typeof y === 'string')
		))) return false;
		const q = params.q as string[][];

		const handler = async (note: Packed<'Note'>) => {
			const noteTags = note.tags ? note.tags.map((t: string) => t.toLowerCase()) : [];
			const matched = q.some(tags => tags.every(tag => noteTags.includes(normalizeForSearch(tag))));
			if (!matched) return;

			if (!isNoteVisibleForMeForHonoStream(ctx, note)) return;
			if ((note.user as { requireSigninToViewContents?: boolean }).requireSigninToViewContents && ctx.user == null) return;
			if (note.renote && (note.renote.user as { requireSigninToViewContents?: boolean }).requireSigninToViewContents && ctx.user == null) return;
			if (note.reply && (note.reply.user as { requireSigninToViewContents?: boolean }).requireSigninToViewContents && ctx.user == null) return;
			if (isNoteMutedOrBlockedForHonoStream(ctx, note)) return;

			const filtered = await filterNoteForStreamingHidingForHonoApi(deps, note, ctx.user?.id ?? null);
			if (!filtered) return;

			if (ctx.user) {
				if (isRenotePacked(filtered) && !isQuotePacked(filtered)) {
					if (filtered.renote && Object.keys(filtered.renote.reactions).length > 0) {
						filtered.renote.myReaction = await populateMyReactionForHonoApi(deps, {
							id: filtered.renote.id,
							reactions: filtered.renote.reactions,
							reactionAndUserPairCache: filtered.renote.reactionAndUserPairCache ?? [],
						}, ctx.user.id);
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
