/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { MiMeta } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { IdService } from '@/core/IdService.js';
import { FanoutTimelineService } from '@/core/FanoutTimelineService.js';
import { ChannelMutingService } from '@/core/ChannelMutingService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { fetchPublicRoleByIdFromDatabase } from '@/core/RoleStore.js';
import { listFilteredTimelineNotesByIdsFromDatabase } from '@/core/NoteStore.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['role', 'notes'],

	requireCredential: true,
	kind: 'read:account',

	errors: {
		noSuchRole: {
			message: 'No such role.',
			code: 'NO_SUCH_ROLE',
			id: 'eb70323a-df61-4dd4-ad90-89c83c7cf26e',
		},
	},

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		roleId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: ['roleId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		@Inject(DI.meta)
		private instanceMeta: MiMeta,

		private idService: IdService,
		private noteEntityService: NoteEntityService,
		private fanoutTimelineService: FanoutTimelineService,
		private channelMutingService: ChannelMutingService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const untilId = ps.untilId ?? (ps.untilDate ? this.idService.gen(ps.untilDate!) : null);
			const sinceId = ps.sinceId ?? (ps.sinceDate ? this.idService.gen(ps.sinceDate!) : null);

			const role = await fetchPublicRoleByIdFromDatabase(this.db, ps.roleId);

			if (role == null) {
				throw new ApiError(meta.errors.noSuchRole);
			}
			if (!role.isExplorable) {
				return [];
			}

			let noteIds = await this.fanoutTimelineService.get(`roleTimeline:${role.id}`, untilId, sinceId);
			noteIds = noteIds.slice(0, ps.limit);

			if (noteIds.length === 0) {
				return [];
			}

			// -- ミュートされたチャンネル対策
			const mutingChannelIds = await this.channelMutingService
				.list({ requestUserId: me.id }, { idOnly: true })
				.then(x => x.map(x => x.id));

			const notes = await listFilteredTimelineNotesByIdsFromDatabase(this.db, {
				ids: noteIds,
				me,
				blockedHosts: this.instanceMeta.blockedHosts,
				publicOnly: true,
				mutingChannelIds,
			});
			notes.sort((a, b) => a.id > b.id ? -1 : 1);

			return await this.noteEntityService.packMany(notes, me);
		});
	}
}
