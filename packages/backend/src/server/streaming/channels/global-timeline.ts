/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isQuotePacked, isRenotePacked } from '@/misc/is-renote.js';
import type { Packed } from '@/misc/json-schema.js';
import type { ApiNoteDependencies } from '@/server/rest/note/note.js';
import { getApiRolePolicies } from '@/server/rest/role/role-policy.js';
import type { ApiRolePolicyDependencies } from '@/server/rest/role/role-policy.js';
import { isNoteMutedOrBlockedForStream, requiresSigninForStream, sendNoteToStream } from '../channel.js';
import type { StreamChannelDefinition } from '../channel.js';

export const honoStreamChannelGlobalTimeline: StreamChannelDefinition<ApiNoteDependencies & ApiRolePolicyDependencies> =
	{
		shouldShare: false,
		requireCredential: false,
		kind: null,
		init: async (deps, ctx, params) => {
			const policies = await getApiRolePolicies(deps, ctx.user ?? null);
			if (!policies.gtlAvailable) {
				return;
			}

			const withRenotes = !!(params['withRenotes'] ?? true);
			const withFiles = !!(params['withFiles'] ?? false);

			const handler = async (note: Packed<'Note'>) => {
				if (withFiles && (note.fileIds == null || note.fileIds.length === 0)) {
					return;
				}

				if (note.visibility !== 'public') {
					return;
				}
				if (note.channelId != null) {
					return;
				}
				if (requiresSigninForStream(ctx, note)) {
					return;
				}

				if (isRenotePacked(note) && !isQuotePacked(note) && !withRenotes) {
					return;
				}

				if (isNoteMutedOrBlockedForStream(ctx, note)) {
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
