/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isQuotePacked, isRenotePacked } from '@/misc/is-renote.js';
import type { Packed } from '@/misc/json-schema.js';
import { filterNoteForStreamingHidingForHonoApi, populateMyReactionForHonoApi, type HonoApiNoteDependencies } from '../../rest/note.js';
import { getHonoApiRolePolicies, type HonoApiRolePolicyDependencies } from '../../rest/role-policy.js';
import { isNoteMutedOrBlockedForHonoStream, type HonoStreamChannelDefinition } from '../channel.js';

export const honoStreamChannelGlobalTimeline: HonoStreamChannelDefinition<HonoApiNoteDependencies & HonoApiRolePolicyDependencies> = {
	shouldShare: false,
	requireCredential: false,
	kind: null,
	init: async (deps, ctx, params) => {
		const policies = await getHonoApiRolePolicies(deps, ctx.user ?? null);
		if (!policies.gtlAvailable) return;

		const withRenotes = !!(params.withRenotes ?? true);
		const withFiles = !!(params.withFiles ?? false);

		const handler = async (note: Packed<'Note'>) => {
			if (withFiles && (note.fileIds == null || note.fileIds.length === 0)) return;

			if (note.visibility !== 'public') return;
			if (note.channelId != null) return;
			if ((note.user as { requireSigninToViewContents?: boolean }).requireSigninToViewContents && ctx.user == null) return;
			if (note.renote && (note.renote.user as { requireSigninToViewContents?: boolean }).requireSigninToViewContents && ctx.user == null) return;
			if (note.reply && (note.reply.user as { requireSigninToViewContents?: boolean }).requireSigninToViewContents && ctx.user == null) return;

			if (isRenotePacked(note) && !isQuotePacked(note) && !withRenotes) return;

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
