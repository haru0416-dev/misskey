/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { PageEntityService } from '@/core/entities/PageEntityService.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { listPagesByUserIdWithPaginationFromDatabase, resolvePagePagination } from '@/core/PageStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export const meta = {
	tags: ['users', 'pages'],

	description: 'Show all pages this user created.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Page',
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
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private pageEntityService: PageEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const { sinceId, untilId, order } = resolvePagePagination(this.idService, ps);

			const pages = await listPagesByUserIdWithPaginationFromDatabase(this.drizzle, ps.userId, {
				limit: ps.limit,
				order,
				sinceId,
				untilId,
				publicOnly: true,
			});

			return await this.pageEntityService.packMany(pages);
		});
	}
}
