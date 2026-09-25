/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fetchRoleByIdFromDatabase } from '@/core/role/RoleStore.js';
import type { JsonValue } from '@/misc/json-value.js';
import type { Packed } from '@/misc/json-schema.js';
import type { ApiNoteDependencies } from '@/server/rest/note/note.js';
import { isNoteMutedOrBlockedForStream, requiresSigninForStream, sendNoteToStream } from '../channel.js';
import type { StreamChannelDefinition } from '../channel.js';

async function isRoleExplorableForStream(deps: { db: ApiNoteDependencies['db'] }, roleId: string): Promise<boolean> {
	const role = await fetchRoleByIdFromDatabase(deps.db, roleId);
	return role?.isExplorable ?? false;
}

export const honoStreamChannelRoleTimeline: StreamChannelDefinition<ApiNoteDependencies> = {
	shouldShare: false,
	requireCredential: false,
	kind: null,
	init: async (deps, ctx, params) => {
		if (typeof params['roleId'] !== 'string') {
			return;
		}
		const roleId = params['roleId'];

		const handler = async (data: { type: string; body: JsonValue }) => {
			if (data.type === 'note') {
				const note = data.body as unknown as Packed<'Note'>;

				if (!(await isRoleExplorableForStream(deps, roleId))) {
					return;
				}
				if (note.visibility !== 'public') {
					return;
				}
				if (requiresSigninForStream(ctx, note)) {
					return;
				}

				if (isNoteMutedOrBlockedForStream(ctx, note)) {
					return;
				}

				await sendNoteToStream(deps, ctx, note);
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
