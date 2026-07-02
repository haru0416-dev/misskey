/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ChannelMutingService } from '@/core/ChannelMutingService.js';
import { ApiError } from '@/server/api/error.js';
import { fetchChannelByIdFromDatabase } from '@/core/ChannelStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export const meta = {
	tags: ['channels', 'mute'],

	requireCredential: true,
	prohibitMoved: true,

	kind: 'write:channels',

	errors: {
		noSuchChannel: {
			message: 'No such Channel.',
			code: 'NO_SUCH_CHANNEL',
			id: 'e7998769-6e94-d9c2-6b8f-94a527314aba',
		},

		notMuting: {
			message: 'You are not muting that channel.',
			code: 'NOT_MUTING_CHANNEL',
			id: '14d55962-6ea8-d990-1333-d6bef78dc2ab',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		channelId: { type: 'string', format: 'misskey:id' },
	},
	required: ['channelId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private channelMutingService: ChannelMutingService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// Check if exists the channel
			const targetChannel = await fetchChannelByIdFromDatabase(this.drizzle, ps.channelId);
			if (!targetChannel) {
				throw new ApiError(meta.errors.noSuchChannel);
			}

			// Check muting
			const exist = await this.channelMutingService.isMuted({
				requestUserId: me.id,
				targetChannelId: targetChannel.id,
			});
			if (!exist) {
				throw new ApiError(meta.errors.notMuting);
			}

			await this.channelMutingService.unmute({
				requestUserId: me.id,
				targetChannelId: targetChannel.id,
			});
		});
	}
}
