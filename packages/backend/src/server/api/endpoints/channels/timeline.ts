/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { MiMeta } from '@/models/_.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import ActiveUsersChart from '@/core/chart/charts/active-users.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { FanoutTimelineEndpointService } from '@/core/FanoutTimelineEndpointService.js';
import type { MiLocalUser } from '@/models/User.js';
import { ChannelMutingService } from '@/core/ChannelMutingService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { fetchChannelByIdFromDatabase } from '@/core/ChannelStore.js';
import { listChannelTimelineNotesFromDatabase } from '@/core/NoteStore.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes', 'channels'],

	requireCredential: false,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
		},
	},

	errors: {
		noSuchChannel: {
			message: 'No such channel.',
			code: 'NO_SUCH_CHANNEL',
			id: '4d0eeeba-a02c-4c3c-9966-ef60d38d2e7f',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		channelId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		allowPartial: { type: 'boolean', default: false }, // true is recommended but for compatibility false by default
	},
	required: ['channelId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private idService: IdService,
		private noteEntityService: NoteEntityService,
		private fanoutTimelineEndpointService: FanoutTimelineEndpointService,
		private activeUsersChart: ActiveUsersChart,
		private channelMutingService: ChannelMutingService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const untilId = ps.untilId ?? (ps.untilDate ? this.idService.gen(ps.untilDate!) : null);
			const sinceId = ps.sinceId ?? (ps.sinceDate ? this.idService.gen(ps.sinceDate!) : null);

			const channel = await fetchChannelByIdFromDatabase(this.db, ps.channelId);

			if (channel == null) {
				throw new ApiError(meta.errors.noSuchChannel);
			}

			if (me) this.activeUsersChart.read(me);

			if (!this.serverSettings.enableFanoutTimeline) {
				return await this.noteEntityService.packMany(await this.getFromDb({ untilId, sinceId, limit: ps.limit, channelId: channel.id }, me), me);
			}

			return await this.fanoutTimelineEndpointService.timeline({
				untilId,
				sinceId,
				limit: ps.limit,
				allowPartial: ps.allowPartial,
				me,
				useDbFallback: true,
				redisTimelines: [`channelTimeline:${channel.id}`],
				excludePureRenotes: false,
				ignoreAuthorChannelFromMute: true,
				dbFallback: async (untilId, sinceId, limit) => {
					return await this.getFromDb({ untilId, sinceId, limit, channelId: channel.id }, me);
				},
			});
		});
	}

	private async getFromDb(ps: {
		untilId: string | null,
		sinceId: string | null,
		limit: number,
		channelId: string
	}, me: MiLocalUser | null) {
		//#region fallback to database
		let mutingChannelIds: string[] = [];
		if (me) {
			mutingChannelIds = await this.channelMutingService
				.list({ requestUserId: me.id }, { idOnly: true })
				.then(x => x.map(x => x.id).filter(x => x !== ps.channelId));
		}
		//#endregion

		return await listChannelTimelineNotesFromDatabase(this.db, {
			channelId: ps.channelId,
			limit: ps.limit,
			sinceId: ps.sinceId,
			untilId: ps.untilId,
			me,
			blockedHosts: this.serverSettings.blockedHosts,
			mutedChannelIds: mutingChannelIds,
		});
	}
}
