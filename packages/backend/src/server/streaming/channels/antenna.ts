/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { antennaExistsForUserFromDatabase } from '@/core/antenna/AntennaStore.js';
import { isQuotePacked, isRenotePacked } from '@/misc/is-renote.js';
import type { JsonValue } from '@/misc/json-value.js';
import {
	filterNoteForStreamingHidingForApi,
	packNoteForApi,
	populateMyReactionForApi,
	type ApiNoteDependencies,
} from '@/server/rest/note/note.js';
import {
	isNoteMutedOrBlockedForStream,
	isNoteVisibleForMeForStream,
	type StreamChannelDefinition,
} from '../channel.js';

export const honoStreamChannelAntenna: StreamChannelDefinition<ApiNoteDependencies> = {
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
				const note = await packNoteForApi(deps, data.body.id, user, { detail: true });

				if (!isNoteVisibleForMeForStream(ctx, note)) return;
				if (isNoteMutedOrBlockedForStream(ctx, note)) return;

				const filtered = await filterNoteForStreamingHidingForApi(deps, note, user.id);
				if (!filtered) return;

				if (isRenotePacked(filtered) && !isQuotePacked(filtered)) {
					if (filtered.renote && Object.keys(filtered.renote.reactions).length > 0) {
						filtered.renote.myReaction = await populateMyReactionForApi(
							deps,
							{
								id: filtered.renote.id,
								reactions: filtered.renote.reactions,
								reactionAndUserPairCache: filtered.renote.reactionAndUserPairCache ?? [],
							},
							user.id,
						);
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
