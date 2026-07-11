/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fetchRoleByIdFromDatabase } from '@/core/RoleStore.js';
import { isQuotePacked, isRenotePacked } from '@/misc/is-renote.js';
import type { JsonValue } from '@/misc/json-value.js';
import type { Packed } from '@/misc/json-schema.js';
import { filterNoteForStreamingHidingForHonoApi, populateMyReactionForHonoApi, type HonoApiNoteDependencies } from '../../rest/note.js';
import { isNoteMutedOrBlockedForHonoStream, type HonoStreamChannelDefinition } from '../channel.js';

async function isRoleExplorableForHonoStream(deps: { db: HonoApiNoteDependencies['db'] }, roleId: string): Promise<boolean> {
	const role = await fetchRoleByIdFromDatabase(deps.db, roleId);
	return role?.isExplorable ?? false;
}

export const honoStreamChannelRoleTimeline: HonoStreamChannelDefinition<HonoApiNoteDependencies> = {
	shouldShare: false,
	requireCredential: false,
	kind: null,
	init: async (deps, ctx, params) => {
		if (typeof params.roleId !== 'string') return;
		const roleId = params.roleId;

		const handler = async (data: { type: string; body: JsonValue }) => {
			if (data.type === 'note') {
				const note = data.body as unknown as Packed<'Note'>;

				if (!(await isRoleExplorableForHonoStream(deps, roleId))) return;
				if (note.visibility !== 'public') return;
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
			} else {
				ctx.send(data.type, data.body);
			}
		};

		ctx.subscriber.on(`roleTimelineStream:${roleId}`, handler);

		return {
			dispose: () => {
				ctx.subscriber.off(`roleTimelineStream:${roleId}`, handler);
			},
		};
	},
};
