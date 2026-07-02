/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MutingEntityService } from '@/core/entities/MutingEntityService.js';
import { DI } from '@/di-symbols.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { IdService } from '@/core/IdService.js';
import { listMutingsByMuterIdWithPaginationFromDatabase, resolveMutingPagination } from '@/core/MutingStore.js';

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
			ref: 'Muting',
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
		private db: MiDrizzleDatabase,

		private mutingEntityService: MutingEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const mutings = await listMutingsByMuterIdWithPaginationFromDatabase(this.db, me.id, {
				...resolveMutingPagination(this.idService, ps),
				limit: ps.limit,
			});

			return await this.mutingEntityService.packMany(mutings, me);
		});
	}
}
