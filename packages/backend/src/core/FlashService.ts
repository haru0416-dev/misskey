/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { MiUser, type FlashsRepository } from '@/models/_.js';
import { QueryService } from '@/core/QueryService.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { listFlashLikesByUserIdFromDatabase } from '@/core/FlashLikeStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { IdService } from '@/core/IdService.js';

/**
 * MisskeyPlay関係のService
 */
@Injectable()
export class FlashService {
	constructor(
		@Inject(DI.flashsRepository)
		private flashRepository: FlashsRepository,

		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private idService: IdService,
		private queryService: QueryService,
	) {
	}

	/**
	 * 人気のあるPlay一覧を取得する.
	 */
	public async featured(opts?: { offset?: number, limit: number }) {
		const builder = this.flashRepository.createQueryBuilder('flash')
			.andWhere('flash.likedCount > 0')
			.andWhere('flash.visibility = :visibility', { visibility: 'public' })
			.addOrderBy('flash.likedCount', 'DESC')
			.addOrderBy('flash.updatedAt', 'DESC')
			.addOrderBy('flash.id', 'DESC');

		if (opts?.offset) {
			builder.skip(opts.offset);
		}

		builder.take(opts?.limit ?? 10);

		return await builder.getMany();
	}

	public async myLikes(meId: MiUser['id'], opts: { sinceId?: string, untilId?: string, sinceDate?: number, untilDate?: number, limit?: number, search?: string | null }) {
		let sinceId: string | null = null;
		let untilId: string | null = null;
		let order: 'asc' | 'desc' = 'desc';

		if (opts.sinceId && opts.untilId) {
			sinceId = opts.sinceId;
			untilId = opts.untilId;
		} else if (opts.sinceId) {
			sinceId = opts.sinceId;
			order = 'asc';
		} else if (opts.untilId) {
			untilId = opts.untilId;
		} else if (opts.sinceDate && opts.untilDate) {
			sinceId = this.idService.gen(opts.sinceDate);
			untilId = this.idService.gen(opts.untilDate);
		} else if (opts.sinceDate) {
			sinceId = this.idService.gen(opts.sinceDate);
			order = 'asc';
		} else if (opts.untilDate) {
			untilId = this.idService.gen(opts.untilDate);
		}

		return await listFlashLikesByUserIdFromDatabase(this.drizzle, meId, {
			limit: opts.limit ?? 10,
			order,
			sinceId,
			untilId,
			search: opts.search,
		});
	}

	public async search(searchQuery: string, opts: { sinceId?: string, untilId?: string, sinceDate?: number, untilDate?: number, limit?: number }) {
		const query = this.queryService.makePaginationQuery(this.flashRepository.createQueryBuilder('flash'), opts.sinceId, opts.untilId, opts.sinceDate, opts.untilDate)
			.andWhere('flash.visibility = \'public\'');

		for (const word of searchQuery.trim().split(' ')) {
			query.andWhere(new Brackets(qb => {
				qb.orWhere('flash.title ILIKE :search', { search: `%${sqlLikeEscape(word)}%` });
				qb.orWhere('flash.summary ILIKE :search', { search: `%${sqlLikeEscape(word)}%` });
			}));
		}

		const result = await query
			.limit(opts.limit)
			.getMany();

		return result;
	}
}
