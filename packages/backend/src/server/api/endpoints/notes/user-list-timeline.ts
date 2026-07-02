/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MiMeta } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import ActiveUsersChart from '@/core/chart/charts/active-users.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import type { MiLocalUser } from '@/models/User.js';
import { FanoutTimelineEndpointService } from '@/core/FanoutTimelineEndpointService.js';
import { ChannelMutingService } from '@/core/ChannelMutingService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { fetchUserListByIdAndUserIdFromDatabase } from '@/core/UserListStore.js';
import { listUserListTimelineNotesFromDatabase } from '@/core/NoteStore.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['notes', 'lists'],

	requireCredential: true,
	kind: 'read:account',

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
		noSuchList: {
			message: 'No such list.',
			code: 'NO_SUCH_LIST',
			id: '8fb1fbd5-e476-4c37-9fb0-43d55b63a2ff',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		listId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		allowPartial: { type: 'boolean', default: false }, // true is recommended but for compatibility false by default
		includeMyRenotes: { type: 'boolean', default: true },
		includeRenotedMyNotes: { type: 'boolean', default: true },
		includeLocalRenotes: { type: 'boolean', default: true },
		withRenotes: { type: 'boolean', default: true },
		withFiles: {
			type: 'boolean',
			default: false,
			description: 'Only show notes that have attached files.',
		},
	},
	required: ['listId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private noteEntityService: NoteEntityService,
		private activeUsersChart: ActiveUsersChart,
		private idService: IdService,
		private fanoutTimelineEndpointService: FanoutTimelineEndpointService,
		private channelMutingService: ChannelMutingService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const untilId = ps.untilId ?? (ps.untilDate ? this.idService.gen(ps.untilDate!) : null);
			const sinceId = ps.sinceId ?? (ps.sinceDate ? this.idService.gen(ps.sinceDate!) : null);

			const list = await fetchUserListByIdAndUserIdFromDatabase(this.db, ps.listId, me.id);

			if (list == null) {
				throw new ApiError(meta.errors.noSuchList);
			}

			if (!this.serverSettings.enableFanoutTimeline) {
				const timeline = await this.getFromDb(list.id, {
					untilId,
					sinceId,
					limit: ps.limit,
					includeMyRenotes: ps.includeMyRenotes,
					includeRenotedMyNotes: ps.includeRenotedMyNotes,
					includeLocalRenotes: ps.includeLocalRenotes,
					withFiles: ps.withFiles,
					withRenotes: ps.withRenotes,
				}, me);

				this.activeUsersChart.read(me);

				return await this.noteEntityService.packMany(timeline, me);
			}

			const timeline = await this.fanoutTimelineEndpointService.timeline({
				untilId,
				sinceId,
				limit: ps.limit,
				allowPartial: ps.allowPartial,
				me,
				useDbFallback: this.serverSettings.enableFanoutTimelineDbFallback,
				redisTimelines: ps.withFiles ? [`userListTimelineWithFiles:${list.id}`] : [`userListTimeline:${list.id}`],
				alwaysIncludeMyNotes: true,
				excludePureRenotes: !ps.withRenotes,
				dbFallback: async (untilId, sinceId, limit) => await this.getFromDb(list.id, {
					untilId,
					sinceId,
					limit,
					includeMyRenotes: ps.includeMyRenotes,
					includeRenotedMyNotes: ps.includeRenotedMyNotes,
					includeLocalRenotes: ps.includeLocalRenotes,
					withFiles: ps.withFiles,
					withRenotes: ps.withRenotes,
				}, me),
			});

			this.activeUsersChart.read(me);

			return timeline;
		});
	}

	private async getFromDb(listId: string, ps: {
		untilId: string | null,
		sinceId: string | null,
		limit: number,
		includeMyRenotes: boolean,
		includeRenotedMyNotes: boolean,
		includeLocalRenotes: boolean,
		withFiles: boolean,
		withRenotes: boolean,
	}, me: MiLocalUser) {
		//#region Construct query
		// -- ミュートされたチャンネルのリノート対策
		const mutedChannelIds = await this.channelMutingService
			.list({ requestUserId: me.id }, { idOnly: true })
			.then(x => x.map(x => x.id));

		const notes = await listUserListTimelineNotesFromDatabase(this.db, {
			listId,
			me,
			mutedChannelIds,
			limit: ps.limit,
			sinceId: ps.sinceId,
			untilId: ps.untilId,
			includeMyRenotes: ps.includeMyRenotes,
			includeRenotedMyNotes: ps.includeRenotedMyNotes,
			includeLocalRenotes: ps.includeLocalRenotes,
			withRenotes: ps.withRenotes,
			withFiles: ps.withFiles,
			blockedHosts: this.serverSettings.blockedHosts,
		});
		//#endregion

		return notes;
	}
}
