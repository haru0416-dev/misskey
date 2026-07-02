/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { MiUser } from '@/models/_.js';
import { listFlashLikesByUserIdFromDatabase } from '@/core/FlashLikeStore.js';
import {
	listFeaturedFlashsFromDatabase,
	listFlashsWithPaginationFromDatabase,
	resolveFlashPagination,
} from '@/core/FlashStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { IdService } from '@/core/IdService.js';

/**
 * MisskeyPlay関係のService
 */
@Injectable()
export class FlashService {
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private idService: IdService,
	) {
	}

	/**
	 * 人気のあるPlay一覧を取得する.
	 */
	public async featured(opts?: { offset?: number, limit: number }) {
		return await listFeaturedFlashsFromDatabase(this.drizzle, {
			offset: opts?.offset,
			limit: opts?.limit ?? 10,
		});
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
		const pagination = resolveFlashPagination(this.idService, opts);

		return await listFlashsWithPaginationFromDatabase(this.drizzle, {
			visibility: 'public',
			searchQuery,
			limit: opts.limit,
			...pagination,
		});
	}
}
