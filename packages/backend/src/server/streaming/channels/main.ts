/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isInstanceMuted, isUserFromMutedInstance } from '@/misc/is-instance-muted.js';
import type { JsonValue } from '@/misc/json-value.js';
import type { Packed } from '@/misc/json-schema.js';
import { packNoteForHonoApi, type HonoApiNoteDependencies } from '../../rest/note.js';
import { isNoteMutedOrBlockedForHonoStream, isNoteVisibleForMeForHonoStream, type HonoStreamChannelDefinition } from '../channel.js';

type MainStreamNotificationBody = {
	userId?: string;
	note?: { id: string; isHidden?: boolean } & Record<string, unknown>;
} & Record<string, unknown>;

export const honoStreamChannelMain: HonoStreamChannelDefinition<HonoApiNoteDependencies> = {
	shouldShare: true,
	requireCredential: true,
	kind: 'read:account',
	init: async (deps, ctx) => {
		if (!ctx.user) return false;
		const user = ctx.user;

		const handler = async (data: { type: string; body: JsonValue }) => {
			switch (data.type) {
				case 'notification': {
					const body = data.body as MainStreamNotificationBody;
					// Ignore notifications from instances the user has muted
					if (isUserFromMutedInstance(body as Packed<'Notification'>, ctx.userMutedInstances)) return;
					if (body.userId && ctx.userIdsWhoMeMuting.has(body.userId)) return;

					if (body.note && body.note.isHidden) {
						const note = await packNoteForHonoApi(deps, body.note.id, user, { detail: true });
						data = { type: data.type, body: { ...body, note } };
					}
					break;
				}
				case 'mention': {
					const note = data.body as Packed<'Note'>;
					if (isInstanceMuted(note, ctx.userMutedInstances)) return;
					if (!isNoteVisibleForMeForHonoStream(ctx, note)) return;
					if (isNoteMutedOrBlockedForHonoStream(ctx, note)) return;
					if (note.isHidden) {
						const packed = await packNoteForHonoApi(deps, note.id, user, { detail: true });
						data = { type: data.type, body: packed as unknown as JsonValue };
					}
					break;
				}
			}

			ctx.send(data.type, data.body);
		};

		ctx.subscriber.on(`mainStream:${user.id}`, handler);

		return {
			dispose: () => {
				ctx.subscriber.off(`mainStream:${user.id}`, handler);
			},
		};
	},
};
