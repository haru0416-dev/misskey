/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { NoteDraftEntityService } from '@/core/entities/NoteDraftEntityService.js';
import {
	listNoteDraftsByUserIdFromDatabase,
	resolveNoteDraftPagination,
} from '@/core/NoteDraftStore.js';
import { IdService } from '@/core/IdService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export const meta = {
	tags: ['notes', 'drafts'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'read:account',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'NoteDraft',
		},
	},

	errors: {
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		scheduled: { type: 'boolean', nullable: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private idService: IdService,
		private noteDraftEntityService: NoteDraftEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const drafts = await listNoteDraftsByUserIdFromDatabase(this.db, me.id, {
				limit: ps.limit,
				scheduled: ps.scheduled,
				...resolveNoteDraftPagination(this.idService, ps),
			});

			return await this.noteDraftEntityService.packMany(drafts, me);
		});
	}
}
