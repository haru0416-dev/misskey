/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { IdService } from '@/core/IdService.js';
import { FlashEntityService } from '@/core/entities/FlashEntityService.js';
import { listFlashsWithPaginationFromDatabase, resolveFlashPagination } from '@/core/FlashStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['users', 'flashs'],

	description: 'Show all flashs this user created.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Flash',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: ['userId'],
} as const;
 
@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> {
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private flashEntityService: FlashEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const pagination = resolveFlashPagination(this.idService, ps);
			const flashs = await listFlashsWithPaginationFromDatabase(this.db, {
				userId: ps.userId,
				visibility: 'public',
				limit: ps.limit,
				...pagination,
			});

			return await this.flashEntityService.packMany(flashs);
		});
	}
}
