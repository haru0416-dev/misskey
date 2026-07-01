/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { listAdsFromDatabase } from '@/core/AdStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:ad',
	res: {
		type: 'array',
		optional: false,
		nullable: false,
		items: {
			type: 'object',
			optional: false,
			nullable: false,
			ref: 'Ad',
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
		publishing: { type: 'boolean', default: null, nullable: true },
	},
	required: [],
} as const;

type AdListParams = {
	limit: number;
	sinceId?: string | null;
	untilId?: string | null;
	sinceDate?: number | null;
	untilDate?: number | null;
	publishing?: boolean | null;
};

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const { sinceId, untilId } = this.resolvePagination(ps);
			const ads = await listAdsFromDatabase(this.drizzle, {
				limit: ps.limit,
				sinceId,
				untilId,
				publishing: ps.publishing,
			});

			return ads.map(ad => ({
				id: ad.id,
				expiresAt: ad.expiresAt.toISOString(),
				startsAt: ad.startsAt.toISOString(),
				dayOfWeek: ad.dayOfWeek,
				isSensitive: ad.isSensitive,
				url: ad.url,
				imageUrl: ad.imageUrl,
				memo: ad.memo,
				place: ad.place,
				priority: ad.priority,
				ratio: ad.ratio,
			}));
		});
	}

	private resolvePagination(ps: AdListParams) {
		if (ps.sinceId && ps.untilId) {
			return { sinceId: ps.sinceId, untilId: ps.untilId };
		} else if (ps.sinceId) {
			return { sinceId: ps.sinceId, untilId: null };
		} else if (ps.untilId) {
			return { sinceId: null, untilId: ps.untilId };
		} else if (ps.sinceDate && ps.untilDate) {
			return { sinceId: this.idService.gen(ps.sinceDate), untilId: this.idService.gen(ps.untilDate) };
		} else if (ps.sinceDate) {
			return { sinceId: this.idService.gen(ps.sinceDate), untilId: null };
		} else if (ps.untilDate) {
			return { sinceId: null, untilId: this.idService.gen(ps.untilDate) };
		} else {
			return { sinceId: null, untilId: null };
		}
	}
}
