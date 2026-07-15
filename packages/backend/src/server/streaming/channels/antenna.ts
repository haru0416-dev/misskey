/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { antennaExistsForUserFromDatabase } from '@/core/AntennaStore.js';
import { isQuotePacked, isRenotePacked } from '@/misc/is-renote.js';
import type { JsonValue } from '@/misc/json-value.js';
import { filterNoteForStreamingHidingForHonoApi, packNoteForHonoApi, populateMyReactionForHonoApi, type HonoApiNoteDependencies } from '../../rest/note.js';
import { isNoteMutedOrBlockedForHonoStream, isNoteVisibleForMeForHonoStream, type HonoStreamChannelDefinition } from '../channel.js';

export const honoStreamChannelAntenna: HonoStreamChannelDefinition<HonoApiNoteDependencies> = {
	shouldShare: false,
	requireCredential: true,
	kind: 'read:account',
	init: async (deps, ctx, params) => {
		if (typeof params['antennaId'] !== 'string') return false;
		if (!ctx.user) return false;
		const user = ctx.user;
		const antennaId = params['antennaId'];

		const antennaExists = await antennaExistsForUserFromDatabase(deps.db, antennaId, user.id);
		if (!antennaExists) return false;

		const handler = async (data: { type: string; body: JsonValue & { id?: string } }) => {
			if (data.type === 'note' && typeof data.body.id === 'string') {
				const note = await packNoteForHonoApi(deps, data.body.id, user, { detail: true });

				if (!isNoteVisibleForMeForHonoStream(ctx, note)) return;
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
			} else {
				ctx.send(data.type, data.body);
			}
		};

		ctx.subscriber.on(`antennaStream:${antennaId}`, handler);

		return {
			dispose: () => {
				ctx.subscriber.off(`antennaStream:${antennaId}`, handler);
			},
		};
	},
};
