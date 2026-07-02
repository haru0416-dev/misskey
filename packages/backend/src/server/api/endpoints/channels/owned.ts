/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChannelEntityService } from '@/core/entities/ChannelEntityService.js';
import { DI } from '@/di-symbols.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { IdService } from '@/core/IdService.js';
import { listOwnedChannelsFromDatabase, resolveChannelPagination } from '@/core/ChannelStore.js';

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
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 5 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private channelEntityService: ChannelEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const channels = await listOwnedChannelsFromDatabase(this.db, me.id, {
				...resolveChannelPagination(this.idService, ps),
				limit: ps.limit,
			});

			return await Promise.all(channels.map(x => this.channelEntityService.pack(x, me)));
		});
	}
}
