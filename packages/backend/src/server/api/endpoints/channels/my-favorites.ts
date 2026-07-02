/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChannelEntityService } from '@/core/entities/ChannelEntityService.js';
import { DI } from '@/di-symbols.js';
import { fetchFavoriteChannelIdsFromDatabase } from '@/core/ChannelFavoriteStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiChannel } from '@/models/Channel.js';
import { listChannelsByIdsFromDatabase } from '@/core/ChannelStore.js';

export const meta = {
	tags: ['channels', 'account'],

	requireCredential: true,

	kind: 'read:channels',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Channel',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private channelEntityService: ChannelEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const channelIds = await fetchFavoriteChannelIdsFromDatabase(this.drizzle, me.id);
			if (channelIds.length === 0) {
				return [];
			}

			const channelById = await listChannelsByIdsFromDatabase(this.drizzle, channelIds)
				.then(channels => new Map(channels.map(channel => [channel.id, channel])));

			const channels = channelIds
				.map(id => channelById.get(id))
				.filter((channel): channel is MiChannel => channel != null);

			return await Promise.all(channels.map(channel => this.channelEntityService.pack(channel, me)));
		});
	}
}
