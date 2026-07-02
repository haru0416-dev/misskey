/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { RenoteMutingEntityService } from '@/core/entities/RenoteMutingEntityService.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { listRenoteMutingsByMuterIdFromDatabase } from '@/core/RenoteMutingStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,

	kind: 'read:mutes',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'RenoteMuting',
		},
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
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private renoteMutingEntityService: RenoteMutingEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			let sinceId: string | null = null;
			let untilId: string | null = null;
			let order: 'asc' | 'desc' = 'desc';

			if (ps.sinceId && ps.untilId) {
				sinceId = ps.sinceId;
				untilId = ps.untilId;
			} else if (ps.sinceId) {
				sinceId = ps.sinceId;
				order = 'asc';
			} else if (ps.untilId) {
				untilId = ps.untilId;
			} else if (ps.sinceDate && ps.untilDate) {
				sinceId = this.idService.gen(ps.sinceDate);
				untilId = this.idService.gen(ps.untilDate);
			} else if (ps.sinceDate) {
				sinceId = this.idService.gen(ps.sinceDate);
				order = 'asc';
			} else if (ps.untilDate) {
				untilId = this.idService.gen(ps.untilDate);
			}

			const mutings = await listRenoteMutingsByMuterIdFromDatabase(this.drizzle, me.id, {
				limit: ps.limit,
				order,
				sinceId,
				untilId,
			});

			return await this.renoteMutingEntityService.packMany(mutings, me);
		});
	}
}
