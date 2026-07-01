/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { PagesRepository } from '@/models/_.js';
import { PageLikeEntityService } from '@/core/entities/PageLikeEntityService.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { listPageLikesByUserIdFromDatabase } from '@/core/PageLikeStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export const meta = {
	tags: ['account', 'pages'],

	requireCredential: true,

	kind: 'read:page-likes',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			properties: {
				id: {
					type: 'string',
					optional: false, nullable: false,
					format: 'id',
				},
				page: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Page',
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
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
		@Inject(DI.pagesRepository)
		private pagesRepository: PagesRepository,

		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private pageLikeEntityService: PageLikeEntityService,
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

			const likes = await listPageLikesByUserIdFromDatabase(this.drizzle, me.id, {
				limit: ps.limit,
				order,
				sinceId,
				untilId,
			});

			if (likes.length === 0) {
				return [];
			}

			const pageIds = likes.map(like => like.pageId);
			const pageById = await this.pagesRepository.findBy({ id: In(pageIds) })
				.then(pages => new Map(pages.map(page => [page.id, page])));
			const likesWithPages = likes.map(like => ({
				...like,
				page: pageById.get(like.pageId) ?? null,
			}));

			return this.pageLikeEntityService.packMany(likesWithPages, me);
		});
	}
}
